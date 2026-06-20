import os
import sys
import json
import re
from typing import List, Dict, Any

# Ensure external dependencies are met
try:
    from openai import OpenAI
except ImportError:
    print("❌ Critical Error: Missing required packages!")
    print("Please run: pip install openai")
    sys.exit(1)

# =========================================================================
# ADVANCED UTILITY: THE CA CLEANING COUNTER
# =========================================================================
def clean_numeric_value(value: Any) -> float:
    """Strips any currency symbols (₹, €, $), commas, or formatting anomalies."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    sanitized = re.sub(r'[^\d.]', '', str(value).replace(",", "")).strip()
    try:
        return float(sanitized) if sanitized else 0.0
    except ValueError:
        return 0.0


def dynamic_extract_field(data: Dict[str, Any], mathematical_concepts: List[str]) -> Any:
    """Fuzzy Key Matcher: Conceptually extracts fields regardless of naming layout."""
    normalized_concepts = [c.lower().replace("_", "").replace(" ", "") for c in mathematical_concepts]
    for key, val in data.items():
        norm_key = key.lower().replace("_", "").replace(" ", "")
        if norm_key in normalized_concepts:
            return val
    return None


def extract_invoice_context(invoice: Dict[str, Any]) -> Dict[str, Any]:
    """Build a compact invoice context payload to preserve report clarity."""
    return {
        "document_number": dynamic_extract_field(invoice, ["document_number", "invoice_number", "documentnumber"]),
        "taxable_value": clean_numeric_value(dynamic_extract_field(invoice, ["taxable_value", "taxablevalue", "taxableamount"])),
        "cgst": clean_numeric_value(dynamic_extract_field(invoice, ["central_tax", "centraltax", "cgst_amount"])),
        "sgst": clean_numeric_value(dynamic_extract_field(invoice, ["state_ut_tax", "stateuttax", "sgst_amount"])),
        "igst": clean_numeric_value(dynamic_extract_field(invoice, ["integrated_tax", "integratedtax", "igst_amount"])),
        "grand_total": clean_numeric_value(dynamic_extract_field(invoice, ["grand_total", "grandtotal", "total"])),
        "supplier_gstin": dynamic_extract_field(invoice, ["supplier_gstin", "gstin_of_supplier", "suppliergstin"]),
        "buyer_gstin": dynamic_extract_field(invoice, ["buyer_gstin", "buyergstin"])
    }

# =========================================================================
# LAYER 1: THE REUSABLE AUDITING LOGIC ENGINE
# =========================================================================
def audit_single_invoice(invoice: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Performs strict vertical and horizontal audit checks dynamically."""
    flags = []

    taxable_value = clean_numeric_value(dynamic_extract_field(invoice, ["taxable_value", "taxablevalue", "taxableamount"]))
    cgst = clean_numeric_value(dynamic_extract_field(invoice, ["central_tax", "centraltax", "cgst_amount"]))
    sgst = clean_numeric_value(dynamic_extract_field(invoice, ["state_ut_tax", "stateuttax", "sgst_amount"]))
    igst = clean_numeric_value(dynamic_extract_field(invoice, ["integrated_tax", "integratedtax", "igst_amount"]))
    grand_total = clean_numeric_value(dynamic_extract_field(invoice, ["grand_total", "grandtotal", "total"]))

    calculated_grand = taxable_value + cgst + sgst + igst
    if abs(calculated_grand - grand_total) > 2.0:
        flags.append({
            "anomaly_type": "VERTICAL_MATH_MISMATCH",
            "description": f"Internal arithmetic error. Grand total claimed is {grand_total}, but mathematical sum totals to {round(calculated_grand, 2)}."
        })

    supplier_gst = str(dynamic_extract_field(invoice, ["supplier_gstin", "gstin_of_supplier", "suppliergstin"]) or "").strip()
    buyer_gst = str(dynamic_extract_field(invoice, ["buyer_gstin", "buyergstin"]) or "").strip()

    if len(supplier_gst) >= 2 and len(buyer_gst) >= 2:
        supplier_state = supplier_gst[:2]
        buyer_state = buyer_gst[:2]

        if supplier_state == buyer_state:
            if igst > 0 and (cgst == 0 or sgst == 0):
                flags.append({
                    "anomaly_type": "ILLEGAL_INTERSTATE_TAX",
                    "description": f"Tax structure anomaly. Supplier and Buyer are both registered in state [{supplier_state}]. Intra-state rules dictate CGST/SGST, but IGST was charged."
                })
        else:
            if (cgst > 0 or sgst > 0) and igst == 0:
                flags.append({
                    "anomaly_type": "ILLEGAL_INTRASTATE_TAX",
                    "description": f"Tax structure anomaly. Cross-border transaction detected ([{supplier_state}] to [{buyer_state}]). IGST must be applied instead of localized CGST/SGST."
                })

    return flags

