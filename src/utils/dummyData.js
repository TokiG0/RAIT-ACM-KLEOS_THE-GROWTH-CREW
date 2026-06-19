// Dummy Data Generator for GSTR-2B and Purchase Invoices
// This aligns with the simulation clause in the problem statement.

export const SAMPLE_SUPPLIERS = {
  SHARMA_GROCERY: { name: "Sharma Grocery Distributors", gstin: "09AAAAA4321A1Z5", phone: "9876543210" },
  NITIN_DAIRY: { name: "Nitin Dairy Products Pvt Ltd", gstin: "09AABCN4412K1Z9", phone: "9812345678" },
  BAJAJ_PLASTICS: { name: "Bajaj Plastics & Packaging", gstin: "09AAAAP5562P1ZA", phone: "9988776655" },
  GUPTA_SOAP: { name: "Gupta Soap & Toiletries", gstin: "09AAAFG8293Q1Z2", phone: "8877665544" },
  AIRTEL: { name: "Airtel Business Services", gstin: "09AABCA2212N1Z4", phone: "18001030121" },
  KARAN_PAPER: { name: "Karan Paper Mills", gstin: "09AAAAC4451M1Z1", phone: "9012345678" },
};

// Realistic Purchase Invoices (What the trader has recorded locally)
export const DUMMY_PURCHASES = [
  {
    invoiceNumber: "INV-001",
    invoiceDate: "2026-06-01",
    supplierGstin: SAMPLE_SUPPLIERS.SHARMA_GROCERY.gstin,
    supplierName: SAMPLE_SUPPLIERS.SHARMA_GROCERY.name,
    hsnCode: "1901", // Malt food preparation
    taxableValue: 10000,
    gstRate: 18,
    cgst: 900,
    sgst: 900,
    igst: 0,
    totalAmount: 11800,
  },
  {
    invoiceNumber: "INV-002",
    invoiceDate: "2026-06-02",
    supplierGstin: SAMPLE_SUPPLIERS.NITIN_DAIRY.gstin,
    supplierName: SAMPLE_SUPPLIERS.NITIN_DAIRY.name,
    hsnCode: "0401", // Milk and cream
    taxableValue: 15000,
    gstRate: 5,
    cgst: 375,
    sgst: 375,
    igst: 0,
    totalAmount: 15750,
  },
  {
    invoiceNumber: "INV-003",
    invoiceDate: "2026-06-04",
    supplierGstin: SAMPLE_SUPPLIERS.BAJAJ_PLASTICS.gstin,
    supplierName: SAMPLE_SUPPLIERS.BAJAJ_PLASTICS.name,
    hsnCode: "3923", // Plastic bottles/boxes
    taxableValue: 20000,
    gstRate: 18, // 18% locally
    cgst: 1800,
    sgst: 1800,
    igst: 0,
    totalAmount: 23600,
  },
  {
    invoiceNumber: "INV-004",
    invoiceDate: "2026-06-06",
    supplierGstin: SAMPLE_SUPPLIERS.GUPTA_SOAP.gstin,
    supplierName: SAMPLE_SUPPLIERS.GUPTA_SOAP.name,
    hsnCode: "3401", // Soap
    taxableValue: 8000,
    gstRate: 18,
    cgst: 720,
    sgst: 720,
    igst: 0,
    totalAmount: 9440,
  },
  {
    invoiceNumber: "INV-005",
    invoiceDate: "2026-06-10",
    supplierGstin: SAMPLE_SUPPLIERS.KARAN_PAPER.gstin,
    supplierName: SAMPLE_SUPPLIERS.KARAN_PAPER.name,
    hsnCode: "4802", // Paper
    taxableValue: 30000,
    gstRate: 12,
    cgst: 1800,
    sgst: 1800,
    igst: 0,
    totalAmount: 33600,
  }
];

