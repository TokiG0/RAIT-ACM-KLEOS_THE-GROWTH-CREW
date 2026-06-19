import os
import sys
import json
from typing import List, Dict, Any

# Ensure external dependencies can be imported cleanly
try:
    import pandas as pd
    from openai import OpenAI
except ImportError:
    print("❌ Critical Error: Missing required packages!")
    print("Please run: pip install openai pandas openpyxl")
    sys.exit(1)

# =========================================================================
# LAYER 1: DYNAMIC COMPLIANCE RULE ENGINE (Ported from rules.py)
# =========================================================================
HSN_MASTER_REGISTRY = {
    "2523": {"expected_rate": "28%", "category": "Cement"},
    "1512": {"expected_rate": "5%",  "category": "Sunflower Oil"},
    "1516": {"expected_rate": "12%", "category": "Vegetable Fats/Hydrogenated Oils"},
    "8471": {"expected_rate": "18%", "category": "Computers/Electronics"},
    "9965": {"expected_rate": "5%",  "category": "Goods Transport Services (GTA)"},
}

def run_rule_checks(invoice_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    flags = []
    try:
        taxable_value = float(invoice_data.get("taxable_value", 0) or 0)
        cgst_total = float(invoice_data.get("cgst_amount", 0) or 0)
        sgst_total = float(invoice_data.get("sgst_amount", 0) or 0)
        igst_total = float(invoice_data.get("igst_amount", 0) or 0)
        grand_total = float(invoice_data.get("grand_total", 0) or 0)
    except (ValueError, TypeError):
        flags.append({
            "type": "STRUCTURAL_ERROR",
            "field": "summary_totals",
            "description": "Invoice total fields contain non-numeric corrupt data formatting."
        })
        return flags

    # Rule 1: Math Balance Check
    calculated_grand = taxable_value + cgst_total + sgst_total + igst_total
    if abs(calculated_grand - grand_total) > 1.0:
        flags.append({
            "type": "MATH_MISMATCH",
            "field": "grand_total",
            "found": grand_total,
            "expected": round(calculated_grand, 2),
            "description": f"Grand total mismatch. Document claims {grand_total}, but math summary equals {round(calculated_grand, 2)}."
        })

    # Rule 2: Inter vs Intra State Tax Type Check via GSTIN Prefixes
    supplier_gst = str(invoice_data.get("supplier_gstin", "")).strip()
    buyer_gst = str(invoice_data.get("buyer_gstin", "")).strip()
    if len(supplier_gst) >= 2 and len(buyer_gst) >= 2:
        supplier_state_code = supplier_gst[:2]
        buyer_state_code = buyer_gst[:2]
        if supplier_state_code == buyer_state_code:
            if igst_total > 0 and (cgst_total == 0 or sgst_total == 0):
                flags.append({
                    "type": "TAX_TYPE_MISMATCH",
                    "field": "igst_amount",
                    "description": f"Intra-state transaction detected via GSTIN prefixes ({supplier_state_code}). Local CGST/SGST should apply instead of IGST."
                })
        else:
            if (cgst_total > 0 or sgst_total > 0) and igst_total == 0:
                flags.append({
                    "type": "TAX_TYPE_MISMATCH",
                    "field": "cgst_sgst_amount",
                    "description": f"Inter-state transaction detected ({supplier_state_code} to {buyer_state_code}). Integrated IGST should apply instead of local taxes."
                })

    # Rule 3: Dynamic HSN Registry Matching
    line_items = invoice_data.get("line_items", [])
    for idx, item in enumerate(line_items):
        hsn = str(item.get("hsn_code", "")).strip()
        raw_gst_rate = str(item.get("gst_rate", "")).strip()
        if not hsn:
            flags.append({
                "type": "MISSING_HSN",
                "field": f"line_items[{idx}].hsn_code",
                "description": f"Line item {idx+1} ('{item.get('description')}') is missing its mandatory regulatory HSN code."
            })
            continue
        if hsn in HSN_MASTER_REGISTRY:
            expected_rate = HSN_MASTER_REGISTRY[hsn]["expected_rate"]
            category = HSN_MASTER_REGISTRY[hsn]["category"]
            if raw_gst_rate.replace("%", "").strip() != expected_rate.replace("%", "").strip():
                flags.append({
                    "type": "TAX_RATE_MISMATCH",
                    "field": f"line_items[{idx}].gst_rate",
                    "found": raw_gst_rate,
                    "expected": expected_rate,
                    "description": f"Incorrect tax rate applied for {category} (HSN {hsn}). Found {raw_gst_rate}, expected statutory rate is {expected_rate}."
                })
    return flags

# =========================================================================
# LAYER 2: LOCAL B2B RECONCILIATION MATCHER (Ported from reconcile.py)
# =========================================================================
def check_gstr2b_matching(invoice_no: str, taxable_value: float, excel_path: str) -> Dict[str, Any]:
    if not os.path.exists(excel_path):
        return {"status": "GSTR2B_FILE_NOT_FOUND", "row_index": None}
    try:
        df = pd.read_excel(excel_path, sheet_name="B2B Invoice Details")
        df.columns = df.columns.str.strip()
        
        # Look for matching row dynamically matching key parameters
        match = df[
            (df['Invoice No'].astype(str).str.strip() == str(invoice_no).strip()) & 
            (pd.to_numeric(df['Taxable Value (Rs)'], errors='coerce') == float(taxable_value))
        ]
        if not match.empty:
            return {"status": "MATCHED", "row_index": int(match.index[0])}
        return {"status": "MISSING_IN_2B", "row_index": None}
    except Exception as e:
        return {"status": f"ERROR_PARSING_LEDGER: {str(e)}", "row_index": None}

# =========================================================================
# MASTER SERVICE COORDINATOR (Ported from main.py)
# =========================================================================
def main():
    print("🚀 Loading mock invoice JSON data...")
    try:
        with open("mock_input.json", "r") as file:
            raw_data = json.load(file)
            # Dynamic Type Guard (Safely unwraps lists if Person A nests the data array)
            invoice_data = raw_data[0] if isinstance(raw_data, list) and raw_data else raw_data
    except FileNotFoundError:
        print("❌ Error: mock_input.json not found in the current directory!")
        return

    print("🔍 Running Layer 3 Deterministic Rule Engine...")
    rule_flags = run_rule_checks(invoice_data)
    print(f"   Found {len(rule_flags)} rule anomalies.")
    
    print("📊 Running GSTR-2B Reconciliation Check...")
    recon_status = check_gstr2b_matching(
        invoice_no=invoice_data.get("invoice_number", ""),
        taxable_value=float(invoice_data.get("taxable_value", 0) or 0),
        excel_path="GSTR2B_Dummy_Dataset.xlsx"
    )
    print(f"   Reconciliation Status: {recon_status['status']}")
    
    final_output_status = rule_flags[0]["type"] if rule_flags else recon_status["status"]

    # Initialize Local Ollama Client Interface Connection
    client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
    
    system_instruction = (
        "You are an interactive AI GST Assistant for Indian business owners.\n"
        "You have access to the invoice data provided in the first message.\n\n"
        "STRICT LANGUAGE RULE:\n"
        "1. Look at the language the user just used in their latest message.\n"
        "2. If the user writes in English, you MUST reply ONLY in clear English.\n"
        "3. If the user writes in Hinglish/Hindi, you MUST reply in Hinglish.\n"
        "4. Never mix multiple languages or hallucinate foreign laws in a response.\n\n"
        "Keep your answers brief, simple, and helpful."
    )

    context_payload = {
        "invoice_data": invoice_data,
        "rule_analysis": rule_flags,
        "reconciliation_status": recon_status,
        "final_status": final_output_status
    }

    print(f"\n💬 Initializing LOCAL interactive consultation session (Llama 3.2 3B)...")
    
    chat_history = [
        {"role": "system", "content": system_instruction},
        {
            "role": "user", 
            "content": f"Here is the invoice data payload: {json.dumps(context_payload)}. Introduce yourself in plain English and state the validation status clearly."
        }
    ]

    try:
        response = client.chat.completions.create(
            model="llama3.2",
            messages=chat_history
        )
        ai_initial_reply = response.choices[0].message.content
        print("\n================ LOCAL AI TAX ASSISTANT ================")
        print(f"AI: {ai_initial_reply}")
        print("========================================================")
        chat_history.append({"role": "assistant", "content": ai_initial_reply})
    except Exception as e:
        print(f"\n❌ Local LLM Execution Error: {str(e)}")
        print("Ensure 'ollama run llama3.2' is actively executing in a background terminal panel.")
        return

    # Live Interactive Chat Loop Thread Execution
    while True:
        try:
            user_input = input("\nYou (Type 'exit' to quit): ")
            if user_input.lower() in ['exit', 'quit']:
                print("👋 Ending session. Good luck with your local compliance presentation!")
                break
            if not user_input.strip():
                continue

            chat_history.append({"role": "user", "content": user_input})
            response = client.chat.completions.create(model="llama3.2", messages=chat_history)
            ai_reply = response.choices[0].message.content
            print(f"\nAI: {ai_reply}")
            chat_history.append({"role": "assistant", "content": ai_reply})
        except KeyboardInterrupt:
            print("\n👋 Chat session closed.")
            break

if __name__ == "__main__":
    main()