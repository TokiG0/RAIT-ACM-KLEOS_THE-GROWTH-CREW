# Implementation Plan - PocketCA (The GST Assistant in Your Pocket)

PocketCA is an offline-first, mobile-optimized GST reconciliation and Input Tax Credit (ITC) optimizer designed specifically for Indian MSMEs and kirana store owners. Since small traders face language barriers, lack access to direct GST APIs, and lose thousands of rupees in blocked ITC due to mismatched records or supplier defaults, PocketCA serves as their automated "Chartered Accountant."

It processes the government-provided GSTR-2B (Excel/CSV/PDF export) and compares it with purchase invoices, highlights discrepancies in plain language (multilingual: English, Hindi, Hinglish), shows the direct financial impact, and generates one-click WhatsApp action items to resolve mismatches with suppliers.

---

## User Review Required

We have designed a fully client-side, privacy-first architecture that runs entirely in the trader's browser. This guarantees:
1. **100% Privacy**: Financial data and invoices never leave the trader's device.
2. **Zero Server Costs**: The solution scales infinitely without database or hosting overheads.
3. **Offline Mode**: Kirana store owners can run reconciliation even in remote locations with poor internet.

Please review the proposed architecture and let us know if you approve this approach.

---

## Open Questions

> [!NOTE]
> There are no blocking open questions. We will implement standard Indian GSTR-2B fields (GSTIN, Supplier Name, Invoice Number, Date, Taxable Value, CGST, SGST, IGST, HSN/SAC, Eligibility) and support a comprehensive set of reconciliation rules out of the box.

---

## Proposed Changes

### [Component: PocketCA Web App (React + Vite)]

We will initialize a React SPA in the workspace directory using Vite. We will use Vanilla CSS for a premium, custom dashboard design that works flawlessly on mobile screens (smartphones) as well as desktop displays.

---

#### [NEW] [index.html](file:///c:/Suresh/Nintendo%203DS/PocketCA/index.html)
The HTML entry point including font definitions (Outfit & Plus Jakarta Sans) and metadata for SEO.

#### [NEW] [src/App.jsx](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/App.jsx)
The main controller. Manages state for:
- Language (English, Hindi, Hinglish)
- Loaded GSTR-2B records
- Scanned/Uploaded purchase invoices
- Reconciliation results
- Active navigation tab (Dashboard, Uploads, Report, Actions, Help)

#### [NEW] [src/index.css](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/index.css)
The global design system and styling tokens. Features:
- Dark mode theme with rich HSL colors (neon greens, cautionary ambers, and coral red status colors)
- Glassmorphic panels with subtle gradients
- Micro-animations for uploads and status charts
- Responsive layout rules optimized for touch targets on mobile

#### [NEW] [src/utils/dummyData.js](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/utils/dummyData.js)
Utility to generate and download:
1. A sample **GSTR-2B CSV file** (reflecting government portal uploads).
2. A sample **Purchase Invoices CSV file** (reflecting local records).
It will also contain pre-configured, realistic mismatched items so the user can immediately test the reconciliation engine.

#### [NEW] [src/utils/reconciliationEngine.js](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/utils/reconciliationEngine.js)
The core matching algorithm. It takes two arrays (GSTR-2B and Purchase Invoices) and performs fuzzy matching based on:
1. **Supplier GSTIN** (Exact)
2. **Invoice Number** (Fuzzy, ignoring prefixes/suffixes, e.g. `INV/2026/04` matches `2026/04` or `04`)
3. **Date** (Fuzzy, within 5 days tolerance)
4. **Amounts** (Taxable value & tax amounts, tracking discrepancies)
5. **HSN Codes** (Checks if the HSN matches, identifying wrong classifications that lock ITC)

It classifies each invoice into:
- `MATCHED`: Valid ITC (Green)
- `MISMATCH_HSN`: Blocked ITC (Yellow, HSN code mismatch)
- `MISMATCH_AMOUNT`: Reduced ITC (Yellow, tax rate or taxable value difference)
- `SUPPLIER_DEFAULT`: Supplier did not file/upload (Red, missing in GSTR-2B)
- `UNCLAIMED`: Invoice uploaded by supplier but missing in purchases (Blue, trader forgot to claim)

#### [NEW] [src/components/Dashboard.jsx](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/components/Dashboard.jsx)
Visual overview of ITC status:
- Financial summary cards (Claimable, Mismatched/Blocked, Supplier Defaults, Unclaimed)
- Dynamic CSS progress circles and bars showing the reconciliation percentage
- Simple English / Hindi / Hinglish translation card explaining the state of the business

#### [NEW] [src/components/Gstr2bImport.jsx](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/components/Gstr2bImport.jsx)
File import zone for GSTR-2B spreadsheet.
- Drag-and-drop file upload
- Handles CSV/XLSX parser (client-side)
- Provides "Download Sample GSTR-2B" button to make testing trivial

#### [NEW] [src/components/InvoiceUpload.jsx](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/components/InvoiceUpload.jsx)
Handles purchase invoice input.
- Allows dragging image/PDF files
- Features a **Mock OCR Visual Scanner**: When a file is uploaded, it draws a laser scanner overlay on the file, extracts key fields, and shows a premium sidebar containing:
  - Extracted Supplier Name & GSTIN
  - Extracted HSN, Tax Rate, Taxable Value
- Includes preset quick-load buttons (e.g., "Load Sample Invoice with HSN Mismatch", "Load Sample Invoice with Supplier Default") so the user can experience the scanner without uploading actual files.

#### [NEW] [src/components/Reconciliation.jsx](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/components/Reconciliation.jsx)
Detailed table of matched, mismatched, and missing records.
- Categorized filters (All, Ready to Claim, Blocked/Mismatched, Supplier Default, Unclaimed)
- Showcases exact delta calculations (e.g. "Invoice says 18% GST, but Supplier uploaded 12% GST - Loss of ₹1,200")

#### [NEW] [src/components/ActionCenter.jsx](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/components/ActionCenter.jsx)
Provides direct, actionable steps for the trader:
- **WhatsApp Outreach Utility**: Dynamically constructs pre-filled messages in the chosen language.
  - *Example (Hinglish)*: "Namaste [Supplier], aapka Bill No. [No] humare GST GSTR-2B me nahi mil raha hai. Kripya ise check karke portal par upload karein taaki humara ITC ₹[Amount] claim ho sake. Thank you!"
- **Export Correction List**: Download a simple Excel file to send to their accountant.

#### [NEW] [src/components/EducationHub.jsx](file:///c:/Suresh/Nintendo%203DS/PocketCA/src/components/EducationHub.jsx)
A simple FAQ & guide section structured like a "Smart CA" chat:
- "What is ITC?" -> "ITC is like a discount on your output tax..."
- "Why did my supplier not upload?" -> Explains GSTR-1 deadlines.
- "Why does a wrong HSN block credit?" -> Explains tax category restrictions.

---

## Verification Plan

### Automated Tests
- We will write a validation script `src/utils/reconciliationEngine.test.js` or run a local verification node script to verify fuzzy matching rules (e.g. invoice numbers with different delimiters, date differences).

### Manual Verification
1. Run Vite development server (`npm run dev`) and test the web app interface.
2. Download sample CSV files generated by the application.
3. Import the generated CSV files back into the application.
4. Verify OCR Scanning behavior using the interactive mock invoice scanner.
5. Verify that changing the language (English, Hindi, Hinglish) successfully updates the entire UI, including the generated WhatsApp messages.
6. Verify layout responsiveness on both desktop and simulated mobile dimensions.
