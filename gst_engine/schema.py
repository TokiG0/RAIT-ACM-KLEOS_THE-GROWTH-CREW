# schema.py
from dataclasses import dataclass, asdict
from typing import List, Dict

@dataclass
class LineItem:
    sr: str
    description: str
    hsn_code: str
    quantity: str
    unit: str
    rate: str
    taxable_amount: str
    gst_rate: str
    gst_amount: str
    total: str

@dataclass
class InvoiceData:
    source_file: str
    doc_type: str
    supplier_gstin: str
    buyer_gstin: str
    invoice_number: str
    invoice_date: str
    place_of_supply: str
    grand_total: str
    cgst_amount: str
    sgst_amount: str
    igst_amount: str
    taxable_value: str
    line_items: List[LineItem]
    confidence: Dict[str, float]