"""
GST OCR Pipeline — Qwen2.5-VL-7B  |  v3 — Purchase Registry + Database
Extracts structured invoice data from scanned/uploaded PDF/image/photo
invoices and converts it into the standard GST Purchase Registry format:

    GSTIN of supplier *, Trade/Legal name, Type of inward supplies *,
    Document type *, Document number *, Document date *,
    Taxable value (₹) *, Integrated tax (₹), Central tax (₹),
    State/ UT tax (₹), Cess (₹)

Each invoice can contain multiple products (line items), and multiple
invoices accumulate per supplier per month. Every processed invoice is
saved as a JSON record and persisted to a local SQLite database
(gst_purchase_registry.db) so the reconciliation engine can read the
purchase registry directly via get_purchase_registry() instead of
re-parsing files.

v3 additions (on top of v2 speed fixes):
  - Accepts scanned/uploaded invoices straight from memory (bytes or a
    file-like upload object), not just files already saved to disk
  - Batch mode: point the CLI (or process_invoices_folder()) at an
    "invoices/" folder of PDFs/JPEGs/PNGs — every file is parsed, saved to
    the SQLite DB, and written out as JSON (per-invoice + a combined file)
  - Extracts supplier trade/legal name + cess (previously missing)
  - to_purchase_registry(): maps extraction output → official header format
  - SQLite storage layer: init_db / save_to_purchase_registry /
    get_purchase_registry / export_registry_to_json
  - Document type normalization (Invoice / Credit Note / Debit Note / Bill of Entry)
  - Type-of-inward-supply heuristic classification (Inputs / Capital Goods / Input Services)
  - Header vs. line-item total cross-checks → needs_review flag for the reconciliation engine
  - Idempotent upserts: re-processing the same invoice updates, not duplicates

v2 speed improvements (ported from herbarium_vlm_pipeline_v3.2):
  - Hard-resize images to MAX_SIDE=896 BEFORE processor sees them
    → prevents massive tile grids from high-res phone photos / scanned PDFs
  - img.draft() hint for JPEG: free decode at reduced resolution
  - max_pixels + min_pixels passed to AutoProcessor → second pixel budget lock
  - PDF rendered at 150 DPI instead of 200 DPI (~44% fewer pixels, sufficient for OCR)
  - max_new_tokens 900 → 600 (covers invoices with up to ~10 line items; saves ~0.5s vs 900)
  - bfloat16 instead of float16 — more stable on RTX 40xx, same speed
  - padding=False in processor() call — avoids wasted pad tokens
  - SDPA kernel priority (Flash → Efficient → Math) via context manager in generate()
  - torch.compile(mode="reduce-overhead") on Linux for ~20-30% generation speedup
  - DEVICE cached once at model load instead of accessed per-call
  - _merge_pages() now also resizes the canvas before returning
"""

from __future__ import annotations

import io
import re
import sys
import json
import base64
import hashlib
import sqlite3
import argparse
import platform
from pathlib import Path
from datetime import datetime

from PIL import Image
from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor, BitsAndBytesConfig
import torch
from torch.backends.cuda import sdp_kernel, SDPBackend

# Reconfigure stdout/stderr to UTF-8 on import to prevent encoding errors on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# 1. PIXEL BUDGET & RESIZE CONSTANTS  (ported from herbarium v3.2)
# ══════════════════════════════════════════════════════════════════════════════

# Phone photos / scanned PDFs can be 12–48 MP.  process_vision_info tiles from
# raw PIL dimensions BEFORE max_pixels applies, creating huge grids → slow prefill.
# Fix: hard-resize to MAX_SIDE before the processor ever sees the image.
#
# 896×896 = 802,816 px  →  well under 512*28*28 = 401,408 at typical invoice aspect ratios
# Raise to 1024 if you find text is unreadable; lower to 768 to save more VRAM.
MAX_SIDE = 896

# Processor pixel budget — two locks on tile count
INFER_MAX_PIXELS = 512 * 28 * 28   # 401,408 px  (safe for 8 GB with 4-bit)
INFER_MIN_PIXELS =  32 * 28 * 28   # 25,088 px   (avoids forced upscaling of tiny crops)

# Token budget for generation.
# A GST invoice with 1-2 line items is ~200-250 tokens.
# A real invoice with 8-10 line items can reach 500-600 tokens.
# 600 is a safe ceiling that covers most invoices while saving ~1s vs 900.
# Raise to 900 only if you see truncated output on dense multi-item invoices.
MAX_NEW_TOKENS = 600

# SDPA backend priority — avoids slow MATH fallback
_SDP_BACKENDS = [SDPBackend.FLASH_ATTENTION, SDPBackend.EFFICIENT_ATTENTION, SDPBackend.MATH]


# ══════════════════════════════════════════════════════════════════════════════
# 2. MODEL LOADER (singleton)
# ══════════════════════════════════════════════════════════════════════════════

_model = _processor = _device = None


def load_model(model_id: str = "Qwen/Qwen2.5-VL-7B-Instruct"):
    global _model, _processor, _device
    if _model is not None:
        return _model, _processor

    print("Loading processor ...")
    _processor = AutoProcessor.from_pretrained(
        model_id,
        max_pixels=INFER_MAX_PIXELS,
        min_pixels=INFER_MIN_PIXELS,
    )

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,   # FIX: bfloat16 more stable than float16 on RTX 40xx
        bnb_4bit_use_double_quant=True,
    )

    print("Loading model (4-bit, ~2-3 min on first run) ...")
    _model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map="auto",          # FIX: "auto" is safer than hard "cuda" on multi-GPU setups
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    )
    _model.eval()

    # torch.compile: ~20-30% generation speedup on Linux; skip silently on Windows
    # (triton — compile's backend — is not officially supported on Windows)
    if platform.system() != "Windows" and hasattr(torch, "compile"):
        try:
            _model = torch.compile(_model, mode="reduce-overhead")
            print("[OK] torch.compile enabled (first invoice will be slow - warmup)")
        except Exception as e:
            print(f"torch.compile skipped: {e}")
    else:
        print("[INFO] torch.compile skipped on Windows - SDPA kernel handles speedup instead")

    # Cache device once — avoids repeated attribute lookup per invoice
    _device = next(_model.parameters()).device
    print(f"Model on device: {_device}")

    return _model, _processor

# ══════════════════════════════════════════════════════════════════════════════
# 3. IMAGE UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def _resize_for_vlm(img: Image.Image) -> Image.Image:
    """Hard-resize to MAX_SIDE before process_vision_info sees the image.

    WHY: phone photos are 12-48 MP; scanned PDFs at 200 DPI can be 1700×2200+.
    process_vision_info tiles from raw PIL dimensions BEFORE the max_pixels cap
    applies, creating huge grids → long prefill.  thumbnail() caps the longest
    side while preserving aspect ratio and never upscaling small images.
    """
    # draft() is a free JPEG decode hint — tells the decoder to skip pixels we'll
    # discard.  No-op for PNG/TIFF, so safe to call unconditionally.
    img.draft("RGB", (MAX_SIDE, MAX_SIDE))
    img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    return img


def _coerce_to_bytes_and_name(file_source, filename_hint: str = None):
    """Normalize a path / raw bytes / file-like upload object into
    (bytes_or_None, name, is_path).

    Lets the pipeline accept invoices that arrive three ways:
      - already saved to disk                → str / Path
      - scanned or uploaded straight into memory, never written to disk
        → raw bytes, or a file-like object (io.BytesIO, Flask FileStorage,
        FastAPI UploadFile.file, a scanner SDK's output stream, etc.)
    filename_hint (e.g. "invoice.pdf") tells us the file type when there's
    no path to read a suffix from.
    """
    if isinstance(file_source, (str, Path)):
        return None, str(file_source), True

    if isinstance(file_source, (bytes, bytearray)):
        name = filename_hint
        if not name:
            raise ValueError(
                "filename_hint is required when passing raw bytes (e.g. "
                "filename_hint='invoice.pdf') so the pipeline knows the file type."
            )
        return bytes(file_source), name, False

    if hasattr(file_source, "read"):  # file-like: BytesIO, FileStorage, UploadFile.file...
        name = filename_hint or getattr(file_source, "filename", None) or getattr(file_source, "name", None)
        if not name:
            raise ValueError(
                "filename_hint is required for file-like objects that don't expose "
                "a .filename/.name attribute."
            )
        return file_source.read(), name, False

    raise TypeError(f"Unsupported invoice source type: {type(file_source)}")


