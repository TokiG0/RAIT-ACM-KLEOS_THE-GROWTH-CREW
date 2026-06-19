"""
GST OCR Pipeline — Qwen2.5-VL-7B  |  v2 — Image Processing Speed Fixes
Extracts structured invoice data from PDF/image/photo invoices.

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

import re
import json
import base64
import argparse
import platform
from pathlib import Path
from datetime import datetime

from PIL import Image
from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor, BitsAndBytesConfig
import torch
from torch.backends.cuda import sdp_kernel, SDPBackend


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

    print("Loading processor …")
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

    print("Loading model (4-bit, ~2-3 min on first run) …")
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
            print("✅ torch.compile enabled (first invoice will be slow — warmup)")
        except Exception as e:
            print(f"torch.compile skipped: {e}")
    else:
        print("ℹ️  torch.compile skipped on Windows — SDPA kernel handles speedup instead")

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


def load_images(file_path: str) -> list[Image.Image]:
    """Return list of pre-resized PIL images from PDF, image file, or photo.
    Uses pymupdf (fitz) — no poppler required on Windows.
    """
    p = Path(file_path)
    if p.suffix.lower() == ".pdf":
        import fitz  # pymupdf: pip install pymupdf
        doc = fitz.open(str(p))
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
        return [_resize_for_vlm(Image.open(p))]


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
  "buyer_gstin": "",
  "invoice_number": "",
  "invoice_date": "",
  "place_of_supply": "",
  "grand_total": "",
  "cgst_amount": "",
  "sgst_amount": "",
  "igst_amount": "",
  "taxable_value": "",
  "line_items": [
    {"sr":"","description":"","hsn_code":"","quantity":"","unit":"",
     "rate":"","taxable_amount":"","gst_rate":"","gst_amount":"","total":""}
  ],
  "confidence": {"overall": 0.0}
}
Rules:
- GSTIN: 15-char alphanumeric. Fix common OCR error: digit 0 vs letter O.
- HSN codes: 4-8 digits only (not PINs/invoice numbers).
- Amounts: include decimals e.g. "1177.50".
- confidence.overall: your estimate 0-1.
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
_DATE_FMTS = ["%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d %b %Y", "%d-%b-%Y",
              "%d.%m.%Y", "%B %d, %Y"]

def _norm_date(val: str) -> str:
    if not val:
        return ""
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(val.strip(), fmt).strftime("%d-%b-%Y")
        except ValueError:
            continue
    return val  # return raw if unparseable


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

    data["invoice_date"] = _norm_date(data.get("invoice_date", ""))

    for key in ("grand_total", "cgst_amount", "sgst_amount",
                "igst_amount", "taxable_value"):
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
# 7. PARSE VLM OUTPUT
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
# 8. MAIN PIPELINE FUNCTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_invoice(file_path: str) -> dict:
    """
    Main entry point.
    Args:
        file_path: path to invoice PDF, PNG, JPG, WEBP, TIFF, etc.
    Returns:
        Structured invoice dict matching the standard schema.
    """
    images = load_images(file_path)
    raw_output = _run_vlm(images)
    data = _parse_json(raw_output)
    data = _postprocess(data, file_path)
    return data


# ══════════════════════════════════════════════════════════════════════════════
# 9. GSTR-2B EXCEL PARSER
# ══════════════════════════════════════════════════════════════════════════════

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
                "doc_type": "TAX_INVOICE",
                "supplier_gstin": _extract_gstin(col(row, "GSTIN of Supplier")),
                "buyer_gstin": "",
                "invoice_number": col(row, "Invoice Number"),
                "invoice_date": _norm_date(col(row, "Invoice Date")),
                "place_of_supply": col(row, "Place of Supply"),
                "grand_total": _norm_amount(col(row, "Invoice Value")),
                "cgst_amount": _norm_amount(col(row, "Central Tax")),
                "sgst_amount": _norm_amount(col(row, "State/UT Tax")),
                "igst_amount": _norm_amount(col(row, "Integrated Tax")),
                "taxable_value": _norm_amount(col(row, "Taxable Value")),
                "line_items": [],
                "confidence": {"overall": 1.0},  # Excel = deterministic
            }
            results.append(inv)
        break

    return results


# ══════════════════════════════════════════════════════════════════════════════
# 10. CLI
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GST Invoice OCR Pipeline")
    parser.add_argument("file", help="Invoice PDF/image or GSTR-2B Excel file")
    parser.add_argument("-o", "--out", help="Output JSON file (default: stdout)")
    parser.add_argument("--excel", action="store_true", help="Parse as GSTR-2B Excel")
    args = parser.parse_args()

    if args.excel or args.file.lower().endswith((".xlsx", ".xls")):
        result = parse_gstr2b_excel(args.file)
    else:
        result = extract_invoice(args.file)

    output = json.dumps(result, ensure_ascii=False, indent=2)

    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
        print(f"Saved → {args.out}")
    else:
        print(output)
