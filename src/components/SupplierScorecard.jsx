import React, { useState, useMemo } from 'react';
import {
  Users, Search, ChevronDown, ChevronUp, Send,
  CheckCircle2, XCircle, AlertTriangle, TrendingDown,
  Shield, Award, Star,
} from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { computeSupplierScores } from '../utils/reconciliationEngine';

/* ─── helpers ─── */
const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function trustGrade(score) {
  if (score >= 90) return { grade: 'A+', color: '#00DF9A', label: 'Excellent' };
  if (score >= 80) return { grade: 'A',  color: '#34D399', label: 'Good' };
  if (score >= 70) return { grade: 'B+', color: '#6EE7B7', label: 'Above Avg' };
  if (score >= 60) return { grade: 'B',  color: '#FACC15', label: 'Average' };
  if (score >= 45) return { grade: 'C',  color: '#FB923C', label: 'Below Avg' };
  if (score >= 25) return { grade: 'D',  color: '#F87171', label: 'Poor' };
  return             { grade: 'F',  color: '#EF4444', label: 'Failing' };
}

function scoreColor(s) {
  if (s >= 70) return 'var(--green)';
  if (s >= 40) return 'var(--yellow)';
  return 'var(--red)';
}

/* SVG circular gauge */
function ScoreGauge({ score }) {
  const R = 30, CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - score / 100);
  const color = scoreColor(score);
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" style={{ flexShrink: 0 }}>
      <circle cx="38" cy="38" r={R} fill="none" stroke="var(--border-color)" strokeWidth="6" />
      <circle
        cx="38" cy="38" r={R}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={CIRC}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 38 38)"
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
      />
      <text x="38" y="42" textAnchor="middle" fill={color} fontSize="13" fontWeight="700" fontFamily="Outfit,sans-serif">
        {score}
      </text>
    </svg>
  );
}

const RISK_BADGE = {
  HIGH:   { bg: 'rgba(248,113,113,0.15)', color: 'var(--red)',    border: 'var(--red)' },
  MEDIUM: { bg: 'rgba(250,204,21,0.15)',  color: 'var(--yellow)', border: 'var(--yellow)' },
  LOW:    { bg: 'rgba(0,223,154,0.15)',   color: 'var(--green)',  border: 'var(--green)' },
};

/* WhatsApp reminder draft */
function buildWhatsApp(supplier, lang) {
  const name = supplier.name.split(' ')[0];
  const itcRisk = fmt(supplier.itcRisk);
  if (lang === 'hi') {
    return `नमस्ते ${name}, आपके ${supplier.defaults} बिल जीएसटी पोर्टल पर नहीं हैं। हमारा ${itcRisk} का आईटीसी क्रेडिट रुका हुआ है। कृपया जल्द ही GSTR-1 में अपलोड करें। धन्यवाद - पॉकेटसीए`;
  }
  if (lang === 'hing') {
    return `Namaste ${name}, aapke ${supplier.defaults} bills GST portal par nahi hain. Hamara ${itcRisk} ka ITC credit block hai. Kripya jald GSTR-1 me upload karein. Thanks - PocketCA`;
  }
  return `Dear ${name}, ${supplier.defaults} of your invoice(s) are missing from GSTR-2B, blocking ${itcRisk} of our ITC. Please upload them to the GST portal. Thank you — PocketCA`;
}

