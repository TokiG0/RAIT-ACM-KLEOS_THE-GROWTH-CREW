import React, { useState } from 'react';
import { Upload, FileSpreadsheet, ArrowRight, Download, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { downloadGstr2bCsv, downloadPurchasesCsv, parseCSV, DUMMY_GSTR2B, DUMMY_PURCHASES } from '../utils/dummyData';
import { parseGstr2bExcel } from '../utils/api';

export default function Gstr2bImport({ 
  gstrRecords, 
  purchaseRecords, 
  onLoadGstr, 
  onLoadPurchases, 
  onLoadDemoData, 
  currentLang,
  backendActive
}) {
  const t = TRANSLATIONS[currentLang];
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [dragActive, setDragActive] = useState({ gstr: false, purchase: false });
  const [excelError, setExcelError] = useState(null);

  // Load demo datasets instantly
  const handleLoadDemo = () => {
    setLoadingDemo(true);
    setTimeout(() => {
      onLoadDemoData();
      setLoadingDemo(false);
    }, 800); // Aesthetic simulation delay
  };

  const handleExcelUpload = async (file, type) => {
    if (type !== 'gstr') {
      setExcelError("Excel worksheets (.xlsx) are supported for GSTR-2B Portal uploads. Please upload a standard CSV file for your internal Purchase Register.");
      return;
    }
    setExcelError(null);
    try {
      const records = await parseGstr2bExcel(file);
      if (records && records.length > 0) {
        const mapped = records.map(r => ({
          invoiceNumber: r.invoice_number,
          invoiceDate: r.invoice_date,
          supplierGstin: r.supplier_gstin,
          supplierName: r.supplier_name,
          hsnCode: r.line_items?.[0]?.hsn_code || "1512",
          taxableValue: parseFloat(r.taxable_value || 0),
          gstRate: r.line_items?.[0]?.gst_rate ? parseFloat(r.line_items[0].gst_rate.replace('%', '')) : 18,
          cgst: parseFloat(r.cgst_amount || 0),
          sgst: parseFloat(r.sgst_amount || 0),
          igst: parseFloat(r.igst_amount || 0),
          totalAmount: parseFloat(r.grand_total || 0)
        }));
        onLoadGstr(mapped);
      } else {
        setExcelError("No valid invoice rows found in Excel sheet. Check template.");
      }
    } catch (err) {
      setExcelError(err.message || "Failed to process GSTR-2B Excel worksheet.");
    }
  };

  // CSV/Excel File reader
  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (isExcel) {
      if (backendActive) {
        handleExcelUpload(file, type);
      } else {
        setExcelError("GSTR-2B Excel ingestion requires the Python backend API to be connected. Start server.py or upload a CSV file instead.");
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const parsedData = parseCSV(event.target.result);
      if (type === 'gstr') {
        onLoadGstr(parsedData);
      } else {
        onLoadPurchases(parsedData);
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e, type, activeState) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(prev => ({ ...prev, [type]: activeState }));
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(prev => ({ ...prev, [type]: false }));
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      if (isExcel) {
        if (backendActive) {
          handleExcelUpload(file, type);
        } else {
          setExcelError("GSTR-2B Excel ingestion requires the Python backend API to be connected. Start server.py or upload a CSV file instead.");
        }
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const parsedData = parseCSV(event.target.result);
        if (type === 'gstr') {
          onLoadGstr(parsedData);
        } else {
          onLoadPurchases(parsedData);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="import-view-container">
      {/* Load Demo Section */}
      <div className="demo-data-section glass-panel">
        <div className="demo-info">
          <h3>{t.loadPresetsBtn}</h3>
          <p className="text-secondary">{t.loadPresetsDesc}</p>
        </div>
        <button 
          className="btn-primary flex-center" 
          onClick={handleLoadDemo}
          disabled={loadingDemo}
        >
          {loadingDemo ? (
            <>
              <RefreshCw className="animate-spin mr-8" size={18} />
              <span>Loading...</span>
            </>
          ) : (
            <>
              <FileSpreadsheet size={18} className="mr-8" />
              <span>{t.loadPresetsBtn}</span>
            </>
          )}
        </button>
      </div>

      {/* Grid of File Ingestion */}
      <div className="import-grid">
        {/* Left Side: GSTR-2B Import */}
        <div className="import-card glass-panel">
          <div className="import-card-header">
            <div className="badge badge-gstr">Government Portal</div>
            <h3>{t.importTitle}</h3>
            <p className="text-secondary">{t.importSubtitle}</p>
          </div>

          <div 
            className={`drag-drop-zone ${dragActive.gstr ? 'drag-active' : ''} ${gstrRecords.length > 0 ? 'file-loaded' : ''}`}
            onDragEnter={(e) => handleDrag(e, 'gstr', true)}
            onDragOver={(e) => handleDrag(e, 'gstr', true)}
            onDragLeave={(e) => handleDrag(e, 'gstr', false)}
            onDrop={(e) => handleDrop(e, 'gstr')}
          >
            {gstrRecords.length > 0 ? (
              <div className="loaded-state">
                <Check className="text-green animate-bounce" size={40} />
                <p className="text-green text-bold">{t.recordsLoaded.replace('{count}', gstrRecords.length)}</p>
                <span className="text-secondary">Click to upload another file</span>
              </div>
            ) : (
              <div className="empty-state">
                <Upload size={40} className="text-primary-dim" />
                <p>{t.dragDropText}</p>
              </div>
            )}
            <input 
              type="file" 
              accept={backendActive ? ".csv,.xlsx,.xls" : ".csv"} 
              className="file-input-hidden" 
              onChange={(e) => handleFileChange(e, 'gstr')} 
            />
          </div>

          {excelError && (
            <div className="alert alert-red p-12 flex-center-inline gap-8" style={{
              backgroundColor: 'var(--red-glow)',
              color: 'var(--red)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--red)'
            }}>
              <AlertCircle size={16} />
              <span className="text-small">{excelError}</span>
            </div>
          )}

          <button className="btn-secondary flex-center" onClick={downloadGstr2bCsv}>
            <Download size={16} className="mr-8" />
            <span>{t.downloadDummyBtn}</span>
          </button>
        </div>

        {/* Right Side: Purchase Register Import */}
        <div className="import-card glass-panel">
          <div className="import-card-header">
            <div className="badge badge-purchase">Store Register</div>
            <h3>Import Purchase Register</h3>
            <p className="text-secondary">Upload your internal purchase register (CSV format) to match invoices.</p>
          </div>

          <div 
            className={`drag-drop-zone ${dragActive.purchase ? 'drag-active' : ''} ${purchaseRecords.length > 0 ? 'file-loaded' : ''}`}
            onDragEnter={(e) => handleDrag(e, 'purchase', true)}
            onDragOver={(e) => handleDrag(e, 'purchase', true)}
            onDragLeave={(e) => handleDrag(e, 'purchase', false)}
            onDrop={(e) => handleDrop(e, 'purchase')}
          >
            {purchaseRecords.length > 0 ? (
              <div className="loaded-state">
                <Check className="text-green animate-bounce" size={40} />
                <p className="text-green text-bold">{t.recordsLoaded.replace('{count}', purchaseRecords.length)}</p>
                <span className="text-secondary">Click to upload another file</span>
              </div>
            ) : (
              <div className="empty-state">
                <Upload size={40} className="text-primary-dim" />
                <p>Drag and drop your Purchase Register CSV here, or click to browse</p>
              </div>
            )}
            <input 
              type="file" 
              accept=".csv" 
              className="file-input-hidden" 
              onChange={(e) => handleFileChange(e, 'purchase')} 
            />
          </div>

          <button className="btn-secondary flex-center" onClick={downloadPurchasesCsv}>
            <Download size={16} className="mr-8" />
            <span>{t.downloadPurchasesBtn}</span>
          </button>
        </div>
      </div>

      {/* Data Load Status Summary */}
      <div className="status-summary-card glass-panel">
        <h4>Data Upload Status</h4>
        <div className="status-indicator-grid">
          <div className="status-indicator-item">
            <span className="text-secondary">{t.gstrStatus}:</span>
            {gstrRecords.length > 0 ? (
              <span className="badge badge-green">{t.statusLoaded.replace('{count}', gstrRecords.length)}</span>
            ) : (
              <span className="badge badge-red">{t.statusNotLoaded}</span>
            )}
          </div>
          <div className="status-indicator-item">
            <span className="text-secondary">{t.purchaseStatus}:</span>
            {purchaseRecords.length > 0 ? (
              <span className="badge badge-green">{t.statusLoaded.replace('{count}', purchaseRecords.length)}</span>
            ) : (
              <span className="badge badge-red">{t.statusNotLoaded}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
