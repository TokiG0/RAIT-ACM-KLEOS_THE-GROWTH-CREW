// CSV Utilities for GSTR-2B and Purchase Invoices
// Manages parsing of uploaded CSVs and generation of empty CSV templates

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

// Triggers download of GSTR-2B empty CSV Template
export function downloadGstr2bTemplateCsv() {
  const headers = ["invoiceNumber", "invoiceDate", "supplierGstin", "supplierName", "hsnCode", "taxableValue", "gstRate", "cgst", "sgst", "igst", "totalAmount", "filingDate"];
  const csv = convertToCSV([], headers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "GSTR-2B_Template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Triggers download of Purchase Register empty CSV Template
export function downloadPurchasesTemplateCsv() {
  const headers = ["invoiceNumber", "invoiceDate", "supplierGstin", "supplierName", "hsnCode", "taxableValue", "gstRate", "cgst", "sgst", "igst", "totalAmount"];
  const csv = convertToCSV([], headers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "Purchase_Register_Template.csv");
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
