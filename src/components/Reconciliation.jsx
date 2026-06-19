import React, { useState } from 'react';
import { TRANSLATIONS } from '../utils/translations';
import { AlertTriangle, CheckCircle2, XCircle, Info, HelpCircle } from 'lucide-react';

export default function Reconciliation({ reconciledData, currentLang, changeTab }) {
  const t = TRANSLATIONS[currentLang];
  const [filter, setFilter] = useState('ALL');

  if (!reconciledData || reconciledData.length === 0) {
    return (
      <div className="reconciliation-empty-panel glass-panel text-center">
        <p className="text-secondary mb-16">{t.emptyReconciliation}</p>
        <button className="btn-primary" onClick={() => changeTab('import')}>
          {t.tabImport}
        </button>
      </div>
    );
  }

  // Filtering logic
  const filtered = reconciledData.filter(item => {
    if (filter === 'ALL') return true;
    if (filter === 'MATCHED') return item.status === 'MATCHED';
    if (filter === 'MISMATCH') return item.status === 'MISMATCH_HSN' || item.status === 'MISMATCH_AMOUNT' || item.status === 'MISMATCH_GSTIN';
    if (filter === 'DEFAULT') return item.status === 'SUPPLIER_DEFAULT';
    if (filter === 'UNCLAIMED') return item.status === 'UNCLAIMED';
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="badge badge-green flex-center-inline">
            <CheckCircle2 size={12} className="mr-4" />
            <span>Perfect Match</span>
          </span>
        );
      case 'MISMATCH_HSN':
        return (
          <span className="badge badge-yellow flex-center-inline">
            <AlertTriangle size={12} className="mr-4" />
            <span>HSN Mismatch</span>
          </span>
        );
      case 'MISMATCH_AMOUNT':
        return (
          <span className="badge badge-yellow flex-center-inline">
            <AlertTriangle size={12} className="mr-4" />
            <span>Tax Mismatch</span>
          </span>
        );
      case 'MISMATCH_GSTIN':
        return (
          <span className="badge badge-red flex-center-inline">
            <XCircle size={12} className="mr-4" />
            <span>GSTIN Mismatch</span>
          </span>
        );
      case 'SUPPLIER_DEFAULT':
        return (
          <span className="badge badge-red flex-center-inline">
            <XCircle size={12} className="mr-4" />
            <span>Supplier Default</span>
          </span>
        );
      case 'UNCLAIMED':
        return (
          <span className="badge badge-blue flex-center-inline">
            <HelpCircle size={12} className="mr-4" />
            <span>Unclaimed ITC</span>
          </span>
        );
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  const getInvoiceDetails = (item) => {
    const inv = item.purchase || item.gstr;
    return inv;
  };

  const getExplanationText = (item) => {
    if (currentLang === 'hi') return item.explanationHi || item.explanation;
    if (currentLang === 'hing') return item.explanationHing || item.explanation;
    return item.explanation;
  };

  const formatRupee = (num) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(num);
  };

  return (
    <div className="reconciliation-container">
      {/* Table Title and Filters */}
      <div className="report-header-panel glass-panel">
        <h3>{t.recTitle}</h3>
        
        {/* Filters Row */}
        <div className="filter-row">
          <button className={`filter-btn ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
            {t.filterAll} ({reconciledData.length})
          </button>
          <button className={`filter-btn ${filter === 'MATCHED' ? 'active' : ''}`} onClick={() => setFilter('MATCHED')}>
            {t.filterMatched} ({reconciledData.filter(i => i.status === 'MATCHED').length})
          </button>
          <button className={`filter-btn ${filter === 'MISMATCH' ? 'active' : ''}`} onClick={() => setFilter('MISMATCH')}>
            {t.filterMismatched} ({reconciledData.filter(i => i.status.startsWith('MISMATCH')).length})
          </button>
          <button className={`filter-btn ${filter === 'DEFAULT' ? 'active' : ''}`} onClick={() => setFilter('DEFAULT')}>
            {t.filterDefaults} ({reconciledData.filter(i => i.status === 'SUPPLIER_DEFAULT').length})
          </button>
          <button className={`filter-btn ${filter === 'UNCLAIMED' ? 'active' : ''}`} onClick={() => setFilter('UNCLAIMED')}>
            {t.filterUnclaimed} ({reconciledData.filter(i => i.status === 'UNCLAIMED').length})
          </button>
        </div>
      </div>

      {/* Reconciled Items List */}
      <div className="report-list-container">
        {filtered.length === 0 ? (
          <div className="glass-panel text-center p-32">
            <p className="text-secondary">No invoices in this category.</p>
          </div>
        ) : (
          filtered.map(item => {
            const inv = getInvoiceDetails(item);
            const isLoss = item.status !== 'MATCHED' && item.status !== 'UNCLAIMED';
            const isGain = item.status === 'UNCLAIMED';
            
            return (
              <div key={item.id} className="reconciliation-row-card glass-panel">
                <div className="row-card-grid">
                  
                  {/* Supplier Info */}
                  <div className="grid-cell-supplier">
                    <div className="supplier-main-name">{inv.supplierName}</div>
                    <div className="supplier-sub-gstin text-secondary">GSTIN: {inv.supplierGstin}</div>
                  </div>

                  {/* Invoice Details */}
                  <div className="grid-cell-invoice">
                    <div><span className="text-secondary">No:</span> {inv.invoiceNumber}</div>
                    <div className="text-secondary text-small">Date: {inv.invoiceDate}</div>
                  </div>

                  {/* Tax Amount */}
                  <div className="grid-cell-tax">
                    <div className="tax-heading text-secondary">Tax Value (ITC)</div>
                    <div className="tax-value">
                      {formatRupee((inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0))}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="grid-cell-status">
                    {getStatusBadge(item.status)}
                  </div>

                  {/* Impact Calculation */}
                  <div className="grid-cell-impact">
                    {isLoss && (
                      <span className="text-red text-bold text-small">
                        {t.lossCalculation.replace('{amount}', formatRupee(item.financialImpact))}
                      </span>
                    )}
                    {isGain && (
                      <span className="text-blue text-bold text-small">
                        {t.gainCalculation.replace('{amount}', formatRupee(item.financialImpact))}
                      </span>
                    )}
                    {item.status === 'MATCHED' && (
                      <span className="text-green text-bold text-small">Claim Safe</span>
                    )}
                  </div>
                </div>

                {/* Plain-language explanation block */}
                <div className="row-card-explanation-drawer">
                  <Info size={14} className="text-secondary flex-shrink-0" />
                  <p className="explanation-paragraph">{getExplanationText(item)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
