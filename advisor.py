# advisor.py
import json
import os
from google import genai
from google.genai import types

def generate_llm_advice(invoice_no: str, flags: list, recon_status: dict) -> dict:
    """
    Takes structural tax flags and generates automated, bilingual WhatsApp advice
    using Gemini 2.5 Flash.
    """
    # 1. Initialize the Gemini Client
    # It automatically looks for an environment variable named GEMINI_API_KEY
    client = genai.Client()

    # 2. Package the data payload for the model to review
    anomaly_summary = {
        "invoice_number": invoice_no,
        "reconciliation_status": recon_status["status"],
        "validation_errors": flags
    }

    # 3. Create a strict system prompt to govern the tone and output structure
    system_instruction = (
        "You are an elite Indian GST Tax Advisor running inside a WhatsApp chatbot interface for small business owners.\n"
        "Review the incoming validation JSON data and generate exactly two messages:\n"
        "1. 'message_en': Direct, simple English explaining what the issue is and what to ask the vendor for.\n"
        "2. 'message_hi': Natural, conversational Hinglish/Hindi text outlining the problem and the steps to fix it.\n\n"
        "You MUST respond with a pure JSON object containing exactly these two keys: 'message_en' and 'message_hi'."
    )

    try:
        # 4. Request the completion from Gemini 2.5 Flash
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=json.dumps(anomaly_summary),
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                # This guarantees Gemini returns a parsable JSON string instead of raw text markdown
                response_mime_type="application/json" 
            ),
        )
        
        # 5. Parse the validated JSON string back into a Python dictionary
        llm_json = json.loads(response.text)
        return llm_json
        
    except Exception as e:
        # Graceful fallback if the network drops or the API key fails
        return {
            "message_en": f"System alert: Unable to generate advice due to a network issue. Error: {str(e)}",
            "message_hi": f"System alert: API connection issues ki wajah se AI advice generate nahi ho payi."
        }