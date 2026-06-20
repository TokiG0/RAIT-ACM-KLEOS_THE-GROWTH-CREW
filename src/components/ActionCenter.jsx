import React, { useState } from 'react';
import { Send, FileSpreadsheet, Copy, Check, MessageSquare, AlertCircle, Sparkles, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { convertToCSV } from '../utils/csvHelper';
import { computeSupplierScores } from '../utils/reconciliationEngine';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtINR = (n) => `INR ${Number(n).toLocaleString('en-IN')}`;

export default function ActionCenter({ reconciledData, currentLang }) {
  const t = TRANSLATIONS[currentLang];
  const [copiedId, setCopiedId]     = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const actionItems = reconciledData.filter(
    item => item.status !== 'MATCHED' && item.status !== 'UNCLAIMED'
  );

  const formatRupee = (n) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  /* ─── WhatsApp message builder ─── */
  const generateWhatsAppMessage = (item) => {
    const inv = item.purchase;
    const name = (inv.supplierName || 'Supplier').split(' ')[0];
    const itc  = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);

    if (currentLang === 'hi') {
      if (item.status === 'SUPPLIER_DEFAULT')
        return `नमस्ते ${name}, आपका बिल नं. ${inv.invoiceNumber} (तारीख: ${inv.invoiceDate}, राशि: ₹${inv.totalAmount}) हमारे जीएसटी पोर्टल पर नहीं दिख रहा है। कृपया इसे जल्द ही GSTR-1 में अपलोड करें ताकि हम अपना ₹${itc.toFixed(0)} का टैक्स इनपुट (ITC) ले सकें। धन्यवाद! - पॉकेटसीए`;
      if (item.status === 'MISMATCH_HSN')
        return `नमस्ते ${name}, आपके बिल नं. ${inv.invoiceNumber} में HSN कोड की गड़बड़ी है। कृपया इसे सही करके HSN ${inv.hsnCode} करें ताकि हमारा ₹${itc.toFixed(0)} का ITC ब्लॉक न हो। धन्यवाद!`;
      if (item.status === 'MISMATCH_AMOUNT') {
        const pt = (item.gstr.cgst || 0) + (item.gstr.sgst || 0) + (item.gstr.igst || 0);
        return `नमस्ते ${name}, बिल नं. ${inv.invoiceNumber} की टैक्स राशि में अंतर है। हमारा: ₹${itc.toFixed(0)}, पोर्टल: ₹${pt.toFixed(0)}। कृपया GSTR-1 में संशोधन करें। धन्यवाद!`;
      }
      if (item.status === 'MISMATCH_GSTIN')
        return `नमस्ते ${name}, आपका बिल नं. ${inv.invoiceNumber} गलत GSTIN पर अपलोड हो गया है। कृपया इसे हमारे GSTIN (${inv.supplierGstin}) पर ट्रांसफर करें। धन्यवाद!`;
    }

    if (currentLang === 'hing') {
      if (item.status === 'SUPPLIER_DEFAULT')
        return `Namaste ${name}, aapka Bill No. ${inv.invoiceNumber} (Date: ${inv.invoiceDate}, Amount: ₹${inv.totalAmount}) humare GST portal par nahi dikh raha. Kripya GSTR-1 me upload karein taaki ₹${itc.toFixed(0)} ka ITC claim ho sake. Thank you!`;
      if (item.status === 'MISMATCH_HSN')
        return `Namaste ${name}, Bill No. ${inv.invoiceNumber} me HSN mismatch hai. Please HSN ${inv.hsnCode} correct karein taaki ITC block na ho. Thank you!`;
      if (item.status === 'MISMATCH_AMOUNT') {
        const pt = (item.gstr.cgst || 0) + (item.gstr.sgst || 0) + (item.gstr.igst || 0);
        return `Namaste ${name}, Bill No. ${inv.invoiceNumber} ka tax mismatch hai. Humare bill me ₹${itc.toFixed(0)}, portal par ₹${pt.toFixed(0)}. Kripya GSTR-1 me correct karein. Thank you!`;
      }
      if (item.status === 'MISMATCH_GSTIN')
        return `Namaste ${name}, Bill No. ${inv.invoiceNumber} galat GSTIN par chadh gaya hai. Please humare GSTIN (${inv.supplierGstin}) par update karein. Thank you!`;
    }

    // English default
    if (item.status === 'SUPPLIER_DEFAULT')
      return `Dear ${name}, Invoice No. ${inv.invoiceNumber} dated ${inv.invoiceDate} (₹${inv.totalAmount}) is missing from GSTR-2B. Please upload it so we can claim ₹${itc.toFixed(0)} ITC. Thank you.`;
    if (item.status === 'MISMATCH_HSN')
      return `Dear ${name}, Invoice No. ${inv.invoiceNumber} has an HSN mismatch. Please amend to HSN ${inv.hsnCode} so our ITC (₹${itc.toFixed(0)}) is not blocked. Thank you.`;
    if (item.status === 'MISMATCH_AMOUNT') {
      const pt = (item.gstr.cgst || 0) + (item.gstr.sgst || 0) + (item.gstr.igst || 0);
      return `Dear ${name}, Invoice No. ${inv.invoiceNumber} has a tax discrepancy. Our record: ₹${itc.toFixed(0)}, portal: ₹${pt.toFixed(0)}. Please amend in GSTR-1. Thank you.`;
    }
    if (item.status === 'MISMATCH_GSTIN')
      return `Dear ${name}, Invoice No. ${inv.invoiceNumber} was uploaded under a wrong GSTIN. Please amend to our GSTIN (${inv.supplierGstin}). Thank you.`;
    return '';
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleWhatsApp = (item, msg) => {
    const phone = item.purchase.supplierPhone || '9876543210';
    window.open(`https://api.whatsapp.com/send?phone=91${phone}&text=${encodeURIComponent(msg)}`, '_blank');
  };

  /* ─── CSV export ─── */
  const handleExportCsv = () => {
    const headers = ['SupplierName','SupplierGSTIN','InvoiceNumber','InvoiceDate','IssueType','ITC_At_Risk','Details'];
    const rows = actionItems.map(item => {
      const inv = item.purchase;
      const itc = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
      return { SupplierName: inv.supplierName, SupplierGSTIN: inv.supplierGstin, InvoiceNumber: inv.invoiceNumber, InvoiceDate: inv.invoiceDate, IssueType: item.status, ITC_At_Risk: itc, Details: item.explanation };
    });
    const csv  = convertToCSV(rows, headers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'GST_Action_Items_Accountant_Report.csv');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  /* ─── Rich PDF export ─── */
  const handleExportPdf = () => {
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const totalRisk = actionItems.reduce((s, i) => s + (i.purchase?.cgst || 0) + (i.purchase?.sgst || 0) + (i.purchase?.igst || 0), 0);

    /* ── PAGE 1: Cover / Summary ── */
    doc.setFillColor(5, 7, 31);
    doc.rect(0, 0, 210, 297, 'F');

    // Accent bar
    doc.setFillColor(0, 223, 154);
    doc.rect(0, 0, 5, 297, 'F');

    doc.setTextColor(0, 223, 154);
    doc.setFontSize(26); doc.setFont('helvetica', 'bold');
    doc.text('PocketCA', 20, 40);

    doc.setTextColor(180, 200, 230);
    doc.setFontSize(13); doc.setFont('helvetica', 'normal');
    doc.text('GST Reconciliation Action Report', 20, 50);
    doc.text(`Generated: ${date}`, 20, 58);

    // Summary boxes
    const boxes = [
      { label: 'Total ITC at Risk', value: fmtINR(totalRisk.toFixed(0)), color: [248, 113, 113] },
      { label: 'Action Items',      value: String(actionItems.length),    color: [250, 204, 21]  },
      { label: 'Supplier Defaults', value: String(actionItems.filter(x => x.status === 'SUPPLIER_DEFAULT').length), color: [56, 189, 248] },
      { label: 'HSN / Amount Errors', value: String(actionItems.filter(x => ['MISMATCH_HSN','MISMATCH_AMOUNT'].includes(x.status)).length), color: [96, 165, 250] },
    ];
    boxes.forEach((b, i) => {
      const x = 20 + (i % 2) * 92, y = 72 + Math.floor(i / 2) * 36;
      doc.setFillColor(...b.color, 30);
      doc.roundedRect(x, y, 88, 30, 4, 4, 'F');
      doc.setDrawColor(...b.color);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, 88, 30, 4, 4, 'S');
      doc.setTextColor(...b.color);
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text(b.value, x + 8, y + 19);
      doc.setTextColor(180, 200, 230);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(b.label, x + 8, y + 26);
    });

    // Supplier breakdown per-status
    const bySupplier = {};
    actionItems.forEach(item => {
      const sn = item.purchase.supplierName || 'Unknown';
      if (!bySupplier[sn]) bySupplier[sn] = { defaults: 0, hsn: 0, amount: 0, gstin: 0, totalRisk: 0 };
      const itc = (item.purchase.cgst || 0) + (item.purchase.sgst || 0) + (item.purchase.igst || 0);
      bySupplier[sn].totalRisk += itc;
      if (item.status === 'SUPPLIER_DEFAULT') bySupplier[sn].defaults++;
      else if (item.status === 'MISMATCH_HSN') bySupplier[sn].hsn++;
      else if (item.status === 'MISMATCH_AMOUNT') bySupplier[sn].amount++;
      else bySupplier[sn].gstin++;
    });

    const supplierRows = Object.entries(bySupplier)
      .sort((a, b) => b[1].totalRisk - a[1].totalRisk)
      .map(([name, d]) => [name, fmtINR(d.totalRisk.toFixed(0)), String(d.defaults), String(d.hsn + d.amount), String(d.gstin)]);

    autoTable(doc, {
      startY: 148,
      head: [['Supplier', 'ITC at Risk', 'Defaults', 'Errors', 'GSTIN Issues']],
      body: supplierRows,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4, textColor: [220, 230, 250], fillColor: [10, 14, 40] },
      headStyles: { fillColor: [0, 100, 80], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [15, 20, 55] },
      margin: { left: 20, right: 20 },
    });

    // Footer page 1
    doc.setFontSize(7); doc.setTextColor(80, 100, 130);
    doc.text('PocketCA — Offline-First GST Assistant | Data never leaves your device | Page 1', 20, 290);

    /* ── PAGE 2: Full action table ── */
    doc.addPage();
    doc.setFillColor(5, 7, 31);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setFillColor(0, 223, 154);
    doc.rect(0, 0, 5, 297, 'F');

    doc.setTextColor(0, 223, 154);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Detailed Action Items', 20, 20);
    doc.setTextColor(180, 200, 230);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Total: ${actionItems.length} items requiring supplier action`, 20, 28);

    const tableRows = actionItems.map(item => {
      const inv = item.purchase;
      const itc = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
      return [
        inv.supplierName || '—',
        inv.invoiceNumber,
        inv.invoiceDate || '—',
        fmtINR(itc.toFixed(0)),
        item.status.replace(/_/g, ' '),
        item.explanation.substring(0, 55) + (item.explanation.length > 55 ? '…' : ''),
      ];
    });

    autoTable(doc, {
      startY: 34,
      head: [['Supplier', 'Invoice No.', 'Date', 'ITC at Risk', 'Issue', 'Action Required']],
      body: tableRows,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3, textColor: [220, 230, 250], fillColor: [10, 14, 40] },
      headStyles: { fillColor: [0, 120, 100], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [15, 20, 55] },
      columnStyles: { 5: { cellWidth: 50 } },
      margin: { left: 14, right: 14 },
    });

    // Footer all pages
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(7); doc.setTextColor(80, 100, 130);
      doc.text(`PocketCA — Offline-First GST Assistant | Page ${p} / ${pageCount}`, 14, 292);
    }

    doc.save(`PocketCA_Action_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  /* ─── Empty state ─── */
  if (actionItems.length === 0) {
    return (
      <div className="action-center-empty glass-panel text-center">
        <Sparkles className="text-green mb-16 animate-bounce" size={48} />
        <h3>{t.noActionsTitle}</h3>
        <p className="text-secondary">{t.noActionsDesc}</p>
      </div>
    );
  }

  return (
    <div className="action-center-container">

      {/* Title Panel */}
      <div className="action-header-panel glass-panel">
        <div className="action-header-info">
          <h3>{t.actionTitle}</h3>
          <p className="text-secondary">{t.actionSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary flex-center" onClick={handleExportCsv}>
            <FileSpreadsheet size={16} className="mr-8" />
            <span>{t.exportExcel}</span>
          </button>
          <button
            className="btn-secondary flex-center"
            onClick={handleExportPdf}
            style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
          >
            <FileText size={16} className="mr-8" />
            <span>{t.exportPdf || 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {/* Action Items */}
      <div className="action-items-list">
        {actionItems.map(item => {
          const inv = item.purchase;
          const msg = generateWhatsAppMessage(item);
          const itc = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
          const isExp = expandedId === item.id;

          return (
            <div key={item.id} className="action-card-item glass-panel border-red">

              <div className="action-card-header">
                <div className="action-card-supplier">
                  <span className="text-bold">{inv.supplierName}</span>
                  <span className="badge badge-red-light ml-8">₹{itc.toFixed(0)} ITC at Risk</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="action-card-issue-badge flex-center">
                    <AlertCircle size={14} className="mr-4 text-red" />
                    <span className="text-red text-small text-bold">{item.status.replace(/_/g, ' ')}</span>
                  </div>
                  <button
                    onClick={() => setExpandedId(isExp ? null : item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  >
                    {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              <div className="action-card-details">
                <p className="text-secondary text-small">
                  Invoice: <span className="text-primary">{inv.invoiceNumber}</span> · {inv.invoiceDate}
                </p>
                <p className="action-desc-text mt-8">{item.explanation}</p>
              </div>

              {isExp && (
                <div className="whatsapp-draft-box">
                  <div className="whatsapp-draft-header text-secondary text-small">
                    <MessageSquare size={14} className="mr-4" />
                    <span>{t.whatsappDraftHeader}</span>
                  </div>
                  <textarea className="whatsapp-textbox" value={msg} readOnly />
                  <div className="whatsapp-box-actions">
                    <button className="btn-text-icon flex-center text-secondary" onClick={() => handleCopy(msg, item.id)}>
                      {copiedId === item.id
                        ? <><Check size={14} className="mr-4 text-green" /><span className="text-green">Copied!</span></>
                        : <><Copy size={14} className="mr-4" /><span>{t.btnCopyMessage}</span></>
                      }
                    </button>
                    <button className="btn-primary-mini flex-center" onClick={() => handleWhatsApp(item, msg)}>
                      <Send size={14} className="mr-4" /><span>{t.sendWhatsApp}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
