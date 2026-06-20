import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, Download, FileText, FileSpreadsheet,
  Search, RefreshCw, AlertCircle, CheckCircle2,
  ChevronDown, X,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { convertToCSV, parseCSV } from '../utils/csvHelper';
import { getPurchaseRegistry } from '../utils/api';

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normaliseRecord(r) {
  return {
    invoiceNumber:  r.invoiceNumber  || r.document_number       || r['Invoice No.']   || '',
    invoiceDate:    r.invoiceDate    || r.document_date          || r['Invoice Date']  || '',
    supplierGstin:  r.supplierGstin  || r.gstin_of_supplier     || r['Receiver GSTIN']|| '',
    supplierName:   r.supplierName   || r.trade_legal_name      || r['Receiver Name'] || '',
    hsnCode:        r.hsnCode        || r['HSN Code']           || '',
    taxableValue:   parseFloat(r.taxableValue  || r.taxable_value  || r['Taxable Value']  || 0),
    gstRate:        String(r.gstRate  || r['Rate (%)'] || '18').replace('%', ''),
    igst:           parseFloat(r.igst  || r.integrated_tax || r['IGST'] || 0),
    cgst:           parseFloat(r.cgst  || r.central_tax   || r['CGST'] || 0),
    sgst:           parseFloat(r.sgst  || r.state_ut_tax  || r['SGST'] || 0),
    totalAmount:    parseFloat(r.totalAmount || r.grand_total   || r['Invoice Value']  || 0),
  };
}