export default function SupplierScorecard({ reconciledData, currentLang }) {
  const t = TRANSLATIONS[currentLang];
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('risk'); // risk | score | name | itc
  const [expanded, setExpanded] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const suppliers = useMemo(() => computeSupplierScores(reconciledData), [reconciledData]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const list = q
      ? suppliers.filter(s => s.name.toLowerCase().includes(q) || s.gstin.toLowerCase().includes(q))
      : [...suppliers];
    return list.sort((a, b) => {
      if (sortBy === 'score') return a.score - b.score;
      if (sortBy === 'name')  return a.name.localeCompare(b.name);
      if (sortBy === 'itc')   return b.itcRisk - a.itcRisk;
      // risk: HIGH first
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3);
    });
  }, [suppliers, query, sortBy]);

  // Summary stats
  const highRisk   = suppliers.filter(s => s.riskLevel === 'HIGH').length;
  const totalRisk  = suppliers.reduce((s, x) => s + x.itcRisk, 0);
  const avgScore   = suppliers.length
    ? Math.round(suppliers.reduce((s, x) => s + x.score, 0) / suppliers.length)
    : 100;

  const copyMsg = (id, msg) => {
    navigator.clipboard.writeText(msg);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (suppliers.length === 0) {
    return (
      <div className="scorecard-empty glass-panel">
        <Users size={44} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
        <h3>{t.scNoDataTitle}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{t.scNoDataDesc}</p>
      </div>
    );
  }

  return (
    <div className="scorecard-container">

      {/* ── Summary bar ── */}
      <div className="scorecard-summary glass-panel">
        {[
          { label: t.scTotalSuppliers, value: suppliers.length, icon: <Users size={18} color="var(--primary)" />, color: 'var(--primary)' },
          { label: t.scHighRisk,       value: highRisk, icon: <TrendingDown size={18} color="var(--red)" />, color: 'var(--red)' },
          { label: t.scAvgScore,       value: avgScore, icon: <Star size={18} color="var(--yellow)" />, color: 'var(--yellow)' },
          { label: t.scTotalAtRisk,    value: fmt(totalRisk), icon: <Shield size={18} color="var(--orange-accent)" />, color: 'var(--orange-accent)' },
        ].map((s, i) => (
          <div key={i} className="scorecard-stat">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              {s.icon}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Controls ── */}
      <div className="scorecard-controls glass-panel">
        <div className="sc-search-wrap">
          <Search size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            className="sc-search-input"
            placeholder={t.scSearchPlaceholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'risk',  label: t.scSortRisk  },
            { key: 'score', label: t.scSortScore },
            { key: 'itc',   label: t.scSortItc   },
            { key: 'name',  label: t.scSortName  },
          ].map(opt => (
            <button
              key={opt.key}
              className={`sc-sort-btn ${sortBy === opt.key ? 'active' : ''}`}
              onClick={() => setSortBy(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Supplier cards ── */}
      <div className="scorecard-list">
        {filtered.map((s, idx) => {
          const grade = trustGrade(s.score);
          const rb = RISK_BADGE[s.riskLevel] || RISK_BADGE.LOW;
          const isExpanded = expanded === s.gstin;
          const waMsg = buildWhatsApp(s, currentLang);

          return (
            <div
              key={s.gstin}
              className={`sc-card glass-panel ${isExpanded ? 'sc-card-expanded' : ''}`}
              style={{ borderLeft: `3px solid ${grade.color}` }}
            >
              {/* ── Card header row ── */}
              <div className="sc-card-main">
                <ScoreGauge score={s.score} />

                <div className="sc-card-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="sc-rank">#{idx + 1}</span>
                    <span className="sc-name">{s.name}</span>
                    <span className="sc-risk-badge" style={rb}>{s.riskLevel}</span>
                  </div>
                  <span className="sc-gstin">{s.gstin}</span>

                  <div className="sc-stats-row">
                    <div className="sc-stat-chip"><CheckCircle2 size={12} color="var(--green)" />{s.matched} {t.scMatched}</div>
                    <div className="sc-stat-chip"><XCircle size={12} color="var(--red)" />{s.defaults} {t.scDefaults}</div>
                    <div className="sc-stat-chip"><AlertTriangle size={12} color="var(--yellow)" />{s.mismatches} {t.scMismatches}</div>
                  </div>
                </div>

                <div className="sc-card-right">
                  <div
                    className="sc-grade-badge"
                    style={{ background: grade.color + '22', color: grade.color, border: `1px solid ${grade.color}` }}
                  >
                    <span className="sc-grade-letter">{grade.grade}</span>
                    <span className="sc-grade-label">{grade.label}</span>
                  </div>
                  {s.itcRisk > 0 && (
                    <div style={{ textAlign: 'center', marginTop: 6 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.scItcAtRisk}</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--red)' }}>{fmt(s.itcRisk)}</div>
                    </div>
                  )}
                  <button
                    className="sc-toggle-btn"
                    onClick={() => setExpanded(isExpanded ? null : s.gstin)}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {/* ── Expanded: WhatsApp drafter ── */}
              {isExpanded && (
                <div className="sc-expand-body">
                  <div className="sc-expand-divider" />

                  {s.defaults > 0 || s.mismatches > 0 ? (
                    <div className="sc-whatsapp-section">
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                        {t.scWhatsAppLabel}
                      </p>
                      <textarea
                        className="sc-wa-textarea"
                        value={waMsg}
                        readOnly
                      />
                      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                        <button
                          className="btn-secondary flex-center"
                          style={{ fontSize: '0.8rem', padding: '8px 16px' }}
                          onClick={() => copyMsg(s.gstin, waMsg)}
                        >
                          {copiedId === s.gstin ? '✓ Copied' : t.scCopyMsg}
                        </button>
                        <button
                          className="btn-primary-mini flex-center"
                          style={{ fontSize: '0.8rem' }}
                          onClick={() => {
                            window.open(
                              `https://api.whatsapp.com/send?text=${encodeURIComponent(waMsg)}`,
                              '_blank'
                            );
                          }}
                        >
                          <Send size={13} style={{ marginRight: 6 }} />
                          {t.scSendWhatsApp}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
                      <Award size={16} color="var(--green)" />
                      <span style={{ fontSize: '0.84rem', color: 'var(--green)' }}>{t.scPerfectScore}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="scorecard-empty glass-panel" style={{ padding: 32 }}>
          <Search size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
          <p style={{ color: 'var(--text-secondary)' }}>{t.scNoResults}</p>
        </div>
      )}
    </div>
  );
}
