import sys
import os
import json

# 🛠️ Fix: Force Python to look in the current folder for the gst_engine package
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from gst_engine.rules import run_rule_checks
from gst_engine.reconcile import check_gstr2b_matching
from openai import OpenAI  # ──► Swapped from google.genai to use local server stream

def main():
    print("🚀 Loading mock invoice JSON from Person A...")
    try:
        with open("mock_input.json", "r") as file:
            invoice_data = json.load(file)
    except FileNotFoundError:
        print("❌ Error: mock_input.json not found in the current directory!")
        return

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
    
    # Track underlying match/error status
    final_output_status = rule_flags[0]["type"] if rule_flags else recon_status["status"]

    # 1. Initialize Local Ollama Server Client (No Internet Connection or API Key Needed)
    client = OpenAI(
        base_url="http://localhost:11434/v1",
        api_key="ollama"  # Acts as a functional local string placeholder
    )
    
    # 2. Optimized Strict Instructions for Smaller Local Models
    system_instruction = (
        "You are an interactive AI GST Assistant for Indian business owners.\n"
        "You have access to the invoice data provided in the first message.\n\n"
        "STRICT LANGUAGE RULE:\n"
        "1. Look at the language the user just used in their latest message.\n"
        "2. If the user writes in English, you MUST reply ONLY in clear English.\n"
        "3. If the user writes in Hinglish/Hindi, you MUST reply in Hinglish.\n"
        "4. Never mix multiple languages or hallucinate foreign laws (like UAE tax) in a single response.\n\n"
        "Keep your answers brief, simple, and helpful."
    )

    # 3. Package the background validation context payload
    context_payload = {
        "invoice_data": invoice_data,
        "rule_analysis": rule_flags,
        "reconciliation_status": recon_status,
        "final_status": final_output_status
    }

    print(f"\n💬 Initializing LOCAL interactive consultation session (Llama 3.2)...")
    
    # 4. Set up the strict conversation starting stack
    chat_history = [
        {"role": "system", "content": system_instruction},
        {
            "role": "user", 
            "content": f"Here is the invoice data payload: {json.dumps(context_payload)}. Introduce yourself in plain English and state the validation status clearly."
        }
    ]
    try:
        # Prime the conversation using your local model instances
        response = client.chat.completions.create(
            model="llama3.2",
            messages=chat_history
        )
        ai_initial_reply = response.choices[0].message.content
        
        print("\n================ LOCAL AI TAX ASSISTANT ================")
        print(f"AI: {ai_initial_reply}")
        print("========================================================")
        
        # Save response to history context log
        chat_history.append({"role": "assistant", "content": ai_initial_reply})

    except Exception as e:
        print(f"\n❌ Local LLM Execution Error: {str(e)}")
        print("Ensure 'ollama run llama3.2' is actively executing in a background terminal window.")
        return

    # 5. Live Interactive Chat Loop
    while True:
        try:
            user_input = input("\nYou (Type 'exit' to quit): ")
            if user_input.lower() in ['exit', 'quit']:
                print("👋 Ending session. Good luck with your local compliance presentation!")
                break
                
            if not user_input.strip():
                continue

            # Append new statement input to processing context list array
            chat_history.append({"role": "user", "content": user_input})

            # Run completion generations against local loop thread
            response = client.chat.completions.create(
                model="llama3.2",
                messages=chat_history
            )
            
            ai_reply = response.choices[0].message.content
            print(f"\nAI: {ai_reply}")
            
            # Save historical states tracking
            chat_history.append({"role": "assistant", "content": ai_reply})
            
        except KeyboardInterrupt:
            print("\n👋 Chat session closed.")
            break

if __name__ == "__main__":
    main()