// ── export helpers ────────────────────────────────────────────────────────────
function exportCSV(rows, period) {
  const headers = ['Sr.No','Receiver GSTIN','Invoice No.','Invoice Date','Invoice Value','Rate (%)','Taxable Value','IGST','CGST','SGST'];
  const data = rows.map((r, i) => ({
    'Sr.No': i + 1,
    'Receiver GSTIN': r.supplierGstin,
    'Invoice No.':    r.invoiceNumber,
    'Invoice Date':   r.invoiceDate,
    'Invoice Value':  r.totalAmount,
    'Rate (%)':       r.gstRate,
    'Taxable Value':  r.taxableValue,
    'IGST':           r.igst,
    'CGST':           r.cgst,
    'SGST':           r.sgst,
  }));
  const csv = convertToCSV(data, headers);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `GSTR-1_B2B_${period || 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(rows, period) {
  const header = ['Sr.No','Receiver GSTIN','Invoice No.','Invoice Date','Invoice Value','Rate (%)','Taxable Value','IGST','CGST','SGST'];
  const body   = rows.map((r, i) =>
    [i+1, r.supplierGstin, r.invoiceNumber, r.invoiceDate,
     r.totalAmount, r.gstRate, r.taxableValue, r.igst, r.cgst, r.sgst]);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"/></head>
    <body><table>
      <tr>${header.map(h => `<th><b>${h}</b></th>`).join('')}</tr>
      ${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
    </table></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `GSTR-1_B2B_${period || 'export'}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(rows, hsnRows, period, buyerGstin) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W   = doc.internal.pageSize.getWidth();

  // ── Cover header ──────────────────────────────────────────────────────────
  doc.setFillColor(13, 20, 50);
  doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(45, 212, 191);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('GSTR-1 — Statement of Outward Supplies', W / 2, 11, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(160, 200, 210);
  doc.text(`Return Period: ${period || '—'}   |   GSTIN: ${buyerGstin || '—'}   |   Generated: ${new Date().toLocaleDateString('en-IN')}`, W / 2, 20, { align: 'center' });

  // ── Summary row ───────────────────────────────────────────────────────────
  const totalTaxable = rows.reduce((s, r) => s + r.taxableValue, 0);
  const totalTax     = rows.reduce((s, r) => s + r.igst + r.cgst + r.sgst, 0);
  doc.setFontSize(9);
  doc.setTextColor(220, 230, 240);
  doc.text(`Total Invoices: ${rows.length}   |   Total Taxable: ₹${fmt(totalTaxable)}   |   Total Tax: ₹${fmt(totalTax)}`, W / 2, 34, { align: 'center' });

  // ── Table 4A – B2B Invoices ───────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 212, 191);
  doc.text('Table 4A — B2B Invoices (Supplies to Registered Persons)', 14, 43);

  autoTable(doc, {
    startY: 46,
    head: [['Sr.', 'Receiver GSTIN', 'Invoice No.', 'Invoice Date', 'Invoice Value ₹', 'Rate %', 'Taxable Value ₹', 'IGST ₹', 'CGST ₹', 'SGST ₹']],
    body: rows.map((r, i) => [
      i + 1, r.supplierGstin, r.invoiceNumber, r.invoiceDate,
      fmt(r.totalAmount), r.gstRate + '%', fmt(r.taxableValue),
      fmt(r.igst), fmt(r.cgst), fmt(r.sgst),
    ]),
    foot: [['', '', '', 'TOTAL', fmt(rows.reduce((s,r)=>s+r.totalAmount,0)), '',
      fmt(rows.reduce((s,r)=>s+r.taxableValue,0)),
      fmt(rows.reduce((s,r)=>s+r.igst,0)),
      fmt(rows.reduce((s,r)=>s+r.cgst,0)),
      fmt(rows.reduce((s,r)=>s+r.sgst,0))]],
    styles:      { fontSize: 7.5, cellPadding: 2.5, textColor: [220, 230, 240] },
    headStyles:  { fillColor: [13, 20, 50], textColor: [45, 212, 191], fontStyle: 'bold' },
    footStyles:  { fillColor: [25, 35, 70], textColor: [255, 220, 100], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [18, 28, 60] },
    bodyStyles:  { fillColor: [13, 20, 50] },
    theme: 'grid',
    columnStyles: { 0: { cellWidth: 8 } },
  });

  // ── HSN Summary ───────────────────────────────────────────────────────────
  if (hsnRows.length) {
    doc.addPage();
    doc.setFillColor(13, 20, 50);
    doc.rect(0, 0, W, 16, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(45, 212, 191);
    doc.text('Table 12 — HSN-wise Summary of Outward Supplies', 14, 11);

    autoTable(doc, {
      startY: 18,
      head: [['HSN Code', 'Total Invoices', 'Taxable Value ₹', 'IGST ₹', 'CGST ₹', 'SGST ₹', 'Total Tax ₹']],
      body: hsnRows.map(h => [
        h.hsnCode, h.invoiceCount, fmt(h.taxableValue),
        fmt(h.igst), fmt(h.cgst), fmt(h.sgst),
        fmt(h.igst + h.cgst + h.sgst),
      ]),
      styles:     { fontSize: 8, cellPadding: 3, textColor: [220, 230, 240] },
      headStyles: { fillColor: [13, 20, 50], textColor: [45, 212, 191], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [18, 28, 60] },
      bodyStyles: { fillColor: [13, 20, 50] },
      theme: 'grid',
    });
  }

  doc.save(`GSTR-1_${period || 'export'}.pdf`);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Gstr1View({ purchaseRecords = [], backendActive }) {
  const [records,       setRecords]      = useState([]);
  const [returnPeriod,  setReturnPeriod] = useState('');
  const [buyerGstin,    setBuyerGstin]   = useState('');
  const [activeSection, setActiveSection]= useState('b2b');
  const [search,        setSearch]       = useState('');
  const [rateFilter,    setRateFilter]   = useState('all');
  const [loading,       setLoading]      = useState(false);
  const [error,         setError]        = useState(null);
  const [dragActive,    setDragActive]   = useState(false);
  const fileRef = useRef(null);

  // ── derived ─────────────────────────────────────────────────────────────────
  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    if (q && !r.supplierGstin?.toLowerCase().includes(q) &&
              !r.invoiceNumber?.toLowerCase().includes(q) &&
              !r.supplierName?.toLowerCase().includes(q)) return false;
    if (rateFilter !== 'all' && r.gstRate !== rateFilter) return false;
    return true;
  });

  const totalTaxable = filtered.reduce((s, r) => s + r.taxableValue, 0);
  const totalIgst    = filtered.reduce((s, r) => s + r.igst, 0);
  const totalCgst    = filtered.reduce((s, r) => s + r.cgst, 0);
  const totalSgst    = filtered.reduce((s, r) => s + r.sgst, 0);
  const totalTax     = totalIgst + totalCgst + totalSgst;

  const hsnSummary = Object.values(
    filtered.reduce((acc, r) => {
      const k = r.hsnCode || 'N/A';
      if (!acc[k]) acc[k] = { hsnCode: k, invoiceCount: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0 };
      acc[k].invoiceCount++;
      acc[k].taxableValue += r.taxableValue;
      acc[k].igst         += r.igst;
      acc[k].cgst         += r.cgst;
      acc[k].sgst         += r.sgst;
      return acc;
    }, {})
  ).sort((a, b) => b.taxableValue - a.taxableValue);

  const rates = [...new Set(records.map(r => r.gstRate))].sort((a, b) => Number(a) - Number(b));

  // ── load handlers ────────────────────────────────────────────────────────────
  const loadFile = useCallback((file) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseCSV(e.target.result).map(normaliseRecord);
        setRecords(rows);
      } catch {
        setError('Failed to parse CSV. Please ensure it matches the expected format.');
      }
    };
    reader.readAsText(file);
  }, []);

  const loadFromBackend = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPurchaseRegistry();
      setRecords(data.map(normaliseRecord));
      if (data[0]?.buyer_gstin) setBuyerGstin(data[0].buyer_gstin);
    } catch {
      setError('Could not reach the backend. Is the Python server running?');
    } finally {
      setLoading(false);
    }
  };

  const loadFromProps = () => {
    if (!purchaseRecords.length) { setError('No purchase records loaded yet. Go to Import tab first.'); return; }
    setRecords(purchaseRecords.map(normaliseRecord));
    setError(null);
  };

  // Drag-drop
  const onDrop = (e) => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); };
  const onDragOver = (e) => { e.preventDefault(); setDragActive(true); };
  const onDragLeave = () => setDragActive(false);

  // ── render helpers ───────────────────────────────────────────────────────────
  const KpiCard = ({ label, value, sub }) => (
    <div className="kpi-card" style={{ padding: '16px 20px', minWidth: '140px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );

  // ── UPLOAD SCREEN ─────────────────────────────────────────────────────────────
  if (!records.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px', margin: '0 auto' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontWeight: '700' }}>GSTR-1</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>Statement of Outward Supplies — View, verify and export your GSTR-1 return data.</p>
        </div>

        {/* Return period + GSTIN */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>RETURN PERIOD</label>
            <input type="month" value={returnPeriod} onChange={e => setReturnPeriod(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '220px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>YOUR GSTIN (optional)</label>
            <input type="text" placeholder="27AAAA..." value={buyerGstin} onChange={e => setBuyerGstin(e.target.value)} maxLength={15}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'monospace' }} />
          </div>
        </div>

        {/* Load options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* CSV upload zone */}
          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
            <div
              onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
              onClick={() => fileRef.current?.click()}
              style={{
                padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
                border: `2px dashed ${dragActive ? 'var(--primary)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 'var(--radius-md)',
                background: dragActive ? 'var(--primary-glow)' : 'transparent',
                transition: 'all 0.2s',
              }}>
              <Upload size={36} style={{ color: 'var(--primary-dim)', marginBottom: '12px' }} />
              <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>Import CSV</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Drag & drop or click — supports purchase registry CSV or GSTR-1 CSV from the GST portal</div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files[0]; if (f) loadFile(f); }} />
            </div>
          </div>

          {/* Load from data */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }}>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>Load from App Data</div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>Pull records already imported into the app — no file needed.</p>
            <button onClick={loadFromProps} disabled={!purchaseRecords.length}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', cursor: purchaseRecords.length ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: '500', opacity: purchaseRecords.length ? 1 : 0.45 }}>
              <FileSpreadsheet size={16} /> Use Purchase Register ({purchaseRecords.length} records)
            </button>
            {backendActive && (
              <button onClick={loadFromBackend} disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--primary)', background: 'var(--primary-glow)', color: 'var(--primary-dim)', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                {loading ? 'Loading from backend…' : 'Load from Backend DB'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '8px', background: 'var(--red-glow)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: '13px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
      </div>
    );
  }

  // ── MAIN VIEW (data loaded) ───────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ margin: 0, fontWeight: '700', color: 'var(--text-primary)' }}>GSTR-1</h2>
            {returnPeriod && (
              <span className="badge badge-gstr" style={{ fontSize: '12px' }}>{returnPeriod}</span>
            )}
            {buyerGstin && (
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{buyerGstin}</span>
            )}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Statement of Outward Supplies · {records.length} invoice{records.length !== 1 ? 's' : ''} loaded
          </p>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => exportCSV(filtered, returnPeriod)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            <FileText size={14} /> CSV
          </button>
          <button onClick={() => exportExcel(filtered, returnPeriod)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.08)', color: '#34d399', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button onClick={() => exportPDF(filtered, hsnSummary, returnPeriod, buyerGstin)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)', color: '#f87171', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            <FileText size={14} /> PDF
          </button>
          <button onClick={() => setRecords([])}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}>
            <X size={14} /> Clear
          </button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <KpiCard label="Total Invoices"   value={filtered.length} />
        <KpiCard label="Taxable Value"    value={`₹${fmt(totalTaxable)}`} />
        <KpiCard label="Total Tax"        value={`₹${fmt(totalTax)}`} sub={`IGST ₹${fmt(totalIgst)} | CGST ₹${fmt(totalCgst)} | SGST ₹${fmt(totalSgst)}`} />
        <KpiCard label="IGST"             value={`₹${fmt(totalIgst)}`} />
        <KpiCard label="CGST + SGST"      value={`₹${fmt(totalCgst + totalSgst)}`} />
      </div>

      {/* ── Section tabs + filters ── */}
      <div className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { id: 'b2b',  label: `Table 4A — B2B Invoices (${filtered.length})` },
            { id: 'hsn',  label: `Table 12 — HSN Summary (${hsnSummary.length})` },
          ].map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`filter-btn ${activeSection === s.id ? 'active' : ''}`}
              style={{ borderRadius: '20px', fontSize: '12px' }}>
              {s.label}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Rate filter */}
            <div style={{ position: 'relative' }}>
              <select value={rateFilter} onChange={e => setRateFilter(e.target.value)}
                style={{ appearance: 'none', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '6px 30px 6px 10px', fontSize: '12px', cursor: 'pointer' }}>
                <option value="all">All Rates</option>
                {rates.map(r => <option key={r} value={r}>{r}% GST</option>)}
              </select>
              <ChevronDown size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
            </div>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input type="text" placeholder="Search GSTIN / Invoice…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '30px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '6px 10px 6px 30px', fontSize: '12px', width: '200px' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── TABLE 4A – B2B Invoices ── */}
      {activeSection === 'b2b' && (
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-color)' }}>
                  {['#','Receiver GSTIN','Trade Name','Invoice No.','Date','Invoice Value ₹','Rate %','Taxable Value ₹','IGST ₹','CGST ₹','SGST ₹'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className="hover-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '12px' }}>{i + 1}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--primary-dim)', whiteSpace: 'nowrap' }}>{r.supplierGstin || '—'}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-primary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.supplierName}>{r.supplierName || '—'}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{r.invoiceNumber || '—'}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.invoiceDate || '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: '600', whiteSpace: 'nowrap' }}>₹{fmt(r.totalAmount)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span className="badge badge-gstr" style={{ fontSize: '10px' }}>{r.gstRate}%</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>₹{fmt(r.taxableValue)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: r.igst > 0 ? 'var(--blue)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.igst > 0 ? `₹${fmt(r.igst)}` : '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: r.cgst > 0 ? 'var(--green)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.cgst > 0 ? `₹${fmt(r.cgst)}` : '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: r.sgst > 0 ? 'var(--green)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.sgst > 0 ? `₹${fmt(r.sgst)}` : '—'}</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No invoices match the current filter.</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'rgba(255,255,255,0.04)', borderTop: '2px solid var(--border-color)', fontWeight: '700' }}>
                    <td colSpan={5} style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '12px' }}>TOTALS ({filtered.length} invoices)</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--yellow)' }}>₹{fmt(filtered.reduce((s,r)=>s+r.totalAmount,0))}</td>
                    <td />
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--yellow)' }}>₹{fmt(totalTaxable)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--blue)' }}>₹{fmt(totalIgst)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--green)' }}>₹{fmt(totalCgst)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--green)' }}>₹{fmt(totalSgst)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── TABLE 12 – HSN Summary ── */}
      {activeSection === 'hsn' && (
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-color)' }}>
                  {['HSN Code','No. of Invoices','Taxable Value ₹','IGST ₹','CGST ₹','SGST ₹','Total Tax ₹'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '600', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hsnSummary.map((h, i) => (
                  <tr key={i} className="hover-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'var(--yellow)', fontWeight: '600' }}>{h.hsnCode}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', textAlign: 'center' }}>{h.invoiceCount}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: '600' }}>₹{fmt(h.taxableValue)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: h.igst > 0 ? 'var(--blue)' : 'var(--text-secondary)' }}>{h.igst > 0 ? `₹${fmt(h.igst)}` : '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: h.cgst > 0 ? 'var(--green)' : 'var(--text-secondary)' }}>{h.cgst > 0 ? `₹${fmt(h.cgst)}` : '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: h.sgst > 0 ? 'var(--green)' : 'var(--text-secondary)' }}>{h.sgst > 0 ? `₹${fmt(h.sgst)}` : '—'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--primary-dim)', fontWeight: '600' }}>₹{fmt(h.igst+h.cgst+h.sgst)}</td>
                  </tr>
                ))}
                {!hsnSummary.length && (
                  <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No HSN data available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <CheckCircle2 size={13} style={{ color: 'var(--green)' }} />
        {filtered.length} of {records.length} record{records.length !== 1 ? 's' : ''} shown
        {rateFilter !== 'all' && ` · Rate filter: ${rateFilter}%`}
        {search && ` · Search: "${search}"`}
      </div>
    </div>
  );
}
