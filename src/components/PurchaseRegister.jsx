import React, { useState } from 'react';
import { Search, Trash2, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, PlusCircle } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';

export default function PurchaseRegister({ 
  purchaseRecords, 
  reconciledData, 
  currentLang, 
  backendActive,
  onDeleteRecord 
}) {
  const t = TRANSLATIONS[currentLang];
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const formatRupee = (num) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(num || 0);
  };

  // Helper to find the reconciled status for a purchase record
  const getReconciliationInfo = (record) => {
    if (!reconciledData) return null;
    return reconciledData.find(item => 
      item.purchase && 
      item.purchase.invoiceNumber === record.invoiceNumber && 
      item.purchase.supplierGstin === record.supplierGstin
    );
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="badge badge-green flex-center-inline text-small">
            <CheckCircle2 size={12} className="mr-4" />
            <span>Perfect Match</span>
          </span>
        );
      case 'MISMATCH_HSN':
        return (
          <span className="badge badge-yellow flex-center-inline text-small">
            <AlertTriangle size={12} className="mr-4" />
            <span>HSN Mismatch</span>
          </span>
        );
      case 'MISMATCH_AMOUNT':
        return (
          <span className="badge badge-yellow flex-center-inline text-small">
            <AlertTriangle size={12} className="mr-4" />
            <span>Tax Mismatch</span>
          </span>
        );
      case 'MISMATCH_GSTIN':
        return (
          <span className="badge badge-red flex-center-inline text-small">
            <XCircle size={12} className="mr-4" />
            <span>GSTIN Mismatch</span>
          </span>
        );
      case 'SUPPLIER_DEFAULT':
        return (
          <span className="badge badge-red flex-center-inline text-small">
            <XCircle size={12} className="mr-4" />
            <span>Missing in GSTR-2B</span>
          </span>
        );
      default:
        return (
          <span className="badge badge-secondary flex-center-inline text-small">
            <span>Pending Match</span>
          </span>
        );
    }
  };

  // Filter and search logic
  const filteredRecords = purchaseRecords.filter(record => {
    const reconInfo = getReconciliationInfo(record);
    const status = reconInfo ? reconInfo.status : 'PENDING';
    
    // Status Filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'MATCHED' && status !== 'MATCHED') return false;
      if (statusFilter === 'MISMATCH' && !status.startsWith('MISMATCH')) return false;
      if (statusFilter === 'DEFAULT' && status !== 'SUPPLIER_DEFAULT') return false;
    }

    // Search Query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchName = record.supplierName?.toLowerCase().includes(q);
      const matchGstin = record.supplierGstin?.toLowerCase().includes(q);
      const matchInvNo = record.invoiceNumber?.toLowerCase().includes(q);
      const matchHsn = record.hsnCode?.toLowerCase().includes(q);
      return matchName || matchGstin || matchInvNo || matchHsn;
    }

    return true;
  });

  return (
    <div className="purchase-register-container">
      {/* Header Summary Dashboard */}
      <div className="report-header-panel glass-panel mb-16">
        <div className="flex-between">
          <div>
            <h3>Purchase Register Book</h3>
            <p className="text-secondary text-small">List of all purchase invoices recorded locally via uploads or mock inputs.</p>
          </div>
          <div className="text-secondary text-small flex-center gap-8">
            <FileSpreadsheet size={16} className="text-primary" />
            <span>Total: <strong>{purchaseRecords.length} Invoices</strong></span>
          </div>
        </div>

        {/* Toolbar: Search, Filters */}
        <div className="filter-row mt-16 flex-wrap gap-12" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          {/* Search Input */}
          <div className="search-input-wrapper flex-grow" style={{ position: 'relative', maxWidth: '350px' }}>
            <Search size={16} className="text-secondary" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Search by supplier, GSTIN, invoice no..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-100"
              style={{ paddingLeft: '36px', height: '38px', borderRadius: 'var(--radius-sm)' }}
            />
          </div>

          {/* Status Tabs */}
          <div className="flex gap-8 flex-wrap">
            <button className={`filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`} onClick={() => setStatusFilter('ALL')}>
              All Invoices ({purchaseRecords.length})
            </button>
            <button className={`filter-btn ${statusFilter === 'MATCHED' ? 'active' : ''}`} onClick={() => setStatusFilter('MATCHED')}>
              Perfect Matches ({purchaseRecords.filter(r => getReconciliationInfo(r)?.status === 'MATCHED').length})
            </button>
            <button className={`filter-btn ${statusFilter === 'MISMATCH' ? 'active' : ''}`} onClick={() => setStatusFilter('MISMATCH')}>
              Mismatches ({purchaseRecords.filter(r => getReconciliationInfo(r)?.status.startsWith('MISMATCH')).length})
            </button>
            <button className={`filter-btn ${statusFilter === 'DEFAULT' ? 'active' : ''}`} onClick={() => setStatusFilter('DEFAULT')}>
              Missing in Portal ({purchaseRecords.filter(r => getReconciliationInfo(r)?.status === 'SUPPLIER_DEFAULT').length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="glass-panel" style={{ padding: '0px', overflowX: 'auto', borderRadius: 'var(--radius-md)' }}>
        {filteredRecords.length === 0 ? (
          <div className="text-center p-48">
            <p className="text-secondary mb-16">No purchase records matching your filter query.</p>
            <div className="flex-center gap-12">
              {purchaseRecords.length === 0 && (
                <button className="btn-primary" onClick={() => window.location.reload()}>
                  <PlusCircle size={16} className="mr-8" />
                  Load Presets/Upload File
                </button>
              )}
            </div>
          </div>
        ) : (
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '12px 16px' }}>Invoice details</th>
                <th style={{ padding: '12px 16px' }}>Supplier / GSTIN</th>
                <th style={{ padding: '12px 16px' }}>HSN</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Taxable Value</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>CGST / SGST</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>IGST</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Grand Total</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Portal status</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record, index) => {
                const reconInfo = getReconciliationInfo(record);
                const status = reconInfo ? reconInfo.status : 'PENDING';
                
                return (
                  <tr 
                    key={`${record.invoiceNumber}-${record.supplierGstin}-${index}`} 
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                    className="hover-row"
                  >
                    {/* Invoice details */}
                    <td style={{ padding: '16px' }}>
                      <div className="text-bold" style={{ color: 'var(--text-color)' }}>{record.invoiceNumber}</div>
                      <div className="text-secondary text-small">{record.invoiceDate}</div>
                    </td>

                    {/* Supplier details */}
                    <td style={{ padding: '16px' }}>
                      <div className="text-bold" style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {record.supplierName || 'Unknown Supplier'}
                      </div>
                      <div className="text-secondary text-small">GSTIN: {record.supplierGstin}</div>
                    </td>

                    {/* HSN */}
                    <td style={{ padding: '16px' }}>
                      <span className="badge badge-secondary">{record.hsnCode || 'N/A'}</span>
                    </td>

                    {/* Taxable value */}
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      {formatRupee(record.taxableValue)}
                    </td>

                    {/* CGST / SGST */}
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div>{formatRupee(record.cgst)}</div>
                      <div className="text-secondary text-small">{formatRupee(record.sgst)}</div>
                    </td>

                    {/* IGST */}
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      {record.igst > 0 ? formatRupee(record.igst) : '—'}
                    </td>

                    {/* Grand total */}
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                      {formatRupee(record.totalAmount)}
                    </td>

                    {/* Match status */}
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      {getStatusBadge(status)}
                    </td>

                    {/* Delete action */}
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button 
                        className="btn-icon text-red delete-invoice-btn" 
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete invoice ${record.invoiceNumber}?`)) {
                            onDeleteRecord(record.invoiceNumber, record.supplierGstin, record.id);
                          }
                        }}
                        title="Delete Invoice"
                        style={{ padding: '8px', borderRadius: '50%' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
