import React, { useState } from 'react';
import { Camera, FileText, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { uploadInvoice } from '../utils/api';

export default function InvoiceUpload({ currentLang, onAddScannedPurchase, backendActive }) {
  const t = TRANSLATIONS[currentLang];
  const ocrMode = 'vlm'; // local Qwen VLM is the only engine
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [scannedBill, setScannedBill] = useState(null);
  const [added, setAdded] = useState(false);
  const [uploadingError, setUploadingError] = useState(null);

  // States to keep track of the actual uploaded file preview
  const [uploadedFileUrl, setUploadedFileUrl] = useState(null);
  const [uploadedFileType, setUploadedFileType] = useState(null);
  const [resultTab, setResultTab] = useState('form'); // 'form' or 'json'



  const handleRealFileUpload = async (file) => {
    setScanning(true);
    setScanStep(0);
    setAdded(false);
    setUploadingError(null);
    setScannedBill(null);

    // Create file preview URL
    try {
      const url = URL.createObjectURL(file);
      setUploadedFileUrl(url);
      setUploadedFileType(file.type);
    } catch (e) {
      console.error("Failed to generate file preview:", e);
    }

    // Dynamic scanning progress steps
    const maxSteps = 3;
    const stepInterval = setInterval(() => {
      setScanStep(prev => (prev < maxSteps ? prev + 1 : prev));
    }, 2500);

    try {
      const response = await uploadInvoice(file, ocrMode);
      clearInterval(stepInterval);
      setScanStep(maxSteps);
      
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
      if (err.name === 'TypeError' || err.message.includes('fetch')) {
        setUploadingError("Backend server offline. Please start the Python backend (python backend/server.py) to enable real-time VLM parsing.");
      } else {
        setUploadingError(err.message || "Failed to upload and parse invoice.");
      }
    } finally {
      setScanning(false);
    }
  };

  const handleFieldChange = (key, value) => {
    setScannedBill(prev => {
      if (!prev) return null;
      const updated = { ...prev, [key]: value };
      
      // Auto-recalculate totals if amounts are edited
      if (key === 'taxableValue' || key === 'cgst' || key === 'sgst' || key === 'igst') {
        const taxable = parseFloat(updated.taxableValue || 0);
        const cgst = parseFloat(updated.cgst || 0);
        const sgst = parseFloat(updated.sgst || 0);
        const igst = parseFloat(updated.igst || 0);
        updated.totalAmount = parseFloat((taxable + cgst + sgst + igst).toFixed(2));
      }
      return updated;
    });
  };

  const handleAddToPurchases = async () => {
    if (!scannedBill) return;

    if (backendActive && scannedBill.id && !String(scannedBill.id).startsWith('scanned-')) {
      try {
        // Confirm manual changes to SQLite DB before adding to React purchases list
        const response = await fetch(`http://localhost:5000/api/purchase-registry/${scannedBill.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            supplierName: scannedBill.supplierName,
            supplierGstin: scannedBill.supplierGstin,
            invoiceNumber: scannedBill.invoiceNumber,
            invoiceDate: scannedBill.invoiceDate,
            hsnCode: scannedBill.hsnCode,
            taxableValue: scannedBill.taxableValue,
            cgst: scannedBill.cgst,
            sgst: scannedBill.sgst,
            igst: scannedBill.igst,
            totalAmount: scannedBill.totalAmount,
            line_items: [
              {
                sr: "1",
                description: "Goods / Supplies",
                hsn_code: scannedBill.hsnCode,
                taxable_amount: String(scannedBill.taxableValue),
                gst_rate: String(scannedBill.gstRate) + "%",
                gst_amount: String(scannedBill.cgst + scannedBill.sgst + scannedBill.igst),
                total: String(scannedBill.totalAmount)
              }
            ]
          })
        });

        if (response.ok) {
          const updated = await response.json();
          const finalBill = {
            ...scannedBill,
            status: updated.needs_review ? "NEEDS_REVIEW" : "MATCHED",
            explanation: updated.warnings && updated.warnings.length > 0
              ? `Compliance Issues: ${updated.warnings.join('. ')}`
              : "No compliance issues found. Calculation math balances."
          };
          onAddScannedPurchase(finalBill);
        } else {
          onAddScannedPurchase(scannedBill);
        }
      } catch (err) {
        console.error("Failed to save edited details in DB:", err);
        onAddScannedPurchase(scannedBill);
      }
    } else {
      onAddScannedPurchase(scannedBill);
    }
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

  const getScanningText = () => {
    switch(scanStep) {
      case 0: return "Initializing GPU & loading Qwen2.5-VL neural weights (may take 2-5 mins on first run)...";
      case 1: return "Resizing image & optimizing tile grid budget...";
      case 2: return "Running vision-language model (Qwen2.5-VL) inference...";
      case 3: return "Formatting structured JSON and running CA rules audit...";
      default: return "Processing...";
    }
  };

  return (
    <div className="ocr-upload-container">
      <div className="ocr-layout-grid">
        {/* Upload & Preset Ingestion */}
        <div className="ocr-control-panel glass-panel">
          <h3>{t.scanTitle}</h3>
          <p className="text-secondary">{t.scanSubtitle}</p>

          {/* Real-time neural engine active info */}
          <div className="alert alert-yellow p-12 mb-16" style={{
            backgroundColor: 'var(--primary-glow)',
            color: 'var(--primary-dim)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--primary)',
            fontSize: '12px',
            lineHeight: '1.4'
          }}>
            <AlertCircle size={16} style={{ display: 'inline-block', marginRight: '6px', verticalAlign: 'middle' }} />
            <strong>Real-time Neural Engine Active:</strong> Using local `Qwen2.5-VL-7B` model for structured OCR. First scan will download and load model weights (~4.5 GB) into VRAM.
          </div>

          {/* Image Drop Area - ALWAYS accepts file clicks */}
          <div 
            className="ocr-dropzone"
            style={{ position: 'relative' }}
          >
            <input 
              type="file" 
              accept=".pdf,image/*" 
              className="file-input-hidden" 
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  handleRealFileUpload(file);
                }
              }} 
            />
            <Camera size={48} className="text-primary-dim animate-pulse" />
            <p>Drag & drop or Click to upload invoice</p>
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
              
              <div className="scanning-status-text" style={{ textAlign: 'center', padding: '0 20px', maxWidth: '360px' }}>
                <RefreshCw className="animate-spin text-primary mr-8" size={18} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                <span>{getScanningText()}</span>
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
                {/* Visual Bill Preview (HTML formatted Receipt OR actual uploaded file) */}
                <div className="bill-preview-paper" style={{ padding: '0', background: 'transparent', boxShadow: 'none' }}>
                  {uploadedFileUrl ? (
                    uploadedFileType?.startsWith('image/') ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="text-secondary text-small font-bold" style={{ fontSize: '11px', letterSpacing: '0.05em' }}>UPLOADED IMAGE</div>
                        <img 
                          src={uploadedFileUrl} 
                          alt="Uploaded Invoice" 
                          style={{ 
                            width: '100%', 
                            maxHeight: '320px', 
                            objectFit: 'contain', 
                            borderRadius: 'var(--radius-sm)', 
                            border: '1px solid var(--border-color)',
                            background: '#FFFFFF'
                          }} 
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="text-secondary text-small font-bold" style={{ fontSize: '11px', letterSpacing: '0.05em' }}>UPLOADED PDF DOCUMENT</div>
                        <div style={{ 
                          width: '100%', 
                          height: '320px', 
                          borderRadius: 'var(--radius-sm)', 
                          border: '1px solid var(--border-color)',
                          background: 'rgba(255,255,255,0.02)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '12px'
                        }}>
                          <FileText size={48} className="text-primary-dim" />
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>PDF Invoice Document</span>
                          <a 
                            href={uploadedFileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="btn-preset" 
                            style={{ padding: '6px 12px', fontSize: '11px', textDecoration: 'none' }}
                          >
                            Open PDF in New Tab
                          </a>
                        </div>
                      </div>
                    )
                  ) : null}
                </div>

                {/* Right Panel: Form Editor or Raw JSON */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Tab Selector */}
                  <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <button
                      type="button"
                      className={`filter-btn ${resultTab === 'form' ? 'active' : ''}`}
                      onClick={() => setResultTab('form')}
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px' }}
                    >
                      Form Editor
                    </button>
                    <button
                      type="button"
                      className={`filter-btn ${resultTab === 'json' ? 'active' : ''}`}
                      onClick={() => setResultTab('json')}
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px' }}
                    >
                      Raw JSON
                    </button>
                  </div>

                  {resultTab === 'form' ? (
                    <div className="extracted-fields-box" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className="field-row">
                        <span className="field-label">{t.invoiceNumLabel}</span>
                        <input 
                          type="text" 
                          value={scannedBill.invoiceNumber}
                          onChange={(e) => handleFieldChange('invoiceNumber', e.target.value)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--primary-dim)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textAlign: 'right',
                            fontSize: '13px',
                            fontWeight: '500',
                            width: '130px'
                          }}
                        />
                      </div>
                      <div className="field-row">
                        <span className="field-label">{t.dateLabel}</span>
                        <input 
                          type="text" 
                          value={scannedBill.invoiceDate}
                          onChange={(e) => handleFieldChange('invoiceDate', e.target.value)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textAlign: 'right',
                            fontSize: '13px',
                            width: '130px'
                          }}
                        />
                      </div>
                      <div className="field-row">
                        <span className="field-label">{t.gstinLabel}</span>
                        <input 
                          type="text" 
                          value={scannedBill.supplierGstin}
                          onChange={(e) => handleFieldChange('supplierGstin', e.target.value)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textAlign: 'right',
                            fontSize: '13px',
                            width: '150px'
                          }}
                        />
                      </div>
                      <div className="field-row">
                        <span className="field-label">{t.hsnLabel}</span>
                        <input 
                          type="text" 
                          value={scannedBill.hsnCode}
                          onChange={(e) => handleFieldChange('hsnCode', e.target.value)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--yellow)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textAlign: 'right',
                            fontSize: '13px',
                            width: '90px'
                          }}
                        />
                      </div>
                      <div className="field-row">
                        <span className="field-label">{t.amountLabel}</span>
                        <input 
                          type="number" 
                          value={scannedBill.taxableValue}
                          onChange={(e) => handleFieldChange('taxableValue', parseFloat(e.target.value) || 0)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textAlign: 'right',
                            fontSize: '13px',
                            width: '110px'
                          }}
                        />
                      </div>
                      <div className="field-row" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '6px' }}>
                        <span className="field-label" style={{ alignSelf: 'center' }}>CGST / SGST / IGST</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input 
                            type="number" 
                            value={scannedBill.cgst} 
                            onChange={(e) => handleFieldChange('cgst', parseFloat(e.target.value) || 0)}
                            title="CGST"
                            style={{
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              padding: '2px 4px',
                              borderRadius: '4px',
                              textAlign: 'right',
                              fontSize: '12px',
                              width: '52px'
                            }}
                          />
                          <input 
                            type="number" 
                            value={scannedBill.sgst} 
                            onChange={(e) => handleFieldChange('sgst', parseFloat(e.target.value) || 0)}
                            title="SGST"
                            style={{
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              padding: '2px 4px',
                              borderRadius: '4px',
                              textAlign: 'right',
                              fontSize: '12px',
                              width: '52px'
                            }}
                          />
                          <input 
                            type="number" 
                            value={scannedBill.igst} 
                            onChange={(e) => handleFieldChange('igst', parseFloat(e.target.value) || 0)}
                            title="IGST"
                            style={{
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              padding: '2px 4px',
                              borderRadius: '4px',
                              textAlign: 'right',
                              fontSize: '12px',
                              width: '52px'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <pre style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--border-color)',
                      padding: '12px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--primary-dim)',
                      fontFamily: 'monospace',
                      fontSize: '10px',
                      overflowX: 'auto',
                      maxHeight: '260px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: '0',
                      textAlign: 'left'
                    }}>
                      {JSON.stringify({
                        id: scannedBill.id,
                        doc_type: "Tax Invoice",
                        supplier_gstin: scannedBill.supplierGstin,
                        supplier_name: scannedBill.supplierName,
                        invoice_number: scannedBill.invoiceNumber,
                        invoice_date: scannedBill.invoiceDate,
                        hsn_code: scannedBill.hsnCode,
                        taxable_value: String(scannedBill.taxableValue),
                        cgst_amount: String(scannedBill.cgst),
                        sgst_amount: String(scannedBill.sgst),
                        igst_amount: String(scannedBill.igst),
                        grand_total: String(scannedBill.totalAmount),
                        status: scannedBill.status,
                        explanation: scannedBill.explanation
                      }, null, 2)}
                    </pre>
                  )}
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