def _file_sha256(file_source, filename_hint: str = None) -> tuple[str, bytes | None]:
    """Return (sha256_hex, materialized_bytes_or_None) for any invoice source.

    For on-disk paths the file is read in 64 KB chunks (no full load into RAM).
    For streams the bytes are read once and returned so the caller can forward
    them to load_images() without seeking — streams cannot be rewound.
    """
    if isinstance(file_source, (str, Path)):
        h = hashlib.sha256()
        with open(str(file_source), "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
        return h.hexdigest(), None          # path still on disk; pass as-is

    if isinstance(file_source, (bytes, bytearray)):
        data = bytes(file_source)
        return hashlib.sha256(data).hexdigest(), data

    if hasattr(file_source, "read"):        # BytesIO / Flask FileStorage / etc.
        data = file_source.read()
        return hashlib.sha256(data).hexdigest(), data

    raise TypeError(f"Unsupported invoice source type: {type(file_source)}")


def load_images(file_source, filename_hint: str = None) -> list[Image.Image]:
    """Return list of pre-resized PIL images from a PDF/image path, OR from a
    scanned/uploaded invoice still in memory (raw bytes / file-like object —
    pass filename_hint so we know whether it's a PDF or an image).
    Uses pymupdf (fitz) — no poppler required on Windows.
    """
    data, name, is_path = _coerce_to_bytes_and_name(file_source, filename_hint)
    suffix = Path(name).suffix.lower()

    if suffix == ".pdf":
        import fitz  # pymupdf: pip install pymupdf
        doc = fitz.open(str(name)) if is_path else fitz.open(stream=data, filetype="pdf")
        images = []
        for page in doc:
            # FIX: 150 DPI instead of 200 DPI — ~44% fewer pixels, still fine for OCR.
            # 200 DPI was overkill; invoice text reads cleanly at 150 DPI.
            mat = fitz.Matrix(150 / 72, 150 / 72)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            images.append(_resize_for_vlm(img))
        doc.close()
        return images
    else:
        src = name if is_path else io.BytesIO(data)
        return [_resize_for_vlm(Image.open(src))]


# ══════════════════════════════════════════════════════════════════════════════
# 4. PROMPT (token-efficient)
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = (
    "You are a GST invoice parser. "
    "Reply ONLY with a valid JSON object — no markdown, no explanation."
)

USER_PROMPT = """Extract from this invoice image. Return JSON exactly:
{
  "doc_type": "",
  "supplier_gstin": "",
  "supplier_name": "",
  "buyer_gstin": "",
  "invoice_number": "",
  "invoice_date": "",
  "place_of_supply": "",
  "grand_total": "",
  "cgst_amount": "",
  "sgst_amount": "",
  "igst_amount": "",
  "cess_amount": "",
  "taxable_value": "",
  "line_items": [
    {"sr":"","description":"","hsn_code":"","quantity":"","unit":"",
     "rate":"","taxable_amount":"","gst_rate":"","gst_amount":"","total":""}
  ],
  "confidence": {"overall": 0.0}
}
Rules:
- GSTIN: 15-char alphanumeric. Fix common OCR error: digit 0 vs letter O.
- supplier_name: the seller's trade/legal name printed on the invoice (not the buyer's).
- doc_type: one of Tax Invoice / Credit Note / Debit Note / Bill of Supply / Bill of Entry, as printed.
- HSN codes: 4-8 digits only (not PINs/invoice numbers).
- Amounts: include decimals e.g. "1177.50". Use "0.00" if a tax type doesn't apply.
- confidence.overall: your estimate 0-1.
- Dates: read invoice_date ONLY from the printed date field — never infer the year from the
  invoice number (e.g. "INV-2020-..." does NOT mean the date year is 2020). Fix common OCR
  digit confusion in year digits: '6' and '0' look alike in print/scan — if the year ends in
  '0' but a recent year (e.g. 2026) is plausible from context, prefer '6' over '0'.
- Use "" for missing fields, never null."""


# ══════════════════════════════════════════════════════════════════════════════
# 5. INFERENCE
# ══════════════════════════════════════════════════════════════════════════════

def _run_vlm(images: list[Image.Image]) -> str:
    model, processor = load_model()

    # Use first page only (or merge top-2 pages for multi-page invoices)
    img = images[0] if len(images) == 1 else _merge_pages(images[:2])

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "image", "image": img},
                {"type": "text", "text": USER_PROMPT},
            ],
        },
    ]

    text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    # FIX: padding=False — single-image inference has nothing to pad against;
    # padding adds wasted tokens and slows prefill.
    inputs = processor(
        text=[text], images=[img], padding=False, return_tensors="pt"
    ).to(_device)

    with torch.no_grad():
        # FIX: SDPA kernel priority — ensures Flash or Efficient path is used,
        # avoids falling back to the slow MATH kernel silently.
        with sdp_kernel(
            enable_flash=True,
            enable_math=True,
            enable_mem_efficient=True,
        ):
            out = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,   # FIX: 256 instead of 900
                do_sample=False,
                temperature=None,
                top_p=None,
                use_cache=True,
            )

    # Strip input tokens
    generated = out[0][inputs["input_ids"].shape[1]:]
    return processor.decode(generated, skip_special_tokens=True).strip()


def _merge_pages(pages: list[Image.Image]) -> Image.Image:
    """Stack pages vertically for two-page invoices, then re-cap to MAX_SIDE."""
    w = max(p.width for p in pages)
    h = sum(p.height for p in pages)
    canvas = Image.new("RGB", (w, h), "white")
    y = 0
    for p in pages:
        canvas.paste(p, (0, y))
        y += p.height
    # FIX: merged canvas can exceed MAX_SIDE — resize it too
    return _resize_for_vlm(canvas)


# ══════════════════════════════════════════════════════════════════════════════
# 6. POST-PROCESSING & CLEANING
# ══════════════════════════════════════════════════════════════════════════════

# ── 5a. GSTIN ─────────────────────────────────────────────────────────────────
_GSTIN_RE = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b")

def _fix_gstin_ocr(raw: str) -> str:
    """Fix 0↔O confusion in GSTIN based on positional rules."""
    if not raw or len(raw) != 15:
        return raw
    s = list(raw.upper())
    # pos 0-1: state code — must be digits
    for i in (0, 1):
        if s[i] == "O":
            s[i] = "0"
    # pos 2-6: PAN letters — must be alpha
    for i in range(2, 7):
        if s[i] == "0":
            s[i] = "O"
    # pos 7-10: PAN digits — must be digits
    for i in range(7, 11):
        if s[i] == "O":
            s[i] = "0"
    # pos 11: PAN alpha
    if s[11] == "0":
        s[11] = "O"
    # pos 12: entity number digit
    if s[12] == "O":
        s[12] = "0"
    # pos 13: always Z
    s[13] = "Z"
    # pos 14: checksum — alpha or digit, keep as-is
    return "".join(s)


def _extract_gstin(raw: str) -> str:
    if not raw:
        return ""
    cleaned = _fix_gstin_ocr(raw.strip().upper().replace(" ", ""))
    if _GSTIN_RE.fullmatch(cleaned):
        return cleaned
    # try to find within a longer string
    m = _GSTIN_RE.search(cleaned)
    return m.group() if m else raw  # return original if no valid match


# ── 5b. HSN filtering ─────────────────────────────────────────────────────────
_HSN_RE = re.compile(r"^\d{4,8}$")
_PINCODE_RE = re.compile(r"^\d{6}$")

# Known GST HSN chapter prefixes (first 2 digits)
_VALID_HSN_CHAPTERS = set(range(1, 100)) - {77}  # 77 unused in GST

def _is_valid_hsn(code: str) -> bool:
    code = code.strip()
    if not _HSN_RE.match(code):
        return False
    if _PINCODE_RE.match(code) and int(code[:2]) > 59:
        return False  # likely a PIN code
    chapter = int(code[:2])
    return chapter in _VALID_HSN_CHAPTERS


def _clean_hsn(code: str) -> str:
    code = re.sub(r"[^0-9]", "", code)
    return code if _is_valid_hsn(code) else ""


# ── 5c. Amount normalization ───────────────────────────────────────────────────
def _norm_amount(val: str) -> str:
    if not val:
        return "0.00"
    val = re.sub(r"[₹,\s]", "", str(val))
    try:
        return f"{float(val):.2f}"
    except ValueError:
        return val


# ── 5d. Date normalization ─────────────────────────────────────────────────────
# GST invoices arrive in dozens of date formats depending on what generated
# them — Tally, Zoho, SAP, regional billing software, handwritten bills,
# scanned old invoices, or an Excel/DB export with a full timestamp. Parsing
# is deliberately layered to recognize as many of these as possible:
#   1. A large explicit strptime format list (fast, exact, no ambiguity)
#   2. Light cleanup (ordinal suffixes, weekday prefixes, month-name typos)
#      then the format list again
#   3. dateutil as a catch-all for anything still unrecognized (optional
#      dependency — `pip install python-dateutil` for full coverage; the
#      pipeline still works without it, just with narrower recognition)

