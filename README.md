Markdown
# 💼 GST Audit Engine & Dynamic Reconciler v3.0

An intelligent, edge-computing compliance utility designed to automate the manual bottleneck of month-end GST filing and reconciliation for Indian Small & Medium Enterprises (SMEs) and accounting clerks. 

By combining algorithmic bookkeeping logic with Google's **Gemma 7B LLM**, the application completely bridges the technical literacy barrier for local traders, instantly turning messy transaction data into actionable financial recoveries.

---

## 🚀 Key Features

### 📑 1. High-Yield Accounting Logic Engine ("The CA Brain")
*   **Vertical Math Balancing Check:** Programmatically validates cross-row mathematical alignment between Taxable Value, CGST, SGST, IGST, and Grand Totals down to a strict tolerance threshold.
*   **Section 17(5) Blocked Credit Filter:** Scans line items and metadata descriptions using a rigid legal keyword matrix to automatically flag and isolate legally ineligible credits (e.g., hospitality, vehicle assets), saving businesses from costly compliance notices.
*   **HSN Code Directory Rate Validation:** Cross-references invoice lines with a native master directory. If an item description is unique, it triggers an intelligent fallback loop to evaluate appropriate tax slabs under Indian law.

### 🔍 2. 4-Parameter Fuzzy Reconciliation Matrix
*   Executes a robust point-scoring alignment pipeline matching internal purchase registers against government-issued **GSTR-2B datasets**.
*   Evaluates entries across four strict parameters: **GSTIN Match (25 pts)**, **Invoice Number (35 pts)**, **Invoice Date (20 pts)**, and **Tax Amounts (20 pts)**.
*   Discrepancies are categorized into standard accounting action buckets: 
    *   🟢 **Matched:** Safe to claim.
    *   🟡 **Mismatch:** Variance detected in values between the vendor and the portal.
    *   🔴 **Missing in 2B:** The supplier has failed to file their GSTR-1, triggering a credit freeze.

### 🗣️ 3. Context-Locked Multi-Lingual Diagnostics Interface
*   Utilizes a local instance of **Gemma 7B** running via **Ollama** at a deterministic low temperature ($0.1$ - $0.2$).
*   Generates comprehensive, itemized line-by-line financial metrics instead of generalized outlines.
*   **Dynamic Language Pivoting:** Delivers reports in professional English for ledger records by default, but instantly switches context, weights, and terminology to **Hindi (Hinglish), Marathi, Tamil, or Gujarati** if a local shopkeeper prompts the interface in their native dialect.

### 📊 4. Portal-Ready Outputs & Automated Supplier Nudging
*   **Automated Nudge Generation:** Instantly auto-drafts polite but firm, copy-paste ready vernacular WhatsApp alerts to remind defaulting vendors to upload missing invoices so blocked tax money can be released.
*   **3-Sheet Excel Workbook Export:** Compiles data into a beautifully formatted, color-coded report that provides the exact computed values needed for **Table 4 of the GSTR-3B filing form**.

---

## 🛠️ System Architecture

[ Messy Invoices (PDF/Images) ] ──> [ Upstream VLM / OCR Pipeline ]
│
▼
[ purchase_registry.json ]
│
[ GSTR-2B Spreadsheet Portal Download ] ──────────┼──> [ Hybrid Reconciler Engine ]
│   (Python Deterministic Layer)
▼
[ Cleaned Text Manifest + GSTR-3B Totals ]
│
▼
[ Gemma 7B Local Ollama Engine ]
(Temperature: 0.1 | Low-Inference)
│
▼
[ Full Context Diagnostics & Reports ]
(Dynamic Multi-Lingual Console / UI)


---

## 🏁 Getting Started & Execution

### Prerequisites
Ensure you have Python 3.10+ installed along with a running instance of [Ollama](https://ollama.com/).

```bash
# Install core integration dependencies
pip install openai openpyxl

# Pull down the target edge model weights locally
ollama pull gemma:7b
File Hierarchy Setup
To ensure a seamless handshake with the upstream OCR/VLM data pipelines, structure your root workspace directory as follows:

Plaintext
├── main_standalone.py                     # Main hybrid audit engine script
├── gst_ocr_pipeline.py                    # Upstream extraction node (or mock file)
├── GSTR2B_Dummy_Dataset.xlsx              # Government portal spreadsheet download
└── processed_invoices/
    └── purchase_registry.json             # Structured output from the VLM parser
Running the Ledger Workspace
Execute the orchestrator directly from your terminal console layout:

Bash
python main_standalone.py