// Realistic GSTR-2B data (What suppliers uploaded to the GST portal)
export const DUMMY_GSTR2B = [
  {
    // Exact Match with INV-001
    invoiceNumber: "INV-001",
    invoiceDate: "2026-06-01",
    supplierGstin: SAMPLE_SUPPLIERS.SHARMA_GROCERY.gstin,
    supplierName: SAMPLE_SUPPLIERS.SHARMA_GROCERY.name,
    hsnCode: "1901",
    taxableValue: 10000,
    gstRate: 18,
    cgst: 900,
    sgst: 900,
    igst: 0,
    totalAmount: 11800,
    filingDate: "2026-06-11",
  },
  {
    // HSN Code Mismatch with INV-002 (Supplier put wrong HSN, e.g. 9987 - service, blocking retail ITC)
    invoiceNumber: "INV-002",
    invoiceDate: "2026-06-02",
    supplierGstin: SAMPLE_SUPPLIERS.NITIN_DAIRY.gstin,
    supplierName: SAMPLE_SUPPLIERS.NITIN_DAIRY.name,
    hsnCode: "9987", // Incorrect HSN in portal (Services)
    taxableValue: 15000,
    gstRate: 5,
    cgst: 375,
    sgst: 375,
    igst: 0,
    totalAmount: 15750,
    filingDate: "2026-06-10",
  },
  {
    // Tax Rate/Amount Mismatch with INV-003 (Supplier uploaded at 12% instead of 18%)
    invoiceNumber: "INV-003",
    invoiceDate: "2026-06-04",
    supplierGstin: SAMPLE_SUPPLIERS.BAJAJ_PLASTICS.gstin,
    supplierName: SAMPLE_SUPPLIERS.BAJAJ_PLASTICS.name,
    hsnCode: "3923",
    taxableValue: 20000,
    gstRate: 12, // Portal shows 12%
    cgst: 1200,
    sgst: 1200,
    igst: 0,
    totalAmount: 22400,
    filingDate: "2026-06-12",
  },
  {
    // INV-004 from Gupta Soap is MISSING here (Supplier Default)
    
    // Airtel internet invoice is here, but trader hasn't recorded it locally (Unclaimed ITC!)
    invoiceNumber: "TXN/998",
    invoiceDate: "2026-06-08",
    supplierGstin: SAMPLE_SUPPLIERS.AIRTEL.gstin,
    supplierName: SAMPLE_SUPPLIERS.AIRTEL.name,
    hsnCode: "9984",
    taxableValue: 2000,
    gstRate: 18,
    cgst: 180,
    sgst: 180,
    igst: 0,
    totalAmount: 2360,
    filingDate: "2026-06-11",
  },
  {
    // Karan Paper Mills INV-005 was uploaded by supplier under a wrong GSTIN (e.g. they typed ...1Z2 instead of ...1Z1)
    invoiceNumber: "INV-005",
    invoiceDate: "2026-06-10",
    supplierGstin: "09AAAAC4451M1Z2", // WRONG GSTIN on portal
    supplierName: SAMPLE_SUPPLIERS.KARAN_PAPER.name,
    hsnCode: "4802",
    taxableValue: 30000,
    gstRate: 12,
    cgst: 1800,
    sgst: 1800,
    igst: 0,
    totalAmount: 33600,
    filingDate: "2026-06-13",
  }
];

// Convert object array to CSV string
export function convertToCSV(array, headers) {
  const headerLine = headers.join(",");
  const rows = array.map(item => {
    return headers.map(header => {
      let val = item[header] === undefined || item[header] === null ? "" : item[header];
      // Escape commas and double quotes
      if (typeof val === "string") {
        val = val.replace(/"/g, '""');
        if (val.includes(",") || val.includes("\n") || val.includes('"')) {
          val = `"${val}"`;
        }
      }
      return val;
    }).join(",");
  });
  return [headerLine, ...rows].join("\n");
}

// Triggers download of GSTR-2B dummy CSV
export function downloadGstr2bCsv() {
  const headers = ["invoiceNumber", "invoiceDate", "supplierGstin", "supplierName", "hsnCode", "taxableValue", "gstRate", "cgst", "sgst", "igst", "totalAmount", "filingDate"];
  const csv = convertToCSV(DUMMY_GSTR2B, headers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "GSTR-2B_June_2026.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Triggers download of Purchase Register dummy CSV
export function downloadPurchasesCsv() {
  const headers = ["invoiceNumber", "invoiceDate", "supplierGstin", "supplierName", "hsnCode", "taxableValue", "gstRate", "cgst", "sgst", "igst", "totalAmount"];
  const csv = convertToCSV(DUMMY_PURCHASES, headers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "Purchase_Register_June_2026.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Parses GSTR-2B or Purchase CSV content
export function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse considering quotes (commas inside quotes)
    const values = [];
    let insideQuote = false;
    let currentVal = "";
    
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const char = line[charIndex];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        values.push(currentVal.trim().replace(/^["']|["']$/g, ""));
        currentVal = "";
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim().replace(/^["']|["']$/g, ""));
    
    const record = {};
    headers.forEach((header, index) => {
      let val = values[index] || "";
      // Convert to number if numeric
      if (val && !isNaN(val) && header !== "invoiceNumber" && header !== "supplierGstin" && header !== "hsnCode" && header !== "invoiceDate" && header !== "filingDate") {
        val = parseFloat(val);
      }
      record[header] = val;
    });
    records.push(record);
  }
  return records;
}
