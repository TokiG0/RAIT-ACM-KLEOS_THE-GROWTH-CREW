# gst_engine/rules.py
from typing import List, Dict, Any

# 1. Production Master Reference Lookup (Can be expanded or moved to a database later)
# Structure: "HSN_CODE": {"expected_rate": "XX%", "category": "Product Category Name"}
HSN_MASTER_REGISTRY = {
    "2523": {"expected_rate": "28%", "category": "Cement"},
    "1512": {"expected_rate": "5%",  "category": "Sunflower Oil"},
    "1516": {"expected_rate": "12%", "category": "Vegetable Fats/Hydrogenated Oils"},
    "8471": {"expected_rate": "18%", "category": "Computers/Electronics"},
    "9965": {"expected_rate": "5%",  "category": "Goods Transport Services (GTA)"},
}

def run_rule_checks(invoice_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Executes structural, mathematical, and compliance cross-verifications 
    in sequential order of dependencies on any incoming invoice payload.
    """
    flags = []
    
    # Extract structural calculation fields safely
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
        return flags # Exit early if data types are fundamentally broken

    # =========================================================================
    # RULE 1: MATHEMATICAL TOTALS VERIFICATION (Vertical Sanity Check)
    # =========================================================================
    calculated_grand = taxable_value + cgst_total + sgst_total + igst_total
    if abs(calculated_grand - grand_total) > 1.0:  # 1 Rupee delta tolerance threshold
        flags.append({
            "type": "MATH_MISMATCH",
            "field": "grand_total",
            "found": grand_total,
            "expected": round(calculated_grand, 2),
            "description": f"Grand total mismatch. Document claims {grand_total}, but math summary equals {round(calculated_grand, 2)}."
        })

    # =========================================================================
    # RULE 2: PLACE OF SUPPLY PLACEHOLDER & TAX TYPE VALIDATION (Inter vs Intra)
    # =========================================================================
    supplier_gst = str(invoice_data.get("supplier_gstin", "")).strip()
    buyer_gst = str(invoice_data.get("buyer_gstin", "")).strip()
    
    if len(supplier_gst) >= 2 and len(buyer_gst) >= 2:
        supplier_state_code = supplier_gst[:2]
        buyer_state_code = buyer_gst[:2]
        
        # Intra-State (Same State): CGST + SGST must apply, IGST must be 0
        if supplier_state_code == buyer_state_code:
            if igst_total > 0 and (cgst_total == 0 or sgst_total == 0):
                flags.append({
                    "type": "TAX_TYPE_MISMATCH",
                    "field": "igst_amount",
                    "description": f"Intra-state transaction detected via GSTIN prefixes ({supplier_state_code}). Local CGST/SGST should apply instead of IGST."
                })
        # Inter-State (Different States): IGST must apply, CGST + SGST must be 0
        else:
            if (cgst_total > 0 or sgst_total > 0) and igst_total == 0:
                flags.append({
                    "type": "TAX_TYPE_MISMATCH",
                    "field": "cgst_sgst_amount",
                    "description": f"Inter-state transaction detected ({supplier_state_code} to {buyer_state_code}). Integrated IGST should apply instead of local taxes."
                })

    # =========================================================================
    # RULE 3: DYNAMIC LINE-ITEM VALIDATION (HSN Registry Lookup)
    # =========================================================================
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

        # Look up against the global master record registry
        if hsn in HSN_MASTER_REGISTRY:
            expected_rate = HSN_MASTER_REGISTRY[hsn]["expected_rate"]
            category = HSN_MASTER_REGISTRY[hsn]["category"]
            
            # Standardize string representations for clear comparisons (e.g., "28%" vs "28")
            clean_found_rate = raw_gst_rate.replace("%", "").strip()
            clean_expected_rate = expected_rate.replace("%", "").strip()
            
            if clean_found_rate and clean_found_rate != clean_expected_rate:
                flags.append({
                    "type": "TAX_RATE_MISMATCH",
                    "field": f"line_items[{idx}].gst_rate",
                    "found": raw_gst_rate,
                    "expected": expected_rate,
                    "description": f"Incorrect tax rate applied for {category} (HSN {hsn}). Found {raw_gst_rate}, expected statutory rate is {expected_rate}."
                })
        else:
            # Fallback note/flag if the HSN isn't recognized in your local engine lookup database
            # Useful for production logging to flag uncommon codes for secondary review
            pass

    return flags