try:
    from dateutil import parser as _dateutil_parser
    _HAS_DATEUTIL = True
except ImportError:
    _HAS_DATEUTIL = False

_DATE_FMTS = [
    # ── Day-first numeric (Indian standard — tried first) ──
    "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%d %m %Y",
    "%d-%m-%y", "%d/%m/%y", "%d.%m.%y", "%d %m %y",
    # ── Day-first, named month ──
    "%d-%b-%Y", "%d/%b/%Y", "%d.%b.%Y", "%d %b %Y", "%d %b, %Y",
    "%d-%B-%Y", "%d/%B/%Y", "%d.%B.%Y", "%d %B %Y", "%d %B, %Y",
    "%d-%b-%y", "%d/%b/%y", "%d %b %y", "%d-%B-%y", "%d %B %y",
    # ── Month-first, named month (common from US-style billing software) ──
    "%B %d, %Y", "%B %d %Y", "%b %d, %Y", "%b %d %Y",
    "%B %d, %y", "%b %d, %y", "%b-%d-%Y", "%b/%d/%Y",
    # ── Month-first numeric (US format — tried after day-first numeric) ──
    "%m-%d-%Y", "%m/%d/%Y", "%m.%d.%Y", "%m-%d-%y", "%m/%d/%y",
    # ── Year-first / ISO-style, incl. timestamps (common from Excel/DB exports) ──
    "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M",
    "%Y-%b-%d", "%Y %b %d",
    # ── Compact, no separators ──
    "%Y%m%d", "%d%m%Y",
]

# Ordinal suffixes: "5th", "21st", "3rd June 2026" → "5", "21", "3 June 2026"
_ORDINAL_RE = re.compile(r"\b(\d{1,2})(st|nd|rd|th)\b", re.I)
# Leading day-of-week: "Mon,", "Monday ", "Fri. " → stripped
_WEEKDAY_RE = re.compile(
    r"^\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*,?\s*", re.I
)
# Common month-name spelling variants not recognized by strptime's %b/%B
_MONTH_FIXES = {
    r"\bsept\b": "sep",
}

