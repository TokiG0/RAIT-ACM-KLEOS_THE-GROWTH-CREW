# reconcile.py
import pandas as pd

def check_gstr2b_matching(invoice_no: str, taxable_value: float, excel_path: str = "GSTR2B_Dummy_Dataset.xlsx") -> dict:
    try:
        # Load the B2B sheet, skipping the first row banner
        df = pd.read_excel(excel_path, sheet_name="B2B Invoice Details", skiprows=1)
        
        # Clean column spaces
        df.columns = df.columns.str.strip()
        
        # Format the Invoice No column safely as clean strings
        df['Invoice No'] = df['Invoice No'].astype(str).str.strip()
        
        # Clean and find the invoice number
        target_invoice = str(invoice_no).strip()
        match = df[df['Invoice No'] == target_invoice]
        
        if match.empty:
            return {
                "status": "MISSING_IN_2B", 
                "details": f"Invoice {invoice_no} is missing from the GSTR-2B portal statement."
            }
            
        row = match.iloc[0]
        
        # Safely parse numeric value from the portal record
        portal_taxable = float(str(row['Taxable Value (Rs)']).replace(',', '').strip())
        
        # Evaluate tax numbers with a small threshold margin
        if abs(portal_taxable - taxable_value) > 1.0: 
            return {
                "status": "VALUE_MISMATCH", 
                "details": f"Portal data states Rs {portal_taxable}, but the physical bill states Rs {taxable_value}."
            }
            
        return {
            "status": "MATCHED", 
            "details": f"Invoice verified cleanly against GSTR-2B entry (Portal Status: {row['ITC Status']})."
        }
        
    except Exception as e:
        import traceback
        print(f"\n❌ Reconciliation Debug Crash Info:")
        traceback.print_exc()
        return {"status": "ERROR", "details": f"Reconciliation engine failure: {str(e)}"}