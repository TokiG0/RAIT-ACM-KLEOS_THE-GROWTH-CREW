import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle, ArrowUpRight,
  Lightbulb, Trophy, AlertCircle, IndianRupee, Code2, User,
  Clock, Calendar, ChevronRight, X, Info,
} from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { generateInsights, getGSTDeadlines } from '../utils/insightsEngine';

/* ─── animated counter hook ─── */
function useCountUp(target, duration = 900) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!target || target === 0) { setCurrent(0); return; }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setCurrent(Math.round(target * ease));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return current;
}

/* ─── formatters ─── */
const fmtRupee = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

/* ─── insight icon map ─── */
const INSIGHT_ICONS = {
  alert: AlertCircle, supplier: User, code: Code2,
  rupee: IndianRupee, id: User, money: IndianRupee,
  trophy: Trophy, warning: AlertTriangle, start: Lightbulb, info: Lightbulb,
};

const SEV = {
  critical: { border: 'var(--red)',    bg: 'rgba(248,113,113,0.07)', icon: 'var(--red)'    },
  high:     { border: 'var(--yellow)', bg: 'rgba(250,204,21,0.06)',  icon: 'var(--yellow)' },
  medium:   { border: 'var(--blue)',   bg: 'rgba(56,189,248,0.06)',  icon: 'var(--blue)'   },
  success:  { border: 'var(--green)',  bg: 'rgba(0,223,154,0.06)',   icon: 'var(--green)'  },
  info:     { border: 'var(--primary)','bg': 'var(--primary-glow)', icon: 'var(--primary)' },
};

const DL_COLORS = {
  yellow: { color: 'var(--yellow)', bg: 'rgba(250,204,21,0.12)'   },
  red:    { color: 'var(--red)',    bg: 'rgba(248,113,113,0.12)'  },
  blue:   { color: 'var(--blue)',   bg: 'rgba(56,189,248,0.12)'   },
};

/* ─── Section 17(5) blocked categories ─── */
const SEC17_ITEMS = [
  'Motor vehicles & aircraft',
  'Food, beverages & outdoor catering',
  'Club & gym membership',
  'Rent-a-cab & health insurance*',
  'Works contract (immovable property)',
  'Personal-use goods & services',
];