# =========================================================================
# LAYER 2: THE FLEXIBLE LEDGER RECONCILER
# =========================================================================
def reconcile_against_gstr_ledger(doc_no: str, taxable_value: float, gstr_invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Dynamically matches an invoice against Person A's GSTR dataset structure."""
    if not doc_no:
        return {"status": "UNRECONCILED", "reason": "Missing document identity metadata."}

    target_no = str(doc_no).strip().lower()
    target_val = clean_numeric_value(taxable_value)

    for gstr_inv in gstr_invoices:
        gstr_no = str(dynamic_extract_field(gstr_inv, ["invoice_number", "document_number", "documentnumber", "invoicenumber"]) or "").strip().lower()
        gstr_val = clean_numeric_value(dynamic_extract_field(gstr_inv, ["taxable_value", "taxablevalue"]))

        if gstr_no == target_no:
            if abs(gstr_val - target_val) <= 5.0:
                return {
                    "status": "MATCHED",
                    "description": "Verified and safe. Transaction matches an official GSTR-2B entry."
                }
            return {
                "status": "VALUE_MISMATCH",
                "description": f"Alert! Document ID matches, but purchase ledger claims taxable value of {gstr_val} while GSTR registry displays {target_val}."
            }

    return {
        "status": "MISSING_IN_GSTR_REGISTRY",
        "description": "Warning: This invoice is completely missing from the government's GSTR-2B statement. ITC cannot be claimed safely."
    }

# =========================================================================
# LAYER 3: EXECUTIVE RUNTIME ORDINATOR
# =========================================================================
def main():
    print("========================================================")
    print("💼 SYSTEM: Initializing Integrated CA Audit Engine...")
    print("========================================================")

    purchase_file = os.path.join("processed_invoices", "purchase_registry.json")
    excel_source_file = "GSTR2B_Dummy_Dataset.xlsx"

    try:
        import gst_ocr_pipeline as person_a_pipeline
    except ImportError:
        print("❌ Integration Error: Could not locate 'gst_ocr_pipeline.py' in the current workspace.")
        return

    if not os.path.exists(purchase_file):
        print(f"❌ Integration Error: Missing target file -> {purchase_file}")
        print("Please ensure Person A's pipeline runs first and populates the processed_invoices folder.")
        return

    if not os.path.exists(excel_source_file):
        print(f"❌ Configuration Error: Missing master file -> {excel_source_file}")
        return

    print(f"📂 Connected to Purchase Registry : {purchase_file}")
    print(f"📊 Parsing Government Excel File Directly: {excel_source_file}\n")

    try:
        with open(purchase_file, "r", encoding="utf-8") as f:
            raw_purchase = json.load(f)
        gstr_list = person_a_pipeline.parse_gstr2b_excel(excel_source_file)
    except Exception as e:
        print(f"❌ Core File Loading Error: {str(e)}")
        return

    purchase_list = raw_purchase if isinstance(raw_purchase, list) else raw_purchase.get("processed", [])

    compiled_audit_payload = []
    for idx, invoice in enumerate(purchase_list):
        doc_no = dynamic_extract_field(invoice, ["document_number", "invoice_number", "documentnumber"]) or f"UNKNOWN_REF_{idx}"
        tax_val = clean_numeric_value(dynamic_extract_field(invoice, ["taxable_value", "taxablevalue"]))

        anomalies = audit_single_invoice(invoice)
        reconciliation = reconcile_against_gstr_ledger(doc_no, tax_val, gstr_list)
        invoice_context = extract_invoice_context(invoice)

        compiled_audit_payload.append({
            "reference_id": doc_no,
            "invoice_context": invoice_context,
            "audit_flags": anomalies,
            "reconciliation_metrics": reconciliation
        })

    client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

    system_instruction = (
        "CRITICAL SYSTEM RULE: YOU MUST RESPOND 100% IN STANDARD PROFESSIONAL ENGLISH ONLY.\n"
        "You are an automated corporate ledger auditing utility checking GST compliance analytics.\n\n"
        "REPORT COMPLETENESS RULES:\n"
        "1. Produce a comprehensive, full-context audit report for every invoice provided.\n"
        "2. Include overall compliance health plus a detailed review for each invoice.\n"
        "3. Do not omit or summarize away any audit flag, reconciliation finding, or invoice context.\n"
        "4. Make each itemized conclusion self-contained and factual.\n"
        "5. Maintain clear, formal English only.\n"
        "6. Use structured prose; avoid casual or conversational tone."
    )

    payload_json = json.dumps(compiled_audit_payload, indent=2)
    chat_history = [
        {"role": "system", "content": system_instruction},
        {
            "role": "user",
            "content": (
                "Here is the finalized audit payload, including invoice context, audit flags, and reconciliation metrics:\n"
                f"{payload_json}\n\n"
                "Generate a complete professional audit report with full context. The report must include:\n"
                "- an overall compliance summary,\n"
                "- an itemized review of each invoice,\n"
                "- specific reasons for passes/failures,\n"
                "- reconciliation status and any missing registry issues,\n"
                "- and all relevant details from the provided payload.\n"
                "Do not omit any flag or invoice context from the report."
            )
        }
    ]

    try:
        response = client.chat.completions.create(
            model="gemma:7b",
            messages=chat_history,
            max_tokens=1400,
            temperature=0.0
        )
        ai_initial_reply = response.choices[0].message.content
        print("\n================ 📑 COMPLIANCE AUDIT WORKSPACE ================")
        print(f"AI: {ai_initial_reply}")
        print("============================================================")
        chat_history.append({"role": "assistant", "content": ai_initial_reply})
    except Exception as e:
        print(f"\n❌ Local AI Execution Error: {str(e)}")
        print("Please verify your local instance has pulled the target model weights via: 'ollama pull gemma:7b'")
        return

    while True:
        try:
            user_input = input("\nYou (Type 'exit' to close ledger): ")
            if user_input.lower() in ['exit', 'quit']:
                print("👋 Ledger session finalized.")
                break
            if not user_input.strip():
                continue

            chat_history.append({"role": "user", "content": user_input})
            response = client.chat.completions.create(
                model="gemma:7b",
                messages=chat_history,
                max_tokens=1200,
                temperature=0.0
            )
            ai_reply = response.choices[0].message.content
            print(f"\nAI: {ai_reply}")
            chat_history.append({"role": "assistant", "content": ai_reply})
        except KeyboardInterrupt:
            break

if __name__ == "__main__":
    main()
