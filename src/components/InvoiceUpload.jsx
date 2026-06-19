import React, { useState } from 'react';
import { Camera, FileText, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { SAMPLE_SUPPLIERS } from '../utils/dummyData';
import { uploadInvoice } from '../utils/api';

export default function InvoiceUpload({ currentLang, onAddScannedPurchase, backendActive }) {
  const t = TRANSLATIONS[currentLang];
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [scannedBill, setScannedBill] = useState(null);
  const [activePreset, setActivePreset] = useState(null);
  const [added, setAdded] = useState(false);
  const [uploadingError, setUploadingError] = useState(null);

  // Sample Bills visual data for preview
  const PRESET_BILLS = [
    {
      id: 'milk',
      title: t.scanDemo1,
      supplierName: SAMPLE_SUPPLIERS.NITIN_DAIRY.name,
      supplierGstin: SAMPLE_SUPPLIERS.NITIN_DAIRY.gstin,
      invoiceNumber: "INV-002",
      invoiceDate: "2026-06-02",
      hsnCode: "0401", // Correct Milk HSN
      taxableValue: 15000,
      gstRate: 5,
      cgst: 375,
      sgst: 375,
      igst: 0,
      totalAmount: 15750,
      // Scenario mismatch details
      status: "MISMATCH_HSN",
      explanation: "HSN Mismatch: Supplier uploaded HSN as 9987 (Services, blocked credit) in GSTR-2B. Purchase invoice requires HSN 0401. Double check with supplier.",
      explanationHi: "एचएसएन में अंतर: सप्लायर ने GSTR-2B में 9987 (सर्विस, ब्लॉक क्रेडिट) डाला है। बिल में 0401 (दूध) होना चाहिए। सप्लायर से बात करें।",
      explanationHing: "HSN code galat hai. Supplier ne portal par 9987 (Service, blocked ITC) dala hai, par bill me 0401 (Milk) hai. Supplier se correct karayein."
    },
    {
      id: 'soap',
      title: t.scanDemo2,
      supplierName: SAMPLE_SUPPLIERS.GUPTA_SOAP.name,
      supplierGstin: SAMPLE_SUPPLIERS.GUPTA_SOAP.gstin,
      invoiceNumber: "INV-004",
      invoiceDate: "2026-06-06",
      hsnCode: "3401",
      taxableValue: 8000,
      gstRate: 18,
      cgst: 720,
      sgst: 720,
      igst: 0,
      totalAmount: 9440,
      status: "SUPPLIER_DEFAULT",
      explanation: "Supplier Default: This invoice is completely missing from your GSTR-2B. You cannot claim ₹1,440 ITC until they upload it.",
      explanationHi: "सप्लायर डिफ़ॉल्ट: यह इनवॉइस आपके GSTR-2B में नहीं है। सप्लायर के अपलोड करने तक आप ₹1,440 का टैक्स लाभ नहीं ले सकते।",
      explanationHing: "Missing in GSTR-2B. Supplier ne upload nahi kiya hai. Jab tak upload nahi karenge, aap ₹1,440 ITC claim nahi kar sakte."
    },
    {
      id: 'paper',
      title: t.scanDemo3,
      supplierName: SAMPLE_SUPPLIERS.KARAN_PAPER.name,
      supplierGstin: SAMPLE_SUPPLIERS.KARAN_PAPER.gstin,
      invoiceNumber: "INV-005",
      invoiceDate: "2026-06-10",
      hsnCode: "4802",
      taxableValue: 30000,
      gstRate: 12,
      cgst: 1800,
      sgst: 1800,
      igst: 0,
      totalAmount: 33600,
      status: "MISMATCH_GSTIN",
      explanation: "GSTIN Error: Supplier uploaded this bill under a different GSTIN (09AAAAC4451M1Z2 instead of your GSTIN 09AAAAC4451M1Z1). Ask them to amend GSTR-1.",
      explanationHi: "गलत जीएसटी नंबर: सप्लायर ने यह बिल दूसरे GSTIN (09AAAAC4451M1Z2) पर चढ़ा दिया है। सुधार के लिए उनसे कहें।",
      explanationHing: "GSTIN Match nahi hai. Supplier ne portal par galat GSTIN (09AAAAC4451M1Z2) par upload kar diya hai. Unhe theek karne ko bole."
    }
  ];

  const triggerScan = (preset) => {
    setActivePreset(preset);
    setScanning(true);
    setScanStep(0);
    setAdded(false);
    
    // Aesthetic multi-step scanning sequence
    const interval = setInterval(() => {
      setScanStep(prev => {
        if (prev >= 2) {
          clearInterval(interval);
          setScanning(false);
          setScannedBill(preset);
          return 2;
        }
        return prev + 1;
      });
    }, 1200);
  };

  const handleRealFileUpload = async (file) => {
    setScanning(true);
    setScanStep(0);
    setAdded(false);
    setUploadingError(null);
    setScannedBill(null);

    // Dynamic scanning progress steps
    const stepInterval = setInterval(() => {
      setScanStep(prev => (prev < 2 ? prev + 1 : prev));
    }, 1200);

    try {
      const response = await uploadInvoice(file);
      clearInterval(stepInterval);
      setScanStep(2);
      
      const mappedBill = {
        id: response.id || `scanned-${response.document_number}`,
        supplierName: response.trade_legal_name || "Unknown Supplier",
        supplierGstin: response.gstin_of_supplier || "Unknown GSTIN",
        invoiceNumber: response.document_number || "INV-UNKNOWN",
        invoiceDate: response.document_date || "01-Jun-2026",
        hsnCode: response.line_items?.[0]?.hsn_code || "0000",
        taxableValue: parseFloat(response.taxable_value || 0),
        gstRate: response.line_items?.[0]?.gst_rate ? parseFloat(response.line_items[0].gst_rate.replace('%', '')) : 18,
        cgst: parseFloat(response.central_tax || 0),
        sgst: parseFloat(response.state_ut_tax || 0),
        igst: parseFloat(response.integrated_tax || 0),
        totalAmount: parseFloat(response.grand_total || 0),
        status: response.warnings && response.warnings.length > 0 ? "NEEDS_REVIEW" : "MATCHED",
        explanation: response.warnings && response.warnings.length > 0
          ? `Rule warnings: ${response.warnings.join('. ')}`
          : "No compliance issues found. Calculation math balances.",
        explanationHi: response.warnings && response.warnings.length > 0
          ? `चेतावनी: ${response.warnings.join('. ')}`
          : "कोई अनुपालन समस्या नहीं मिली। कर और गणना संतुलित हैं।",
        explanationHing: response.warnings && response.warnings.length > 0
          ? `Warnings: ${response.warnings.join('. ')}`
          : "Koi verification mismatch nahi mila. Safe to claim ITC."
      };
      setScannedBill(mappedBill);
    } catch (err) {
      clearInterval(stepInterval);
      setUploadingError(err.message || "Failed to upload and parse invoice.");
    } finally {
      setScanning(false);
    }
  };

  const handleAddToPurchases = () => {
    if (!scannedBill) return;
    onAddScannedPurchase(scannedBill);
    setAdded(true);
  };

  const getStatusClass = (status) => {
    switch(status) {
      case 'MATCHED': return 'badge-green';
      case 'MISMATCH_HSN': return 'badge-yellow';
      case 'MISMATCH_AMOUNT': return 'badge-yellow';
      case 'SUPPLIER_DEFAULT': return 'badge-red';
      case 'MISMATCH_GSTIN': return 'badge-red';
      default: return 'badge-blue';
    }
  };

  const getExplanation = (bill) => {
    if (currentLang === 'hi') return bill.explanationHi;
    if (currentLang === 'hing') return bill.explanationHing;
    return bill.explanation;
  };

  return (
    <div className="ocr-upload-container">
      <div className="ocr-layout-grid">
        {/* Upload & Preset Ingestion */}
        <div className="ocr-control-panel glass-panel">
          <h3>{t.scanTitle}</h3>
          <p className="text-secondary">{t.scanSubtitle}</p>

          {/* Fake Image Drop Area */}
          <div 
            className="ocr-dropzone"
            onClick={() => {
              if (!backendActive) {
                triggerScan(PRESET_BILLS[Math.floor(Math.random() * PRESET_BILLS.length)]);
              }
            }}
            style={{ position: 'relative' }}
          >
            {backendActive && (
              <input 
                type="file" 
                accept=".pdf,image/*" 
                className="file-input-hidden" 
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) handleRealFileUpload(file);
                }} 
              />
            )}
            <Camera size={48} className="text-primary-dim animate-pulse" />
            <p>{backendActive ? "Drag & drop or Click to upload invoice" : t.scanDragDrop}</p>
            <span className="text-small text-secondary">(Accepts JPEG, PNG, PDF receipts)</span>
          </div>

          {uploadingError && (
            <div className="alert alert-red mt-16 p-12 flex-center-inline gap-8" style={{
              backgroundColor: 'var(--red-glow)',
              color: 'var(--red)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--red)'
            }}>
              <AlertCircle size={16} />
              <span className="text-small">{uploadingError}</span>
            </div>
          )}

          {/* Preset Buttons */}
          <div className="ocr-presets-container">
            <h4>{t.scanDemoHeader}</h4>
            <p className="text-small text-secondary">{t.scanDemoDesc}</p>
            <div className="presets-list">
              {PRESET_BILLS.map(preset => (
                <button 
                  key={preset.id}
                  className={`btn-preset ${activePreset?.id === preset.id ? 'active' : ''}`}
                  onClick={() => triggerScan(preset)}
                >
                  <FileText size={16} className="mr-8" />
                  <span>{preset.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Scan Results & Visuals */}
        <div className="ocr-results-panel glass-panel">
          {scanning && (
            <div className="ocr-scanning-loader">
              <div className="laser-scanner"></div>
              {/* Fake visual receipt during scanning */}
              <div className="scanned-image-placeholder">
                <div className="mock-receipt-header">
                  <div className="line long-line bg-dark"></div>
                  <div className="line short-line bg-dark"></div>
                </div>
                <div className="mock-receipt-body">
                  <div className="line bg-dark"></div>
                  <div className="line bg-dark"></div>
                  <div className="line bg-dark"></div>
                </div>
              </div>
              
              <div className="scanning-status-text">
                <RefreshCw className="animate-spin text-primary mr-8" size={18} />
                <span>
                  {scanStep === 0 && t.scanningProgress}
                  {scanStep === 1 && t.extractingGSTIN}
                  {scanStep === 2 && t.matchingPortal}
                </span>
              </div>
            </div>
          )}

          {!scanning && scannedBill && (
            <div className="ocr-scan-report">
              <div className="scan-report-header">
                <h3>{t.scanResults}</h3>
                <span className={`badge ${getStatusClass(scannedBill.status)}`}>
                  {scannedBill.status === 'MATCHED' ? 'Perfect Match' : scannedBill.status.replace('_', ' ')}
                </span>
              </div>

              <div className="scan-report-grid">
                {/* Visual Bill Preview (HTML formatted Receipt) */}
                <div className="bill-preview-paper">
                  <div className="receipt-border-top"></div>
                  <div className="receipt-content">
                    <div className="receipt-org-name">{scannedBill.supplierName}</div>
                    <div className="receipt-org-gstin">GSTIN: {scannedBill.supplierGstin}</div>
                    <div className="receipt-divider"></div>
                    <div className="receipt-row">
                      <span>Inv No: {scannedBill.invoiceNumber}</span>
                      <span>Date: {scannedBill.invoiceDate}</span>
                    </div>
                    <div className="receipt-divider"></div>
                    <div className="receipt-table-header">
                      <span>Item / HSN</span>
                      <span>Total</span>
                    </div>
                    <div className="receipt-table-row">
                      <span>Goods (HSN: {scannedBill.hsnCode})</span>
                      <span>₹{scannedBill.taxableValue}</span>
                    </div>
                    <div className="receipt-divider"></div>
                    <div className="receipt-row text-right">
                      <span>Tax ({scannedBill.gstRate}%):</span>
                      <span>₹{(scannedBill.cgst + scannedBill.sgst + scannedBill.igst)}</span>
                    </div>
                    <div className="receipt-row text-right text-bold">
                      <span>Grand Total:</span>
                      <span>₹{scannedBill.totalAmount}</span>
                    </div>
                  </div>
                  <div className="receipt-border-bottom"></div>
                </div>

                {/* Extracted JSON values */}
                <div className="extracted-fields-box">
                  <div className="field-row">
                    <span className="field-label">{t.invoiceNumLabel}</span>
                    <span className="field-value highlight">{scannedBill.invoiceNumber}</span>
                  </div>
                  <div className="field-row">
                    <span className="field-label">{t.dateLabel}</span>
                    <span className="field-value">{scannedBill.invoiceDate}</span>
                  </div>
                  <div className="field-row">
                    <span className="field-label">{t.gstinLabel}</span>
                    <span className="field-value">{scannedBill.supplierGstin}</span>
                  </div>
                  <div className="field-row">
                    <span className="field-label">{t.hsnLabel}</span>
                    <span className="field-value highlight-yellow">{scannedBill.hsnCode}</span>
                  </div>
                  <div className="field-row">
                    <span className="field-label">{t.amountLabel}</span>
                    <span className="field-value">₹{scannedBill.taxableValue}</span>
                  </div>
                  <div className="field-row">
                    <span className="field-label">{t.taxLabel}</span>
                    <span className="field-value">₹{(scannedBill.cgst + scannedBill.sgst + scannedBill.igst)}</span>
                  </div>
                </div>
              </div>

              {/* Explanatory Message */}
              <div className="scan-explanation-box">
                <AlertCircle className="text-primary-dim mr-8 flex-shrink-0" size={20} />
                <p className="text-secondary">{getExplanation(scannedBill)}</p>
              </div>

              {/* Add to Purchases Action */}
              <button 
                className={`btn-primary w-100 flex-center ${added ? 'btn-success' : ''}`}
                onClick={handleAddToPurchases}
                disabled={added}
              >
                {added ? (
                  <>
                    <Check size={18} className="mr-8" />
                    <span>Added to Purchases!</span>
                  </>
                ) : (
                  <span>{t.btnAddToPurchases}</span>
                )}
              </button>
            </div>
          )}

          {!scanning && !scannedBill && (
            <div className="ocr-empty-state">
              <FileText size={48} className="text-secondary opacity-30" />
              <p className="text-secondary">Please select an invoice on the left or drop an image to see the scanner extract details and reconcile.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