/* ─── Animated KPI card ─── */
function KpiCard({ title, icon, value, desc, borderClass, textClass, onClick }) {
  const animated = useCountUp(value);
  return (
    <div className={`kpi-card glass-panel ${borderClass}`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="kpi-header">
        <span className={`kpi-title ${textClass}`}>{title}</span>
        {React.cloneElement(icon, { size: 24, className: textClass })}
      </div>
      <div className={`kpi-value ${textClass}`}>{fmtRupee(animated)}</div>
      <p className="kpi-desc text-secondary">{desc}</p>
    </div>
  );
}

/* ─── main component ─── */
export default function Dashboard({ summary, reconciledData = [], currentLang, changeTab }) {
  const t = TRANSLATIONS[currentLang];
  const { claimableItc, blockedItc, atRiskItc, unclaimedItc, totalLoss, reconciliationScore } = summary;

  const [sec17Dismissed, setSec17Dismissed] = useState(() => {
    try { return sessionStorage.getItem('sec17dismissed') === '1'; } catch { return false; }
  });
  const dismiss17 = useCallback(() => {
    setSec17Dismissed(true);
    try { sessionStorage.setItem('sec17dismissed', '1'); } catch {}
  }, []);

  const insights  = generateInsights(reconciledData, summary);
  const deadlines = getGSTDeadlines();

  const summarySentence = t.kpiSummaryText
    .replace('{claimable}', fmtRupee(claimableItc))
    .replace('{loss}', fmtRupee(totalLoss));

  return (
    <div className="dashboard-container">

      {/* ── Section 17(5) alert banner ── */}
      {!sec17Dismissed && (
        <div className="sec17-alert">
          <div className="sec17-alert-left">
            <Info size={18} color="var(--yellow)" style={{ flexShrink: 0 }} />
            <div>
              <p className="sec17-title">{t.sec17Title}</p>
              <p className="sec17-desc">{t.sec17Desc}</p>
              <div className="sec17-chips">
                {SEC17_ITEMS.map(item => (
                  <span key={item} className="sec17-chip">{item}</span>
                ))}
              </div>
            </div>
          </div>
          <button className="sec17-dismiss" onClick={dismiss17} title="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Summary banner ── */}
      <div className="summary-banner-card glass-panel">
        <div className="summary-banner-content">
          <div className="summary-banner-icon animate-pulse"><ArrowUpRight size={28} /></div>
          <div>
            <h3>{t.appSubtitle}</h3>
            <p className="summary-text">{summarySentence}</p>
          </div>
        </div>
      </div>

      {/* ── KPI grid (animated) ── */}
      <div className="kpi-grid">
        <KpiCard
          title={t.kpiClaimable} icon={<CheckCircle2 />} value={claimableItc}
          desc={t.kpiClaimableDesc} borderClass="border-green" textClass="text-green"
          onClick={() => changeTab('reconciliation')}
        />
        <KpiCard
          title={t.kpiBlocked} icon={<AlertTriangle />} value={blockedItc}
          desc={t.kpiBlockedDesc} borderClass="border-yellow" textClass="text-yellow"
          onClick={() => changeTab('reconciliation')}
        />
        <KpiCard
          title={t.kpiAtRisk} icon={<XCircle />} value={atRiskItc}
          desc={t.kpiAtRiskDesc} borderClass="border-red" textClass="text-red"
          onClick={() => changeTab('reconciliation')}
        />
        <KpiCard
          title={t.kpiUnclaimed} icon={<HelpCircle />} value={unclaimedItc}
          desc={t.kpiUnclaimedDesc} borderClass="border-blue" textClass="text-blue"
          onClick={() => changeTab('reconciliation')}
        />
      </div>

      {/* ── Charts section ── */}
      <div className="charts-section">
        <div className="chart-card glass-panel">
          <h4>{t.kpiScore}</h4>
          <div className="meter-container">
            <div className="radial-progress-outer">
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" className="radial-bg" />
                <circle
                  cx="80" cy="80" r="70"
                  className={`radial-fill ${reconciliationScore > 80 ? 'fill-green' : reconciliationScore > 50 ? 'fill-yellow' : 'fill-red'}`}
                  strokeDasharray={`${2 * Math.PI * 70}`}
                  strokeDashoffset={`${2 * Math.PI * 70 * (1 - reconciliationScore / 100)}`}
                  transform="rotate(-90 80 80)"
                />
              </svg>
              <div className="radial-label-box">
                <span className="radial-value">{reconciliationScore}%</span>
              </div>
            </div>
            <div className="meter-legend">
              <div className="legend-item"><span className="dot dot-green" /><span>Verified: {reconciliationScore}%</span></div>
              <div className="legend-item"><span className="dot dot-red" /><span>Issues: {100 - reconciliationScore}%</span></div>
            </div>
          </div>
        </div>

        <div className="chart-card glass-panel">
          <h4>Tax Credit Health</h4>
          <div className="progress-bar-container">
            <div className="financial-totals">
              <span className="text-secondary">Total Booked ITC: </span>
              <span className="text-bold">{fmtRupee(claimableItc + totalLoss)}</span>
            </div>
            <div className="split-bar-track">
              <div className="split-bar-fill bg-green" style={{ width: `${(claimableItc / (claimableItc + totalLoss || 1)) * 100}%` }} />
              <div className="split-bar-fill bg-yellow" style={{ width: `${(blockedItc / (claimableItc + totalLoss || 1)) * 100}%` }} />
              <div className="split-bar-fill bg-red" style={{ width: `${(atRiskItc / (claimableItc + totalLoss || 1)) * 100}%` }} />
            </div>
            <div className="split-bar-labels">
              <div className="label-item"><span className="color-box bg-green" /><span>Safe ({Math.round((claimableItc / (claimableItc + totalLoss || 1)) * 100)}%)</span></div>
              <div className="label-item"><span className="color-box bg-yellow" /><span>HSN/Rate ({Math.round((blockedItc / (claimableItc + totalLoss || 1)) * 100)}%)</span></div>
              <div className="label-item"><span className="color-box bg-red" /><span>Defaults ({Math.round((atRiskItc / (claimableItc + totalLoss || 1)) * 100)}%)</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Smart Insights + Deadlines row ── */}
      <div className="dashboard-bottom-row">

        <div className="insights-panel glass-panel">
          <div className="insights-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={18} color="var(--yellow)" />
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Smart Insights</h4>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{insights.length} finding{insights.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="insights-list">
            {insights.map(ins => {
              const sty = SEV[ins.severity] || SEV.info;
              const Icon = INSIGHT_ICONS[ins.icon] || Lightbulb;
              return (
                <div key={ins.id} className="insight-item" style={{ borderLeft: `3px solid ${sty.border}`, background: sty.bg }}>
                  <div className="insight-item-icon" style={{ color: sty.icon }}><Icon size={16} /></div>
                  <div className="insight-item-body">
                    <p className="insight-title">{ins.title}</p>
                    <p className="insight-desc">{ins.desc}</p>
                  </div>
                  <button className="insight-action-btn" onClick={() => changeTab(ins.actionTab)} style={{ color: sty.border }}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="deadline-panel glass-panel">
          <div className="insights-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={18} color="var(--blue)" />
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>GST Deadlines</h4>
            </div>
            <button
              style={{ fontSize: '0.74rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => changeTab('calendar')}
            >
              Full Calendar →
            </button>
          </div>
          <div className="deadlines-list">
            {deadlines.map(dl => {
              const cs = DL_COLORS[dl.color] || DL_COLORS.blue;
              return (
                <div key={dl.id} className="deadline-item" style={{ borderLeft: `3px solid ${cs.color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: cs.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Clock size={16} color={cs.color} />
                    </div>
                    <div>
                      <p className="deadline-name">{dl.name}</p>
                      <p className="deadline-desc">{dl.desc}</p>
                    </div>
                  </div>
                  <div className="deadline-countdown" style={{ textAlign: 'right' }}>
                    <div className="deadline-days" style={{ color: dl.urgent ? 'var(--red)' : cs.color }}>{dl.daysLeft}d</div>
                    <div className="deadline-date">{dl.dateLabel}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
            GST Registered Taxpayers · turnover &gt; ₹20 L
          </p>
        </div>
      </div>
    </div>
  );
}