def _clean_date_string(val: str) -> str:
    s = val.strip()
    s = _WEEKDAY_RE.sub("", s)
    s = _ORDINAL_RE.sub(r"\1", s)
    for pattern, fix in _MONTH_FIXES.items():
        s = re.sub(pattern, fix, s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()


# ── Year plausibility correction ──────────────────────────────────────────────
# VLMs commonly misread "6" as "0" in year digits, turning 2026 → 2020.
# This is made worse when the invoice number itself contains an earlier year
# (e.g. "INV-2020-0019-A"), anchoring the model's prediction.
#
# Strategy: if the parsed year is more than _YEAR_DRIFT years before the
# current year, try individual single-digit OCR swaps on the year string
# (last digit first, since that is where the error almost always occurs).
# Accept the first candidate that falls within _YEAR_DRIFT years of today.

_CURRENT_YEAR: int = datetime.now().year
_YEAR_DRIFT:   int = 5          # tolerate invoices up to 5 years old without correction
# Digit pairs confused in print/scan OCR — tried on each position individually
# (NOT a bulk str.replace — one position at a time avoids cascading changes).
# Ordered by GST-invoice likelihood: 0↔6 is by far the dominant year-digit error.
_OCR_DIGIT_SWAPS = [("0", "6"), ("6", "0"), ("1", "7"), ("7", "1")]


def _correct_year_ocr(dt: datetime) -> datetime:
    """Return *dt* with year corrected if it appears implausibly old.

    Only swaps one digit at a time (last digit first), so it never produces a
    wildly wrong year — the worst case is no correction and a warning fires in
    _validate_record instead.
    """
    if dt.year >= _CURRENT_YEAR - _YEAR_DRIFT:
        return dt  # year is plausible — nothing to do

    year_s = str(dt.year)
    # Iterate positions from right to left: last digit is the most common
    # OCR error site (e.g. 2026 → 2020 because terminal '6' looks like '0').
    for i in range(len(year_s) - 1, -1, -1):
        ch = year_s[i]
        for bad, fix in _OCR_DIGIT_SWAPS:
            if ch != bad:
                continue
            # Swap only this one position
            candidate_year_s = year_s[:i] + fix + year_s[i + 1:]
            try:
                candidate_year = int(candidate_year_s)
            except ValueError:
                continue
            if abs(candidate_year - _CURRENT_YEAR) <= _YEAR_DRIFT:
                try:
                    return dt.replace(year=candidate_year)
                except ValueError:
                    continue  # e.g. Feb-29 in a non-leap corrected year

    return dt  # no single-swap correction found; _validate_record will warn


def _norm_date(val) -> str:
    if not val:
        return ""
    raw = str(val).strip()
    cleaned = _clean_date_string(raw)

    # 1. Explicit format list, tried on the cleaned string first
    for fmt in _DATE_FMTS:
        try:
            return _correct_year_ocr(datetime.strptime(cleaned, fmt)).strftime("%d-%b-%Y")
        except ValueError:
            continue

    # 2. Same list against the untouched raw string, in case cleanup altered
    #    something a format actually needed as-is
    if cleaned != raw:
        for fmt in _DATE_FMTS:
            try:
                return _correct_year_ocr(datetime.strptime(raw, fmt)).strftime("%d-%b-%Y")
            except ValueError:
                continue

    # 3. Catch-all: dateutil recognizes virtually every remaining
    #    human-written or machine-generated date format. dayfirst=True
    #    matches Indian invoice convention for ambiguous numeric dates
    #    (e.g. "03/04/2026" → 3 Apr, not Mar 4). fuzzy=True tolerates
    #    OCR noise like a leftover "Date:" label in the string.
    if _HAS_DATEUTIL:
        try:
            dt = _dateutil_parser.parse(cleaned, dayfirst=True, fuzzy=True)
            return _correct_year_ocr(dt).strftime("%d-%b-%Y")
        except (ValueError, OverflowError, TypeError):
            pass

    return raw  # unparseable — returned as-is so it surfaces in validation/review


# ── 5e. State code normalization ───────────────────────────────────────────────
_STATE_MAP = {
    "01": "Jammu & Kashmir", "07": "Delhi", "09": "Uttar Pradesh",
    "27": "Maharashtra", "29": "Karnataka", "33": "Tamil Nadu",
    "36": "Telangana", "19": "West Bengal", "24": "Gujarat",
    "08": "Rajasthan",
    # extend as needed
}

def _norm_place_of_supply(val: str, supplier_gstin: str = "") -> str:
    if val:
        return val
    if supplier_gstin and len(supplier_gstin) >= 2:
        code = supplier_gstin[:2]
        state = _STATE_MAP.get(code, "")
        return f"{state} ({code})" if state else f"({code})"
    return ""


# ── 5f. Full post-process ──────────────────────────────────────────────────────
def _postprocess(data: dict, source_file: str) -> dict:
    data["source_file"] = Path(source_file).name

    data["supplier_gstin"] = _extract_gstin(data.get("supplier_gstin", ""))
    data["buyer_gstin"]    = _extract_gstin(data.get("buyer_gstin", ""))
    data["supplier_name"]  = (data.get("supplier_name") or "").strip()

    data["invoice_date"] = _norm_date(data.get("invoice_date", ""))

    for key in ("grand_total", "cgst_amount", "sgst_amount",
                "igst_amount", "cess_amount", "taxable_value"):
        data[key] = _norm_amount(data.get(key, ""))

    data["place_of_supply"] = _norm_place_of_supply(
        data.get("place_of_supply", ""), data["supplier_gstin"]
    )

    for item in data.get("line_items", []):
        item["hsn_code"] = _clean_hsn(item.get("hsn_code", ""))
        for k in ("rate", "taxable_amount", "gst_amount", "total"):
            item[k] = _norm_amount(item.get(k, ""))

    return data


# ══════════════════════════════════════════════════════════════════════════════
# 7. PURCHASE REGISTRY — mapping, classification & validation
# ══════════════════════════════════════════════════════════════════════════════
#
# The official Purchase Registry header (one row per document, with its
# products nested as line_items):
#
#   GSTIN of supplier *      Trade/Legal name        Type of inward supplies *
#   Document type *          Document number *       Document date *
#   Taxable value (₹) *      Integrated tax (₹)      Central tax (₹)
#   State/ UT tax (₹)        Cess (₹)
#
# Records use snake_case keys (gstin_of_supplier, trade_legal_name, ...) so
# they're easy to store/query in the database. PURCHASE_REGISTRY_COLUMNS maps
# each key to its exact official header label for display/export.

PURCHASE_REGISTRY_COLUMNS = {
    "gstin_of_supplier":     "GSTIN of supplier *",
    "trade_legal_name":      "Trade/Legal name",
    "type_of_inward_supply": "Type of inward supplies *",
    "document_type":         "Document type *",
    "document_number":       "Document number *",
    "document_date":         "Document date *",
    "taxable_value":         "Taxable value (₹) *",
    "integrated_tax":        "Integrated tax (₹)",
    "central_tax":           "Central tax (₹)",
    "state_ut_tax":          "State/ UT tax (₹)",
    "cess":                  "Cess (₹)",
}


def to_display_headers(record: dict) -> dict:
    """Return a record's header fields keyed by the exact official column
    labels (e.g. "GSTIN of supplier *") — for human review / Excel export."""
    return {label: record.get(key, "") for key, label in PURCHASE_REGISTRY_COLUMNS.items()}


# ── 7a. Document type normalization ────────────────────────────────────────
_DOC_TYPE_PATTERNS = [
    (re.compile(r"credit\s*note", re.I), "Credit Note"),
    (re.compile(r"debit\s*note", re.I), "Debit Note"),
    (re.compile(r"bill\s*of\s*entry", re.I), "Bill of Entry"),
    (re.compile(r"bill\s*of\s*supply", re.I), "Bill of Supply"),
]

def _norm_document_type(raw: str) -> str:
    raw = (raw or "").strip()
    for pattern, label in _DOC_TYPE_PATTERNS:
        if pattern.search(raw):
            return label
    return "Invoice"  # covers Tax Invoice, Retail Invoice, and unrecognized text


# ── 7b. Type of inward supplies — heuristic classification ─────────────────
_SERVICE_KEYWORDS = re.compile(
    r"\b(service|services|consultanc\w*|consulting|professional|rent|rental|"
    r"lease|freight|transport|courier|maintenance|repair|commission|"
    r"subscription|advertis\w*|insurance|legal\s*fees|audit\s*fees|"
    r"software\s*licen[cs]e|royalty)\b", re.I
)
# Machinery, electricals, vehicles, vessels, precision instruments — chapters
# commonly associated with capital equipment rather than consumable inputs.
_CAPITAL_GOODS_HSN_CHAPTERS = {84, 85, 86, 87, 89, 90}

def _classify_inward_supply_type(data: dict) -> str:
    """
    Best-effort classification into Inputs / Capital Goods / Input Services,
    based on line-item HSN chapters and description keywords.

    NOTE: This is a heuristic default, not a statutory determination. Under
    GST, "Capital Goods" depends on how the item is capitalised in the books
    of account — something OCR cannot know. Always let the accountant
    review/override `type_of_inward_supply` (e.g. via the --inward-type CLI
    flag or a direct DB update) before the record is used for filing.
    """
    items = data.get("line_items", [])
    if not items:
        # No line items extracted — typically a service bill billed as a
        # single lump-sum amount (e.g. rent, professional fees).
        return "Input Services"

    descriptions = " ".join(it.get("description", "") for it in items)
    if _SERVICE_KEYWORDS.search(descriptions):
        return "Input Services"

    hsn_chapters = set()
    for it in items:
        hsn = it.get("hsn_code", "")
        if hsn and len(hsn) >= 2 and hsn[:2].isdigit():
            hsn_chapters.add(int(hsn[:2]))

    if hsn_chapters and hsn_chapters.issubset(_CAPITAL_GOODS_HSN_CHAPTERS):
        return "Capital Goods"

    return "Inputs"


# ── 7c. Tax period (for grouping multiple invoices per month) ──────────────
def _derive_return_period(doc_date: str) -> str:
    """Tax period 'MM-YYYY' derived from a normalized document date — used to
    group multiple invoices from the same supplier/month together."""
    if not doc_date:
        return ""
    for fmt in ("%d-%b-%Y", *_DATE_FMTS):
        try:
            return datetime.strptime(doc_date.strip(), fmt).strftime("%m-%Y")
        except ValueError:
            continue
    return ""


# ── 7d. Validation & header/line-item cross-checks ──────────────────────────
def _to_float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _validate_record(data: dict) -> list[str]:
    """Flag missing mandatory (*) fields and header-vs-line-item total
    mismatches, so a human can review before the reconciliation engine
    trusts the record."""
    issues = []

    if not _GSTIN_RE.fullmatch(data.get("supplier_gstin", "") or ""):
        issues.append("GSTIN of supplier is missing or invalid.")
    if not data.get("invoice_number"):
        issues.append("Document number is missing.")
    if not data.get("invoice_date"):
        issues.append("Document date is missing.")
    else:
        # Year plausibility check — warns when _correct_year_ocr couldn't fix it
        # (e.g. the bad digit isn't in _OCR_DIGIT_SWAPS) so a human can review.
        for fmt in ("%d-%b-%Y", *_DATE_FMTS):
            try:
                _yr = datetime.strptime(data["invoice_date"].strip(), fmt).year
                if _yr < _CURRENT_YEAR - _YEAR_DRIFT:
                    issues.append(
                        f"Document date year ({_yr}) is implausibly old — possible OCR "
                        f"digit confusion (e.g. '6' read as '0'). Please verify."
                    )
                break
            except ValueError:
                continue
    if _to_float(data.get("taxable_value")) <= 0:
        issues.append("Taxable value is missing or zero.")

    items = data.get("line_items", [])
    if items:
        item_taxable_sum = sum(_to_float(it.get("taxable_amount")) for it in items)
        header_taxable = _to_float(data.get("taxable_value"))
        if header_taxable and abs(item_taxable_sum - header_taxable) > max(1.0, header_taxable * 0.02):
            issues.append(
                f"Line items taxable value sum ({item_taxable_sum:.2f}) does not match "
                f"header taxable value ({header_taxable:.2f}) — possible OCR error."
            )

        item_gst_sum = sum(_to_float(it.get("gst_amount")) for it in items)
        header_gst = (_to_float(data.get("cgst_amount")) + _to_float(data.get("sgst_amount")) +
                      _to_float(data.get("igst_amount")) + _to_float(data.get("cess_amount")))
        if header_gst and abs(item_gst_sum - header_gst) > max(1.0, header_gst * 0.02):
            issues.append(
                f"Line items GST sum ({item_gst_sum:.2f}) does not match header GST total "
                f"({header_gst:.2f}) — possible OCR error."
            )

    return issues


# ── 7e. Internal extraction schema → Purchase Registry record ──────────────
def to_purchase_registry(data: dict, type_of_inward_supply: str = None) -> dict:
    """
    Convert the internal VLM-extraction schema into a Purchase Registry
    record matching the official header. Multiple products on one invoice
    stay nested under "line_items"; multiple invoices in a month are simply
    multiple records sharing the same `return_period`.
    """
    warnings_list = _validate_record(data)
    record = {
        "gstin_of_supplier":     data.get("supplier_gstin", ""),
        "trade_legal_name":      data.get("supplier_name", ""),
        "type_of_inward_supply": type_of_inward_supply or _classify_inward_supply_type(data),
        "document_type":         _norm_document_type(data.get("doc_type", "")),
        "document_number":       data.get("invoice_number", ""),
        "document_date":         data.get("invoice_date", ""),
        "taxable_value":         data.get("taxable_value", "0.00"),
        "integrated_tax":        data.get("igst_amount", "0.00"),
        "central_tax":           data.get("cgst_amount", "0.00"),
        "state_ut_tax":          data.get("sgst_amount", "0.00"),
        "cess":                  data.get("cess_amount", "0.00"),
        # extra context kept alongside the official header — useful for the
        # reconciliation engine and for audit, even though not part of it:
        "buyer_gstin":     data.get("buyer_gstin", ""),
        "place_of_supply": data.get("place_of_supply", ""),
        "grand_total":     data.get("grand_total", "0.00"),
        "confidence":      data.get("confidence", {"overall": 0.0}),
        "source_file":     data.get("source_file", ""),
        "return_period":   _derive_return_period(data.get("invoice_date", "")),
        "line_items":      data.get("line_items", []),
        "warnings":        warnings_list,
        "extracted_at":    datetime.utcnow().isoformat() + "Z",
    }
    return record


# ══════════════════════════════════════════════════════════════════════════════
# 8. PURCHASE REGISTRY DATABASE (SQLite)
# ══════════════════════════════════════════════════════════════════════════════
#
# One row per document in `purchase_registry` (the official header fields),
# with its products in `purchase_registry_items` (one row per product, FK'd
# back to the document). The reconciliation engine should read from here via
# get_purchase_registry() rather than re-parsing invoice files.

DB_PATH = Path(__file__).resolve().parent / "gst_purchase_registry.db"


def init_db(db_path=DB_PATH) -> sqlite3.Connection:
    """Create the purchase registry tables if they don't exist yet, and
    return an open connection."""
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS purchase_registry (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            gstin_of_supplier     TEXT NOT NULL,
            trade_legal_name      TEXT,
            type_of_inward_supply TEXT,
            document_type         TEXT,
            document_number       TEXT NOT NULL,
            document_date         TEXT,
            taxable_value         REAL DEFAULT 0,
            integrated_tax        REAL DEFAULT 0,
            central_tax           REAL DEFAULT 0,
            state_ut_tax          REAL DEFAULT 0,
            cess                  REAL DEFAULT 0,
            buyer_gstin           TEXT,
            place_of_supply       TEXT,
            grand_total           REAL DEFAULT 0,
            confidence_score      REAL,
            source_file           TEXT,
            return_period         TEXT,
            needs_review          INTEGER DEFAULT 0,
            raw_json              TEXT,
            created_at            TEXT DEFAULT (datetime('now')),
            UNIQUE(gstin_of_supplier, document_number, document_type)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS purchase_registry_items (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_registry_id  INTEGER NOT NULL REFERENCES purchase_registry(id) ON DELETE CASCADE,
            sr_no                 TEXT,
            description           TEXT,
            hsn_code              TEXT,
            quantity              TEXT,
            unit                  TEXT,
            rate                  TEXT,
            taxable_amount        TEXT,
            gst_rate              TEXT,
            gst_amount            TEXT,
            total                 TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pr_gstin  ON purchase_registry(gstin_of_supplier)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pr_period ON purchase_registry(return_period)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS file_hashes (
            sha256               TEXT PRIMARY KEY,
            source_file          TEXT,
            purchase_registry_id INTEGER REFERENCES purchase_registry(id) ON DELETE SET NULL,
            parsed_at            TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_fh_sha256 ON file_hashes(sha256)")
    conn.commit()
    return conn


def save_to_purchase_registry(record: dict, db_path=DB_PATH,
                              update_existing: bool = False) -> int:
    """
    Insert one Purchase Registry record (header + line items) into SQLite.

    Duplicate handling (same GSTIN + document number + document type):
      - update_existing=False (DEFAULT): the record already exists, so it is
        LEFT UNTOUCHED — no update, no duplicate row. The existing row id is
        returned. This is the "don't update if a duplicate is present"
        behaviour: once an invoice is in the registry, re-processing it never
        overwrites the stored data.
      - update_existing=True: the existing row is overwritten with the new
        record (the old upsert behaviour). Use this only when you deliberately
        want a re-scan to replace what's already stored.

    If the record is genuinely new it is always inserted.
    Returns the row id (existing or newly inserted).
    """
    conn = init_db(db_path)
    try:
        confidence = (record.get("confidence") or {}).get("overall")
        warnings_list = record.get("warnings", [])
        needs_review = 1 if (warnings_list or (confidence is not None and confidence < 0.7)) else 0

        params = {
            "gstin_of_supplier":     record.get("gstin_of_supplier", ""),
            "trade_legal_name":      record.get("trade_legal_name", ""),
            "type_of_inward_supply": record.get("type_of_inward_supply", ""),
            "document_type":         record.get("document_type", ""),
            "document_number":       record.get("document_number", ""),
            "document_date":         record.get("document_date", ""),
            "taxable_value":         _to_float(record.get("taxable_value")),
            "integrated_tax":        _to_float(record.get("integrated_tax")),
            "central_tax":           _to_float(record.get("central_tax")),
            "state_ut_tax":          _to_float(record.get("state_ut_tax")),
            "cess":                  _to_float(record.get("cess")),
            "buyer_gstin":           record.get("buyer_gstin", ""),
            "place_of_supply":       record.get("place_of_supply", ""),
            "grand_total":           _to_float(record.get("grand_total")),
            "confidence_score":      confidence,
            "source_file":           record.get("source_file", ""),
            "return_period":         record.get("return_period") or _derive_return_period(record.get("document_date", "")),
            "needs_review":          needs_review,
            "raw_json":              json.dumps(record, ensure_ascii=False),
        }

        existing = conn.execute(
            "SELECT id FROM purchase_registry WHERE gstin_of_supplier=:gstin_of_supplier "
            "AND document_number=:document_number AND document_type=:document_type",
            params,
        ).fetchone()

        if existing:
            registry_id = existing[0]

            # ── Duplicate present: by default do NOT update ──────────────────
            # The invoice is already in the registry. Unless the caller
            # explicitly asks to overwrite, leave the stored data exactly as
            # it is and return the existing id.
            if not update_existing:
                conn.commit()
                return registry_id

            params["id"] = registry_id
            conn.execute("""
                UPDATE purchase_registry SET
                    trade_legal_name=:trade_legal_name,
                    type_of_inward_supply=:type_of_inward_supply,
                    document_date=:document_date,
                    taxable_value=:taxable_value,
                    integrated_tax=:integrated_tax,
                    central_tax=:central_tax,
                    state_ut_tax=:state_ut_tax,
                    cess=:cess,
                    buyer_gstin=:buyer_gstin,
                    place_of_supply=:place_of_supply,
                    grand_total=:grand_total,
                    confidence_score=:confidence_score,
                    source_file=:source_file,
                    return_period=:return_period,
                    needs_review=:needs_review,
                    raw_json=:raw_json
                WHERE id=:id
            """, params)
            conn.execute(
                "DELETE FROM purchase_registry_items WHERE purchase_registry_id=?",
                (registry_id,),
            )
        else:
            cur = conn.execute("""
                INSERT INTO purchase_registry (
                    gstin_of_supplier, trade_legal_name, type_of_inward_supply, document_type,
                    document_number, document_date, taxable_value, integrated_tax, central_tax,
                    state_ut_tax, cess, buyer_gstin, place_of_supply, grand_total,
                    confidence_score, source_file, return_period, needs_review, raw_json
                ) VALUES (
                    :gstin_of_supplier, :trade_legal_name, :type_of_inward_supply, :document_type,
                    :document_number, :document_date, :taxable_value, :integrated_tax, :central_tax,
                    :state_ut_tax, :cess, :buyer_gstin, :place_of_supply, :grand_total,
                    :confidence_score, :source_file, :return_period, :needs_review, :raw_json
                )
            """, params)
            registry_id = cur.lastrowid

        for item in record.get("line_items", []):
            conn.execute("""
                INSERT INTO purchase_registry_items (
                    purchase_registry_id, sr_no, description, hsn_code, quantity, unit,
                    rate, taxable_amount, gst_rate, gst_amount, total
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, (
                registry_id,
                item.get("sr", ""), item.get("description", ""), item.get("hsn_code", ""),
                item.get("quantity", ""), item.get("unit", ""), item.get("rate", ""),
                item.get("taxable_amount", ""), item.get("gst_rate", ""),
                item.get("gst_amount", ""), item.get("total", ""),
            ))

        conn.commit()
        return registry_id
    finally:
        conn.close()


def _get_cached_record(file_hash: str, db_path=DB_PATH) -> dict | None:
    """Return the full Purchase Registry record for a previously seen file hash,
    or None if this hash has never been stored.

    The returned record is augmented with ``"cached": True`` so callers can
    tell it came from the cache rather than a fresh VLM run.
    """
    conn = init_db(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT purchase_registry_id FROM file_hashes WHERE sha256 = ?",
            (file_hash,),
        ).fetchone()
        if row is None or row["purchase_registry_id"] is None:
            return None

        reg = conn.execute(
            "SELECT * FROM purchase_registry WHERE id = ?",
            (row["purchase_registry_id"],),
        ).fetchone()
        if reg is None:
            return None

        record = dict(reg)
        items = conn.execute(
            "SELECT sr_no AS sr, description, hsn_code, quantity, unit, rate, "
            "taxable_amount, gst_rate, gst_amount, total "
            "FROM purchase_registry_items WHERE purchase_registry_id = ?",
            (record["id"],),
        ).fetchall()
        record["line_items"] = [dict(i) for i in items]

        # Unpack raw_json warnings so callers get the full original record shape
        try:
            raw = json.loads(record.get("raw_json") or "{}")
            record.setdefault("warnings", raw.get("warnings", []))
        except (json.JSONDecodeError, TypeError):
            record.setdefault("warnings", [])

        record["cached"] = True
        return record
    finally:
        conn.close()


def _save_file_hash(file_hash: str, source_file: str,
                    registry_id: int, db_path=DB_PATH) -> None:
    """Persist a (sha256, registry_id) mapping so future identical files are
    skipped without re-running the VLM.  Uses INSERT OR IGNORE so re-calling
    with the same hash after a forced re-parse is safe."""
    conn = init_db(db_path)
    try:
        conn.execute(
            "INSERT OR IGNORE INTO file_hashes (sha256, source_file, purchase_registry_id) "
            "VALUES (?, ?, ?)",
            (file_hash, source_file, registry_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_purchase_registry(db_path=DB_PATH, gstin: str = None, return_period: str = None,
                           needs_review_only: bool = False) -> list[dict]:
    """
    Fetch Purchase Registry records (each with its nested multi-product
    line_items) — this is what the reconciliation engine should call instead
    of re-parsing invoice files.

    Args:
        gstin: filter to one supplier GSTIN (optional)
        return_period: filter to one tax period "MM-YYYY" (optional)
        needs_review_only: only return records flagged for human review
    """
    conn = init_db(db_path)
    conn.row_factory = sqlite3.Row
    try:
        query = "SELECT * FROM purchase_registry WHERE 1=1"
        params = {}
        if gstin:
            query += " AND gstin_of_supplier = :gstin"
            params["gstin"] = gstin
        if return_period:
            query += " AND return_period = :period"
            params["period"] = return_period
        if needs_review_only:
            query += " AND needs_review = 1"
        rows = conn.execute(query, params).fetchall()

        results = []
        for row in rows:
            rec = dict(row)
            items = conn.execute(
                "SELECT sr_no, description, hsn_code, quantity, unit, rate, "
                "taxable_amount, gst_rate, gst_amount, total "
                "FROM purchase_registry_items WHERE purchase_registry_id = ?",
                (row["id"],),
            ).fetchall()
            rec["line_items"] = [dict(i) for i in items]
            results.append(rec)
        return results
    finally:
        conn.close()


def load_registry_json(json_path) -> list[dict]:
    """Load purchase registry records from a JSON file written by
    export_registry_to_json() or process_invoices_folder()'s combined
    purchase_registry.json. Returns a list of record dicts (or [] if the
    file is missing or empty)."""
    p = Path(json_path)
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8") or "[]")
    except (json.JSONDecodeError, OSError):
        return []
    # Combined files are a list; a single-invoice file may be one dict.
    if isinstance(data, dict):
        return [data]
    return data if isinstance(data, list) else []


def query_registry(source="db", db_path=DB_PATH, json_path=None,
                   gstin: str = None, return_period: str = None,
                   document_number: str = None, supplier_name: str = None,
                   needs_review_only: bool = False) -> list[dict]:
    """
    Unified query over the purchase registry — works against the SQLite DB,
    a purchase registry JSON file, or both, with the same filters.

    This is the single entry point the reconciliation engine (or any caller)
    can use whether the registry lives in the database or in an exported JSON
    file, without writing separate lookup code for each.

    Args:
        source: where to read from —
            "db"   → query the SQLite DB (default)
            "json" → query a purchase registry JSON file (needs json_path)
            "both" → read from both and merge, de-duplicated on
                     (gstin_of_supplier, document_number, document_type)
        db_path: SQLite DB path (used when source is "db" or "both")
        json_path: JSON file path (required when source is "json" or "both")
        gstin: filter to one supplier GSTIN (matches gstin_of_supplier)
        return_period: filter to one tax period "MM-YYYY"
        document_number: filter to one document/invoice number (exact match)
        supplier_name: case-insensitive substring match on trade/legal name
        needs_review_only: only return records flagged for human review

    Returns:
        list of record dicts (each with nested line_items), filtered.
    """
    def _matches(rec: dict) -> bool:
        if gstin and rec.get("gstin_of_supplier") != gstin:
            return False
        if return_period and rec.get("return_period") != return_period:
            return False
        if document_number and rec.get("document_number") != document_number:
            return False
        if supplier_name:
            name = (rec.get("trade_legal_name") or "").lower()
            if supplier_name.lower() not in name:
                return False
        if needs_review_only and not rec.get("needs_review"):
            return False
        return True

    records: list[dict] = []

    if source in ("db", "both"):
        # Let the DB do the indexed filtering it already supports, then apply
        # the extra (document_number / supplier_name) filters in Python.
        db_records = get_purchase_registry(
            db_path=db_path, gstin=gstin, return_period=return_period,
            needs_review_only=needs_review_only,
        )
        records.extend(r for r in db_records if _matches(r))

    if source in ("json", "both"):
        if not json_path:
            raise ValueError("json_path is required when source is 'json' or 'both'.")
        json_records = load_registry_json(json_path)
        records.extend(r for r in json_records if _matches(r))

    if source == "both":
        # De-duplicate across the two sources on the natural invoice key,
        # keeping the first occurrence (DB rows come first).
        seen, deduped = set(), []
        for r in records:
            key = (r.get("gstin_of_supplier"), r.get("document_number"), r.get("document_type"))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(r)
        records = deduped

    return records


def export_registry_to_json(out_path, db_path=DB_PATH, gstin: str = None,
                             return_period: str = None) -> str:
    """Dump the current Purchase Registry (optionally filtered) to a JSON
    file — for reconciliation engines that read flat files instead of
    querying SQLite directly."""
    records = get_purchase_registry(db_path=db_path, gstin=gstin, return_period=return_period)
    Path(out_path).write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(out_path)


# ══════════════════════════════════════════════════════════════════════════════
# 9. PARSE VLM OUTPUT
# ══════════════════════════════════════════════════════════════════════════════

def _repair_truncated_json(raw: str) -> str:
    """Best-effort repair of JSON truncated mid-output by max_new_tokens.

    Strategy:
      1. Strip any trailing partial key-value pair (last incomplete token).
      2. Close any open string literals.
      3. Close any open arrays and objects from innermost to outermost.

    This handles the most common truncation patterns from VLMs:
      - Cut mid-string:   "sgst_amoun  →  close the string + close object/array
      - Cut mid-value:    "grand_total": "12,800  →  close string then close
      - Cut mid-object:   {"sr":"1","desc  →  close object in line_items array

    Not guaranteed to produce semantically correct JSON — fields present in the
    output will be correct; fields that were being written when truncation hit
    will be dropped or empty.
    """
    s = raw.rstrip()

    # Drop a trailing incomplete key (ends with  "somekey  or  "somekey":  )
    # These can't be closed meaningfully — safer to drop.
    s = re.sub(r',\s*"[^"]*$', "", s)           # dangling key with no value
    s = re.sub(r',\s*"[^"]*":\s*$', "", s)      # key + colon but no value

    # Close an open string value (odd number of unescaped quotes after last '{')
    # Count unescaped double-quotes from the last open-brace forward.
    last_brace = s.rfind("{")
    if last_brace != -1:
        snippet = s[last_brace:]
        # Count quotes not preceded by backslash
        n_quotes = len(re.findall(r'(?<!\\)"', snippet))
        if n_quotes % 2 == 1:
            s += '"'   # close the open string

    # Close open arrays and objects by tracking the nesting stack
    stack = []
    in_string = False
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\" and in_string:
            i += 2      # skip escaped char
            continue
        if c == '"':
            in_string = not in_string
        elif not in_string:
            if c in ("{", "["):
                stack.append("}" if c == "{" else "]")
            elif c in ("}", "]"):
                if stack and stack[-1] == c:
                    stack.pop()
        i += 1

    # Strip trailing comma before we close (invalid JSON)
    s = re.sub(r",\s*$", "", s.rstrip())

    # Close all unclosed structures innermost-first
    s += "".join(reversed(stack))
    return s


def _parse_json(raw: str) -> dict:
    """Parse VLM output to dict.  Handles:
      - markdown code fences  (```json ... ```)
      - leading/trailing prose
      - JSON truncated by max_new_tokens  ← new
    """
    # Strip markdown code fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())

    # 1. Try clean parse first
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # 2. Try extracting the first {...} block (handles leading prose)
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            candidate = m.group()
        # 3. Repair truncated JSON and try again
        repaired = _repair_truncated_json(candidate)
        try:
            result = json.loads(repaired)
            import warnings
            warnings.warn(
                "VLM output was truncated and auto-repaired. "
                "Fields near the truncation point may be missing. "
                f"Consider raising MAX_NEW_TOKENS (currently {MAX_NEW_TOKENS}).",
                RuntimeWarning,
                stacklevel=3,
            )
            return result
        except json.JSONDecodeError:
            pass

    raise ValueError(
        f"Cannot parse VLM output even after repair.\n"
        f"Raw output (first 400 chars):\n{raw[:400]}\n\n"
        f"If output looks correct but truncated, raise MAX_NEW_TOKENS above {MAX_NEW_TOKENS}."
    )


# ══════════════════════════════════════════════════════════════════════════════
# 10. MAIN PIPELINE FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def extract_invoice(file_source, filename_hint: str = None) -> dict:
    """
    OCR extraction entry point. Accepts an invoice that's:
      - on disk                              → str / Path
      - scanned/uploaded straight into memory, never saved to disk
        → raw bytes, or a file-like object (io.BytesIO, Flask FileStorage,
        FastAPI UploadFile.file, ...) — pass filename_hint='invoice.pdf' so
        the pipeline knows whether to treat it as a PDF or an image.

    Returns:
        Internal extraction dict. Pass this to to_purchase_registry() to get
        the official Purchase Registry record, or use
        process_invoice_to_registry() to do both steps (+ DB save) at once.
    """
    images = load_images(file_source, filename_hint)
    raw_output = _run_vlm(images)
    data = _parse_json(raw_output)
    source_name = filename_hint or (file_source if isinstance(file_source, (str, Path)) else "uploaded_invoice")
    data = _postprocess(data, source_name)
    return data


def process_invoice_to_registry(file_source, filename_hint: str = None,
                                 type_of_inward_supply: str = None,
                                 save_to_db: bool = True, db_path=DB_PATH,
                                 skip_if_seen: bool = True,
                                 update_existing: bool = False,
                                 buyer_gstin: str = None) -> dict:
    """
    Full pipeline for one scanned/uploaded invoice:
        invoice (file / bytes / upload stream)
          → [hash check — skips VLM if file was parsed before]
          → OCR extraction
          → Purchase Registry record (multi-product line items, official header fields)
          → SQLite save (idempotent — safe to re-run on the same invoice)

    This is the function a scanning workflow or upload endpoint should call.
    The reconciliation engine should then read the data back via
    get_purchase_registry() rather than re-processing invoice files.

    Args:
        type_of_inward_supply: override the auto-classified "Inputs" /
            "Capital Goods" / "Input Services" if the caller (e.g. an
            accountant's review step) already knows the correct value.
        save_to_db: set False to get the record back without persisting it
            (e.g. for a preview screen before the user confirms).
        skip_if_seen: if True (default) and save_to_db is True, compute a
            SHA-256 of the file bytes before calling the VLM. If a matching
            hash is already in the DB, return the cached record immediately
            without re-parsing. Set False (or use --force on the CLI) to
            force a fresh VLM run even for previously seen files.
        update_existing: if False (default), a record that already exists in
            the registry (same GSTIN + document number + document type) is left
            untouched — duplicates never overwrite stored data. Set True to
            allow a re-scan to overwrite the existing row.
        buyer_gstin: Client GSTIN to associate with this invoice record.
    """
    file_hash = file_data = None

    # ── Deduplication: hash the file BEFORE loading the model ─────────────────
    # Computing a SHA-256 is ~1 ms even for large PDFs; the VLM takes seconds.
    # We skip the model entirely when the file was already parsed.
    if skip_if_seen and save_to_db:
        file_hash, file_data = _file_sha256(file_source, filename_hint)
        cached = _get_cached_record(file_hash, db_path)
        if cached:
            print(f"[SKIP] already parsed (SHA-256 match) -> returning cached record "
                  f"(id={cached.get('id')}, doc={cached.get('document_number', '?')})")
            if buyer_gstin and cached.get("buyer_gstin") != buyer_gstin:
                cached["buyer_gstin"] = buyer_gstin
                save_to_purchase_registry(cached, db_path=db_path, update_existing=True)
            return cached
        # For streams: _file_sha256 consumed the bytes; forward the materialized
        # copy to extract_invoice so we don't try to seek the exhausted stream.
        if file_data is not None:
            file_source = file_data

    raw = extract_invoice(file_source, filename_hint)
    record = to_purchase_registry(raw, type_of_inward_supply=type_of_inward_supply)
    if buyer_gstin:
        record["buyer_gstin"] = buyer_gstin

    if save_to_db:
        record["id"] = save_to_purchase_registry(
            record, db_path=db_path, update_existing=update_existing
        )
        if file_hash:
            _save_file_hash(file_hash, record.get("source_file", ""), record["id"], db_path)

    return record


# Invoice file types recognized when scanning a folder in batch mode.
SUPPORTED_INVOICE_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}


def process_invoices_folder(input_dir: str = "invoices", output_dir: str = "processed_invoices",
                             save_to_db: bool = True, db_path=DB_PATH,
                             type_of_inward_supply: str = None,
                             skip_if_seen: bool = True,
                             update_existing: bool = False) -> dict:
    """
    Batch-process every PDF/JPEG/PNG invoice sitting in `input_dir`:

        invoices/                         (your scanned/uploaded invoice files)
          ├── inv1.pdf
          ├── inv2.jpg
          └── ...
                    │
                    ▼  for each file
        SHA-256 hash check (skip VLM if file was already parsed)
                    │
        OCR extraction → Purchase Registry record (multi-product line items)
                    │
                    ├──→ saved to the SQLite purchase registry DB (idempotent —
                    │    re-running on the same folder won't create duplicates)
                    └──→ written as <name>.json under output_dir/

    A combined `purchase_registry.json` (every record from this run) is also
    written to output_dir/ — that's the JSON file to hand to a reconciliation
    engine that reads flat files; one that queries SQLite directly should use
    get_purchase_registry() instead.

    Args:
        input_dir: folder containing the invoice PDFs/images (default "invoices")
        output_dir: folder where per-invoice + combined JSON output is written
            (default "processed_invoices"; created if it doesn't exist)
        save_to_db: persist each record to the purchase registry DB (default True)
        type_of_inward_supply: override the auto-classification for every
            invoice in this batch; leave None to auto-classify each one
        skip_if_seen: skip VLM re-parsing for files whose SHA-256 hash is
            already in the DB (default True). Set False / use --force on the
            CLI to force a fresh parse of every file.

    Returns:
        {
          "processed":    [ <purchase registry record dict>, ... ],
          "skipped":      [ {"source": "inv1.pdf", "id": 3}, ... ],
          "failed":       [ {"source": "bad_scan.pdf", "error": "..."}, ... ],
          "needs_review": [ {"source": "...", "warnings": [...]}, ... ],
          "output_dir":   "...",
        }
    One bad/unreadable file does not stop the batch — it's logged under
    "failed" and the rest continue processing.
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)

    if not input_path.is_dir():
        raise NotADirectoryError(
            f"Invoices folder not found: {input_path.resolve()}. "
            f"Create it and put your scanned/uploaded PDF/JPEG invoices inside."
        )
    output_path.mkdir(parents=True, exist_ok=True)

    files = sorted(
        f for f in input_path.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_INVOICE_EXTENSIONS
    )

    results = {"processed": [], "skipped": [], "failed": [], "needs_review": [], "output_dir": str(output_path)}

    if not files:
        print(f"[WARN] No PDF/JPEG/PNG invoices found in {input_path.resolve()}")
        return results

    print(f"Found {len(files)} invoice(s) in {input_path.resolve()} ...")

    for i, f in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {f.name} ... ", end="", flush=True)

        # ── Per-file hash check: skip the VLM entirely for seen files ──────────
        # Checking the hash here (before process_invoice_to_registry) lets us
        # print a clear "[SKIP] skipped" line and add to results["skipped"] without
        # going through the full pipeline call.
        if skip_if_seen and save_to_db:
            try:
                file_hash, _ = _file_sha256(str(f))
                cached = _get_cached_record(file_hash, db_path)
                if cached:
                    print(f"[SKIP] skipped (already parsed, id={cached.get('id')})")
                    results["skipped"].append({"source": f.name, "id": cached.get("id")})
                    continue
            except Exception as hash_err:
                # Hash failure is non-fatal — fall through to normal parsing
                print(f"(hash check failed: {hash_err}) ", end="", flush=True)

        try:
            record = process_invoice_to_registry(
                str(f),
                type_of_inward_supply=type_of_inward_supply,
                save_to_db=save_to_db,
                db_path=db_path,
                skip_if_seen=False,   # already checked above — avoid double hash
                update_existing=update_existing,
            )
        except Exception as e:
            print(f"[FAIL] failed: {e}")
            results["failed"].append({"source": f.name, "error": str(e)})
            continue

        json_file = output_path / f"{f.stem}.json"
        json_file.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        record["json_file"] = str(json_file)
        results["processed"].append(record)

        if record.get("warnings"):
            results["needs_review"].append({"source": f.name, "warnings": record["warnings"]})
            print(f"[WARN] saved (review: {len(record['warnings'])} issue(s))")
        else:
            print("[OK] saved")

    combined_path = output_path / "purchase_registry.json"
    combined_path.write_text(
        json.dumps(results["processed"], ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"\nDone: {len(results['processed'])} processed, {len(results['skipped'])} skipped, "
          f"{len(results['failed'])} failed, {len(results['needs_review'])} flagged for review.")
    print(f"Combined JSON -> {combined_path}")
    if save_to_db:
        print(f"Saved to database -> {Path(db_path).resolve()}")

    return results


# ══════════════════════════════════════════════════════════════════════════════
# 11. GSTR-2B EXCEL PARSER
# ══════════════════════════════════════════════════════════════════════════════
#
# NOTE: This parses the GSTR-2B Excel downloaded from the GST portal — the
# *supplier-filed* side of reconciliation. It returns the internal extraction
# schema (call to_purchase_registry() on each row if you want the official
# header format). It is intentionally NOT auto-saved into the
# purchase_registry table: that table holds the buyer's own scanned/uploaded
# invoices, which is the other side the reconciliation engine compares
# GSTR-2B against.

def parse_gstr2b_excel(excel_path: str) -> list[dict]:
    """
    Parse GSTR-2B Excel download into list of invoice dicts (same schema).
    Requires: pip install openpyxl
    """
    import openpyxl
    wb = openpyxl.load_workbook(excel_path, data_only=True)

    # GSTR-2B typically has sheet "B2B" for inward supplies
    results = []
    for sheet_name in ("B2B", "b2b", wb.sheetnames[0]):
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]
        headers = [str(c.value).strip() if c.value else "" for c in next(ws.iter_rows(min_row=1, max_row=1))]

        def col(row, name):
            try:
                idx = next(i for i, h in enumerate(headers) if name.lower() in h.lower())
                v = row[idx].value
                return str(v).strip() if v is not None else ""
            except StopIteration:
                return ""

        for row in ws.iter_rows(min_row=2):
            if not any(c.value for c in row):
                continue
            inv = {
                "source_file": Path(excel_path).name,
                "doc_type": col(row, "Document Type") or "TAX_INVOICE",
                "supplier_gstin": _extract_gstin(col(row, "GSTIN of Supplier")),
                "supplier_name": col(row, "Trade/Legal Name") or col(row, "Supplier Name"),
                "buyer_gstin": "",
                "invoice_number": col(row, "Invoice Number") or col(row, "Document Number"),
                "invoice_date": _norm_date(col(row, "Invoice Date") or col(row, "Document Date")),
                "place_of_supply": col(row, "Place of Supply"),
                "grand_total": _norm_amount(col(row, "Invoice Value")),
                "cgst_amount": _norm_amount(col(row, "Central Tax")),
                "sgst_amount": _norm_amount(col(row, "State/UT Tax")),
                "igst_amount": _norm_amount(col(row, "Integrated Tax")),
                "cess_amount": _norm_amount(col(row, "Cess")),
                "taxable_value": _norm_amount(col(row, "Taxable Value")),
                "line_items": [],
                "confidence": {"overall": 1.0},  # Excel = deterministic
            }
            results.append(inv)
        break

    return results


# ══════════════════════════════════════════════════════════════════════════════
# 12. CLI
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GST Invoice OCR Pipeline → Purchase Registry")
    parser.add_argument("file", nargs="?", default="invoices",
                         help="Invoice PDF/image, a folder of invoices, or a GSTR-2B Excel file "
                              "(default: 'invoices' — processes every PDF/JPEG/PNG in that folder)")
    parser.add_argument("-o", "--out", help="Output JSON file (default: stdout)")
    parser.add_argument("--output-dir", default="processed_invoices",
                         help="Folder mode only: where per-invoice + combined JSON results are written "
                              "(default: processed_invoices)")
    parser.add_argument("--excel", action="store_true",
                         help="Parse as GSTR-2B Excel (supplier-filed data; not saved to the purchase registry DB)")
    parser.add_argument("--raw", action="store_true",
                         help="Output the raw internal extraction schema instead of the Purchase Registry format")
    parser.add_argument("--db", default=str(DB_PATH),
                         help=f"SQLite purchase registry DB path (default: {DB_PATH})")
    parser.add_argument("--no-save", action="store_true",
                         help="Don't save the result(s) to the purchase registry database")
    parser.add_argument("--force", action="store_true",
                         help="Re-parse even if the file's SHA-256 hash is already in the DB "
                              "(overrides the default skip-if-seen behaviour)")
    parser.add_argument("--update-existing", action="store_true",
                         help="Overwrite a record that already exists in the registry "
                              "(same GSTIN + document number + type). Default: duplicates are "
                              "left untouched — never updated.")
    parser.add_argument("--inward-type", choices=["Inputs", "Capital Goods", "Input Services"],
                         help="Override the auto-classified 'Type of inward supplies'")
    parser.add_argument("--export", metavar="PATH",
                         help="After saving, export the full purchase registry (optionally filtered by --period) to this JSON file")
    parser.add_argument("--period", metavar="MM-YYYY", help="Filter --export to one tax period")
    parser.add_argument("--query", action="store_true",
                         help="Query mode: read records from the registry instead of parsing invoices. "
                              "Combine with --from, --gstin, --doc-no, --supplier, --period, --review-only.")
    parser.add_argument("--from", dest="query_source", choices=["db", "json", "both"], default="db",
                         help="Query source: db (default), json (needs --json-path), or both")
    parser.add_argument("--json-path", help="Purchase registry JSON file to query (for --from json/both)")
    parser.add_argument("--gstin", help="Query filter: supplier GSTIN")
    parser.add_argument("--doc-no", help="Query filter: document/invoice number (exact match)")
    parser.add_argument("--supplier", help="Query filter: supplier trade/legal name (substring match)")
    parser.add_argument("--review-only", action="store_true",
                         help="Query filter: only records flagged needs_review")
    args = parser.parse_args()

    # ── Query mode: read from the registry (DB / JSON / both) and exit ─────────
    if args.query:
        records = query_registry(
            source=args.query_source, db_path=args.db, json_path=args.json_path,
            gstin=args.gstin, return_period=args.period, document_number=args.doc_no,
            supplier_name=args.supplier, needs_review_only=args.review_only,
        )
        output = json.dumps(records, ensure_ascii=False, indent=2)
        if args.out:
            Path(args.out).write_text(output, encoding="utf-8")
            print(f"{len(records)} record(s) → {args.out}")
        else:
            print(output)
            print(f"\n{len(records)} record(s) found.")
        raise SystemExit(0)


    target = Path(args.file)

    if not target.exists():
        if args.file == "invoices":
            print(f"[WARN] No '{target}' folder found. Create an 'invoices' folder and put your "
                  f"scanned/uploaded PDF, JPEG, or PNG invoices inside, then re-run - "
                  f"or point at one file directly: python {Path(__file__).name} path/to/invoice.pdf")
        else:
            print(f"[FAIL] File or folder not found: {target}")
        raise SystemExit(1)

    if target.is_dir():
        # Batch mode: parse every PDF/JPEG/PNG in the folder, save each to the
        # database, and write the results out as JSON (per-invoice + combined).
        result = process_invoices_folder(
            str(target),
            output_dir=args.output_dir,
            save_to_db=not args.no_save,
            db_path=args.db,
            type_of_inward_supply=args.inward_type,
            skip_if_seen=not args.force,
            update_existing=args.update_existing,
        )
    elif args.excel or args.file.lower().endswith((".xlsx", ".xls")):
        result = parse_gstr2b_excel(args.file)
    elif args.raw:
        result = extract_invoice(args.file)
    else:
        result = process_invoice_to_registry(
            args.file,
            type_of_inward_supply=args.inward_type,
            save_to_db=not args.no_save,
            db_path=args.db,
            skip_if_seen=not args.force,
            update_existing=args.update_existing,
        )
        if not args.no_save:
            print(f"[OK] Saved to purchase registry -> {args.db}  "
                  f"(id={result.get('id')}, period={result.get('return_period')})")
            if result.get("warnings"):
                for w in result["warnings"]:
                    print(f"[WARN] {w}")

    if args.export:
        export_registry_to_json(args.export, db_path=args.db, return_period=args.period)
        print(f"[EXPORT] Exported purchase registry -> {args.export}")

    output = json.dumps(result, ensure_ascii=False, indent=2)

    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
        print(f"Saved → {args.out}")
    elif not target.is_dir():
        # Folder mode already wrote per-invoice + combined JSON to output_dir
        # and printed a progress summary above — no need to dump it all again.
        print(output)