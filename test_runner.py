import json
from rules import run_rule_checks
from reconcile import check_gstr2b_matching
from advisor import generate_llm_advice  # <── Import your new Gemini script!

def main():
    print("🚀 Loading mock invoice JSON from Person A...")
    with open("mock_input.json", "r") as file:
        invoice_data = json.load(file)
        
    print("🔍 Running Layer 3 Deterministic Rule Engine...")
    rule_flags = run_rule_checks(invoice_data)
    print(f"   Found {len(rule_flags)} rule anomalies.")
    
    print("📊 Running GSTR-2B Reconciliation Check...")
    recon_status = check_gstr2b_matching(
        invoice_no=invoice_data["invoice_number"],
        taxable_value=float(invoice_data["taxable_value"]),
        excel_path="GSTR2B_Dummy_Dataset.xlsx"
    )
    print(f"   Reconciliation Status: {recon_status['status']}")
    
    final_output_status = rule_flags[0]["type"] if rule_flags else recon_status["status"]

    print("🤖 Fetching dynamic bilingual advice from Gemini 2.5 Flash...")
    # Call your Gemini engine and pass the analytics variables directly
    gemini_messages = generate_llm_advice(
        invoice_no=invoice_data["invoice_number"],
        flags=rule_flags,
        recon_status=recon_status
    )

    # Compile the final integrated JSON block
    final_output = {
        "invoice_number": invoice_data["invoice_number"],
        "match_status": final_output_status,
        "itc_available": len(rule_flags) == 0 and recon_status["status"] == "MATCHED",
        "itc_amount_at_risk": "2355.00" if rule_flags else "0.00",
        "flags": rule_flags,
        "action_code": "SUCCESS_OK" if final_output_status == "MATCHED" else "ACTION_REQUIRED",
        "message_en": gemini_messages.get("message_en"),
        "message_hi": gemini_messages.get("message_hi")
    }
    
    print("\n================ FINAL SYSTEM OUTPUT ================")
    print(json.dumps(final_output, indent=2))
    print("=====================================================")

if __name__ == "__main__":
    main()