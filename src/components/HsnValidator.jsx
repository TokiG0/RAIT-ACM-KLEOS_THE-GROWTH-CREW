import React, { useState, useMemo } from 'react';
import {
  Shield, CheckCircle2, XCircle, AlertTriangle,
  MessageCircle, Copy, ChevronDown, ChevronUp, Search,
  Info, AlertCircle, ShieldCheck,
} from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { validatePurchaseRecords, buildHsnCorrectionWhatsApp } from '../utils/hsnValidator';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function HsnValidator({ purchaseRecords = [], currentLang }) {
  const t = TRANSLATIONS[currentLang];
  const [filter, setFilter]       = useState('all');
  const [search, setSearch]       = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId]   = useState(null);

  const results = useMemo(() => validatePurchaseRecords(purchaseRecords), [purchaseRecords]);

  const total      = results.length;
  const correct    = results.filter(r => r.status === 'CORRECT').length;
  const mismatches = results.filter(r => r.status === 'RATE_MISMATCH').length;
  const unknown    = results.filter(r => r.status === 'UNKNOWN_HSN').length;

  const filtered = useMemo(() => {
    let list = results;
    if (filter === 'mismatch') list = list.filter(r => r.status === 'RATE_MISMATCH');
    else if (filter === 'correct') list = list.filter(r => r.status === 'CORRECT');
    else if (filter === 'unknown') list = list.filter(r => r.status === 'UNKNOWN_HSN');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.supplierName || '').toLowerCase().includes(q) ||
        (r.supplierGstin || '').toLowerCase().includes(q) ||
        String(r.hsnCode || '').includes(q) ||
        (r.invoiceNumber || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [results, filter, search]);

  const supplierIssues = useMemo(() => {
    const map = {};
    results.filter(r => r.status === 'RATE_MISMATCH').forEach(r => {
      const key = r.supplierGstin || r.supplierName || 'unknown';
      if (!map[key]) map[key] = { name: r.supplierName || 'Unknown', gstin: r.supplierGstin, count: 0, taxImpact: 0 };
      map[key].count++;
      map[key].taxImpact += Math.abs(r.overchargeAmount || 0);
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [results]);

  if (purchaseRecords.length === 0) {
    return (
      <div className="hsn-validator-container">
        <div className="hsn-empty glass-panel">
          <ShieldCheck size={52} color="var(--text-muted)" style={{ opacity: 0.5 }} />
          <h3>{t.hsnNoData || 'No Purchase Records to Validate'}</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 400 }}>
            {t.hsnNoDataDesc || 'Import purchase records to run HSN rate compliance checks against the official GST rate schedule.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="hsn-validator-container">

      {/* ── Header ── */}
      <div className="hsn-header glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="hsn-icon-wrap">
            <Shield size={20} color="var(--primary)" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t.hsnTitle || 'HSN Rate Compliance Validator'}</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {t.hsnSubtitle || 'Cross-check invoice GST rates against official GST rate schedule'}
            </p>
          </div>
          <span className="hsn-ai-badge">AI-Validated</span>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="hsn-stats-bar">
        {[
          { label: t.hsnTotal || 'Total Checked',    value: total,      color: 'var(--blue)'    },
          { label: t.hsnCorrect || 'Compliant',       value: correct,    color: 'var(--green)'   },
          { label: t.hsnMismatch || 'Rate Mismatch',  value: mismatches, color: 'var(--red)',     alert: true },
          { label: t.hsnUnknown || 'Unknown HSN',     value: unknown,    color: 'var(--yellow)'  },
        ].map(s => (
          <div key={s.label} className="hsn-stat glass-panel" style={{ borderLeft: `3px solid ${s.color}` }}>
            <div className="hsn-stat-value" style={{ color: s.color }}>
              {s.value}
              {s.alert && s.value > 0 && <span className="hsn-stat-alert">!</span>}
            </div>
            <div className="hsn-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Supplier Impact Warning ── */}
      {supplierIssues.length > 0 && (
        <div className="glass-panel hsn-supplier-impact">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <AlertCircle size={16} color="var(--red)" />
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--red)' }}>
              {t.hsnScoreImpact || 'Supplier Trust Score Impact'}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {supplierIssues.map(s => (
              <div key={s.gstin || s.name} className="hsn-supplier-badge">
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({s.count} issue{s.count > 1 ? 's' : ''})</span>
                <span className="hsn-supplier-penalty">−{s.count * 10} pts</span>
                {s.taxImpact > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--yellow)', marginLeft: 4 }}>
                    ₹{s.taxImpact.toFixed(0)} tax diff
                  </span>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>
            {t.hsnCorrectionNote || 'Each HSN rate violation reduces supplier trust score by 10 points. Use WhatsApp to request corrections.'}
          </p>
        </div>
      )}

      {/* ── Filter + Search ── */}
      <div className="hsn-controls glass-panel">
        <div className="hsn-filters">
          {[
            { key: 'all',      label: t.hsnFilterAll      || 'All',          count: total      },
            { key: 'mismatch', label: t.hsnFilterMismatch || 'Rate Mismatch',count: mismatches },
            { key: 'correct',  label: t.hsnFilterCorrect  || 'Compliant',    count: correct    },
            { key: 'unknown',  label: t.hsnFilterUnknown  || 'Unknown HSN',  count: unknown    },
          ].map(f => (
            <button
              key={f.key}
              className={`hsn-filter-btn ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="hsn-filter-count">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="hsn-search-wrap">
          <Search size={14} color="var(--text-muted)" />
          <input
            className="hsn-search-input"
            placeholder="Search supplier, HSN, invoice…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Results ── */}
      <div className="hsn-results">
        {filtered.length === 0 ? (
          <div className="hsn-no-results glass-panel">
            <CheckCircle2 size={36} color="var(--green)" />
            <p style={{ color: 'var(--text-secondary)', margin: '10px 0 0' }}>
              {filter === 'correct'
                ? (t.hsnAllGood || 'All invoices have correct GST rates!')
                : 'No results match your filter.'}
            </p>
          </div>
        ) : (
          filtered.map(rec => {
            const id = `${rec.invoiceNumber}-${rec.supplierGstin}`;
            const isExpanded = expandedId === id;
            const isMismatch = rec.status === 'RATE_MISMATCH';
            const isUnknown  = rec.status === 'UNKNOWN_HSN';
            const waMsg = isMismatch ? buildHsnCorrectionWhatsApp(rec, currentLang) : '';

            return (
              <div
                key={id}
                className={`hsn-result-card glass-panel${isMismatch ? ' hsn-mismatch' : ''}`}
              >
                {/* ── Main row ── */}
                <div className="hsn-result-main">
                  <div className="hsn-result-info">
                    <p className="hsn-result-supplier">{rec.supplierName || 'Unknown Supplier'}</p>
                    <div className="hsn-result-meta">
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{rec.invoiceNumber}</span>
                      <span style={{ color: 'var(--text-muted)' }}>·</span>
                      <span className="hsn-code-chip">HSN {rec.hsnCode}</span>
                      <span style={{ color: 'var(--text-muted)' }}>·</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{rec.description}</span>
                    </div>
                  </div>

                  <div className="hsn-result-rates">
                    <div className="hsn-rate-box">
                      <div className="hsn-rate-label">Actual</div>
                      <div className="hsn-rate-val" style={{ color: isMismatch ? 'var(--red)' : 'var(--green)' }}>
                        {rec.actualRate}%
                      </div>
                    </div>
                    {rec.expectedRate !== null && (
                      <>
                        <span className="hsn-rate-arrow" style={{ color: isMismatch ? 'var(--red)' : 'var(--green)' }}>
                          {isMismatch ? '≠' : '='}
                        </span>
                        <div className="hsn-rate-box">
                          <div className="hsn-rate-label">Expected</div>
                          <div className="hsn-rate-val" style={{ color: 'var(--primary)' }}>
                            {rec.expectedRate}%
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="hsn-result-status">
                    {rec.status === 'CORRECT' && (
                      <span className="hsn-badge hsn-badge-ok">
                        <CheckCircle2 size={11} /> Correct
                      </span>
                    )}
                    {rec.status === 'RATE_MISMATCH' && (
                      <span className="hsn-badge hsn-badge-err">
                        <XCircle size={11} /> Wrong Rate
                      </span>
                    )}
                    {rec.status === 'UNKNOWN_HSN' && (
                      <span className="hsn-badge hsn-badge-warn">
                        <AlertTriangle size={11} /> Unknown HSN
                      </span>
                    )}
                  </div>

                  {isMismatch && (
                    <button
                      className="hsn-expand-btn"
                      onClick={() => setExpandedId(isExpanded ? null : id)}
                      title="View correction details"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                </div>

                {/* ── Impact chips ── */}
                {isMismatch && (
                  <div className="hsn-impact-row">
                    <span className="hsn-impact-chip">
                      Tax diff: ₹{Math.abs(rec.overchargeAmount || 0).toFixed(0)}
                      &nbsp;({rec.diff > 0 ? 'over-billed' : 'under-billed'})
                    </span>
                    <span className="hsn-impact-chip score-penalty">−10 pts trust score</span>
                    {rec.isChapterLevel && (
                      <span className="hsn-impact-chip chapter-note">
                        <Info size={11} /> Chapter-level estimate
                      </span>
                    )}
                  </div>
                )}

                {/* ── Expanded correction panel ── */}
                {isExpanded && isMismatch && (
                  <div className="hsn-expand-body">
                    <div className="hsn-expand-rec">
                      <strong style={{ color: 'var(--yellow)' }}>Recommended Action:</strong>
                      &nbsp;Ask supplier to amend GSTR-1 for invoice {rec.invoiceNumber} with HSN&nbsp;
                      <strong>{rec.hsnCode}</strong> at <strong>{rec.expectedRate}% IGST</strong> (was {rec.actualRate}%).
                      {rec.overchargeAmount > 0
                        ? ` Supplier over-billed GST by ₹${Math.abs(rec.overchargeAmount).toFixed(0)}.`
                        : rec.overchargeAmount < 0
                        ? ` Supplier under-billed GST by ₹${Math.abs(rec.overchargeAmount).toFixed(0)}. You may need to reverse excess ITC.`
                        : ''}
                      &nbsp;A credit/debit note may be required if the invoice is already filed.
                    </div>
                    <textarea
                      className="hsn-wa-textarea"
                      readOnly
                      value={waMsg}
                      rows={8}
                    />
                    <div className="hsn-wa-actions">
                      <button
                        className="btn-secondary"
                        style={{ gap: 6, display: 'flex', alignItems: 'center' }}
                        onClick={() => {
                          navigator.clipboard.writeText(waMsg).then(() => {
                            setCopiedId(id);
                            setTimeout(() => setCopiedId(null), 2000);
                          });
                        }}
                      >
                        <Copy size={13} />
                        {copiedId === id ? 'Copied!' : (t.scCopyMsg || 'Copy Message')}
                      </button>
                      <button
                        className="btn-primary hsn-wa-btn"
                        style={{ gap: 6, display: 'flex', alignItems: 'center' }}
                        onClick={() => {
                          const phone = String(rec.supplierPhone || '').replace(/\D/g, '');
                          const url = phone.length === 10
                            ? `https://api.whatsapp.com/send?phone=91${phone}&text=${encodeURIComponent(waMsg)}`
                            : `https://api.whatsapp.com/send?text=${encodeURIComponent(waMsg)}`;
                          window.open(url, '_blank');
                        }}
                      >
                        <MessageCircle size={13} />
                        {t.scSendWhatsApp || 'Send via WhatsApp'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
