import React, { useState } from 'react';
import { Send, FileSpreadsheet, Copy, Check, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { SAMPLE_SUPPLIERS, convertToCSV } from '../utils/dummyData';

export default function ActionCenter({ reconciledData, currentLang }) {
  const t = TRANSLATIONS[currentLang];
  const [copiedId, setCopiedId] = useState(null);

  // Extract action-needed cases (Exclude MATCHED and UNCLAIMED)
  const actionItems = reconciledData.filter(item => 
    item.status !== 'MATCHED' && item.status !== 'UNCLAIMED'
  );

  // Format currency
  const formatRupee = (num) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // Draft WhatsApp Messages
  const generateWhatsAppMessage = (item) => {
    const inv = item.purchase;
    const supplier = Object.values(SAMPLE_SUPPLIERS).find(
      s => s.gstin.toLowerCase() === inv.supplierGstin.toLowerCase()
    ) || { name: inv.supplierName, phone: "" };
    
    const supplierName = supplier.name.split(" ")[0]; // First name
    const itcAmount = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);

    if (currentLang === 'hi') {
      if (item.status === 'SUPPLIER_DEFAULT') {
        return `नमस्ते ${supplierName}, आपका बिल नं. ${inv.invoiceNumber} (तारीख: ${inv.invoiceDate}, राशि: ₹${inv.totalAmount}) हमारे जीएसटी पोर्टल पर नहीं दिख रहा है। कृपया इसे जल्द ही GSTR-1 में अपलोड करें ताकि हम अपना ₹${itcAmount.toFixed(0)} का टैक्स इनपुट (ITC) ले सकें। धन्यवाद! - पॉकेटसीए से प्रेषित`;
      }
      if (item.status === 'MISMATCH_HSN') {
        return `नमस्ते ${supplierName}, आपके बिल नं. ${inv.invoiceNumber} (तारीख: ${inv.invoiceDate}) में HSN कोड की गड़बड़ी है। आपने पोर्टल पर गलत HSN अपलोड किया है। कृपया इसे सही करके HSN ${inv.hsnCode} करें ताकि हमारा ₹${itcAmount.toFixed(0)} का टैक्स क्रेडिट (ITC) ब्लॉक न हो। धन्यवाद!`;
      }
      if (item.status === 'MISMATCH_AMOUNT') {
        const portalTax = (item.gstr.cgst || 0) + (item.gstr.sgst || 0) + (item.gstr.igst || 0);
        return `नमस्ते ${supplierName}, आपके बिल नं. ${inv.invoiceNumber} (तारीख: ${inv.invoiceDate}) की टैक्स राशि में अंतर है। हमारे पास टैक्स ₹${itcAmount.toFixed(0)} है पर आपने पोर्टल पर ₹${portalTax.toFixed(0)} अपलोड किया है। कृपया GSTR-1 में संशोधन करके इसे सही करें। धन्यवाद!`;
      }
      if (item.status === 'MISMATCH_GSTIN') {
        return `नमस्ते ${supplierName}, आपका बिल नं. ${inv.invoiceNumber} (तारीख: ${inv.invoiceDate}, राशि: ₹${inv.totalAmount}) पोर्टल पर गलत जीएसटी नंबर पर अपलोड हो गया है। कृपया इसे सही करके हमारे GSTIN (${inv.supplierGstin}) पर ट्रांसफर करें ताकि हम क्रेडिट क्लेम कर सकें। धन्यवाद!`;
      }
    }

    if (currentLang === 'hing') {
      if (item.status === 'SUPPLIER_DEFAULT') {
        return `Namaste ${supplierName}, aapka Bill No. ${inv.invoiceNumber} (Date: ${inv.invoiceDate}, Amount: ₹${inv.totalAmount}) humare GST portal par nahi dikh raha hai. Kripya ise check karke portal par upload karein taaki humara ₹${itcAmount.toFixed(0)} ka ITC claim ho sake. Thank you!`;
      }
      if (item.status === 'MISMATCH_HSN') {
        return `Namaste ${supplierName}, aapke Bill No. ${inv.invoiceNumber} (Date: ${inv.invoiceDate}) me HSN code mismatch hai. Aapne portal par galat HSN upload kiya hai. Please ise correct karke HSN ${inv.hsnCode} karein taaki humara ITC block na ho. Thank you!`;
      }
      if (item.status === 'MISMATCH_AMOUNT') {
        const portalTax = (item.gstr.cgst || 0) + (item.gstr.sgst || 0) + (item.gstr.igst || 0);
        return `Namaste ${supplierName}, aapke Bill No. ${inv.invoiceNumber} (Date: ${inv.invoiceDate}) ka tax mismatch hai. Humare bill me tax ₹${itcAmount.toFixed(0)} hai par portal par ₹${portalTax.toFixed(0)} dikh raha hai. Kripya ise correct karein. Thank you!`;
      }
      if (item.status === 'MISMATCH_GSTIN') {
        return `Namaste ${supplierName}, aapka Bill No. ${inv.invoiceNumber} (Date: ${inv.invoiceDate}, Amount: ₹${inv.totalAmount}) portal par galat GSTIN par chadh gaya hai. Please ise correct karke humare GSTIN (${inv.supplierGstin}) par update karein. Thank you!`;
      }
    }

    // Default English
    if (item.status === 'SUPPLIER_DEFAULT') {
      return `Dear ${supplierName}, your Invoice No. ${inv.invoiceNumber} dated ${inv.invoiceDate} (Amount: ₹${inv.totalAmount}) is not appearing in our GSTR-2B. Please upload it to the GST portal so we can claim our Input Tax Credit (ITC) of ₹${itcAmount.toFixed(0)}. Thank you.`;
    }
    if (item.status === 'MISMATCH_HSN') {
      return `Dear ${supplierName}, there is an HSN mismatch on Invoice No. ${inv.invoiceNumber} dated ${inv.invoiceDate}. You uploaded it with a different HSN. Please amend it to HSN ${inv.hsnCode} so we can claim our ITC. Thank you.`;
    }
    if (item.status === 'MISMATCH_AMOUNT') {
      const portalTax = (item.gstr.cgst || 0) + (item.gstr.sgst || 0) + (item.gstr.igst || 0);
      return `Dear ${supplierName}, there is a tax discrepancy in Invoice No. ${inv.invoiceNumber} dated ${inv.invoiceDate}. Our purchase record tax is ₹${itcAmount.toFixed(0)}, but the portal shows ₹${portalTax.toFixed(0)}. Please amend this record in your GSTR-1. Thank you.`;
    }
    if (item.status === 'MISMATCH_GSTIN') {
      return `Dear ${supplierName}, your Invoice No. ${inv.invoiceNumber} dated ${inv.invoiceDate} was uploaded under a wrong GSTIN. Please amend it in your GSTR-1 to our correct GSTIN (${inv.supplierGstin}) so we can claim the credit. Thank you.`;
    }
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleWhatsAppOpen = (item, msg) => {
    const inv = item.purchase;
    const supplier = Object.values(SAMPLE_SUPPLIERS).find(
      s => s.gstin.toLowerCase() === inv.supplierGstin.toLowerCase()
    ) || { phone: "9876543210" };
    
    const encodedMsg = encodeURIComponent(msg);
    const url = `https://api.whatsapp.com/send?phone=91${supplier.phone}&text=${encodedMsg}`;
    window.open(url, '_blank');
  };

  // Export CSV of Mismatches for Accountant
  const handleExportCsv = () => {
    const headers = ["SupplierName", "SupplierGSTIN", "InvoiceNumber", "InvoiceDate", "IssueType", "ITC_At_Risk", "Details"];
    const rows = actionItems.map(item => {
      const inv = item.purchase;
      const itcAmount = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
      return {
        SupplierName: inv.supplierName,
        SupplierGSTIN: inv.supplierGstin,
        InvoiceNumber: inv.invoiceNumber,
        InvoiceDate: inv.invoiceDate,
        IssueType: item.status,
        ITC_At_Risk: itcAmount,
        Details: item.explanation
      };
    });

    const csv = convertToCSV(rows, headers);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "GST_Action_Items_Accountant_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
        <button className="btn-secondary flex-center" onClick={handleExportCsv}>
          <FileSpreadsheet size={16} className="mr-8" />
          <span>{t.exportExcel}</span>
        </button>
      </div>

      {/* Action Items List */}
      <div className="action-items-list">
        {actionItems.map(item => {
          const inv = item.purchase;
          const msg = generateWhatsAppMessage(item);
          const itcAmount = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
          
          return (
            <div key={item.id} className="action-card-item glass-panel border-red">
              
              {/* Card Title & Danger Tag */}
              <div className="action-card-header">
                <div className="action-card-supplier">
                  <span className="text-bold">{inv.supplierName}</span>
                  <span className="badge badge-red-light ml-8">₹{itcAmount.toFixed(0)} ITC at Risk</span>
                </div>
                <div className="action-card-issue-badge flex-center">
                  <AlertCircle size={14} className="mr-4 text-red" />
                  <span className="text-red text-small text-bold">{item.status.replace('_', ' ')}</span>
                </div>
              </div>

              {/* Details and Invoice Info */}
              <div className="action-card-details">
                <p className="text-secondary text-small">
                  Invoice No: <span className="text-primary">{inv.invoiceNumber}</span> | Date: {inv.invoiceDate}
                </p>
                <p className="action-desc-text mt-8">{item.explanation}</p>
              </div>

              {/* WhatsApp draft container */}
              <div className="whatsapp-draft-box">
                <div className="whatsapp-draft-header text-secondary text-small">
                  <MessageSquare size={14} className="mr-4" />
                  <span>{t.whatsappDraftHeader}</span>
                </div>
                <textarea 
                  className="whatsapp-textbox" 
                  value={msg} 
                  readOnly 
                />
                
                {/* Actions inside draft box */}
                <div className="whatsapp-box-actions">
                  <button 
                    className="btn-text-icon flex-center text-secondary"
                    onClick={() => handleCopy(msg, item.id)}
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check size={14} className="mr-4 text-green" />
                        <span className="text-green">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} className="mr-4" />
                        <span>{t.btnCopyMessage}</span>
                      </>
                    )}
                  </button>
                  
                  <button 
                    className="btn-primary-mini flex-center"
                    onClick={() => handleWhatsAppOpen(item, msg)}
                  >
                    <Send size={14} className="mr-4" />
                    <span>{t.sendWhatsApp}</span>
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
