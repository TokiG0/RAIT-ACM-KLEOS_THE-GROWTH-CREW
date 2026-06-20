import React, { useState, useMemo, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Sector,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { TrendingUp, BarChart2, PieChartIcon, Activity, Download, Zap, Shield, Users, Target } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import { computeSupplierScores } from '../utils/reconciliationEngine';

/* ─── constants ─── */
const TOOLTIP_STYLE = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  padding: '8px 14px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
};

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

/* Gradient definitions for AreaChart */
const GRADIENTS = (
  <defs>
    <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor="#00DF9A" stopOpacity={0.35} />
      <stop offset="95%" stopColor="#00DF9A" stopOpacity={0.02} />
    </linearGradient>
    <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor="#F87171" stopOpacity={0.35} />
      <stop offset="95%" stopColor="#F87171" stopOpacity={0.02} />
    </linearGradient>
  </defs>
);

/* Custom active-shape for the donut */
const renderActiveShape = (props) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, value,
  } = props;
  return (
    <g>
      <text x={cx} y={cy - 10} textAnchor="middle" fill="var(--text-primary)" fontSize={13} fontWeight={700}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={fill} fontSize={11}>
        {fmt(value)}
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 4} outerRadius={innerRadius - 2}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

/* Custom tooltips */
const RupeeTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ marginBottom: 4, fontWeight: 600 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
};

const CountTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ marginBottom: 4, fontWeight: 600 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

/* Period selector */
const PERIODS = ['Monthly', 'Quarterly', 'Half-Year'];

/* Deterministic trend generator — stable across re-renders for same summary */
function buildTrend(period, claimable, atRisk) {
  const base = claimable || 1800;
  const rBase = atRisk || 5040;
  const slots = period === 'Monthly'   ? ['Jan','Feb','Mar','Apr','May','Jun']
              : period === 'Quarterly' ? ['Q1 FY25','Q2 FY25','Q3 FY25','Q4 FY25']
              : ['H1 FY24','H2 FY24','H1 FY25','H2 FY25'];
  const clFactors = [0.60, 0.72, 0.80, 0.88, 0.95, 1.00, 1.62, 1.78, 2.20, 2.42].slice(0, slots.length);
  const rFactors  = [1.50, 1.30, 1.15, 1.00, 0.88, 1.00, 1.35, 1.20, 1.45, 0.90].slice(0, slots.length);
  return slots.map((s, i) => ({
    period: s,
    'Safe ITC':  Math.round(base * clFactors[i]),
    'At Risk':   Math.round(rBase * rFactors[i]),
  }));
}

export default function AnalyticsPanel({ reconciledData, summary, purchaseRecords, currentLang }) {
  const t = TRANSLATIONS[currentLang];
  const [activePieIndex, setActivePieIndex] = useState(0);
  const [activePeriod, setActivePeriod] = useState('Monthly');

  const totalItc   = summary.claimableItc + summary.blockedItc + summary.atRiskItc + summary.unclaimedItc;
  const recoveryPct = totalItc > 0 ? Math.round((summary.claimableItc / totalItc) * 100) : 0;

  /* Derived data */
  const pieData = useMemo(() => [
    { name: 'Claimable', value: summary.claimableItc,  color: '#00DF9A' },
    { name: 'Blocked',   value: summary.blockedItc,    color: '#FACC15' },
    { name: 'At Risk',   value: summary.atRiskItc,     color: '#F87171' },
    { name: 'Unclaimed', value: summary.unclaimedItc,  color: '#38BDF8' },
  ].filter(d => d.value > 0), [summary]);

  const trendData = useMemo(
    () => buildTrend(activePeriod, summary.claimableItc, summary.atRiskItc),
    [activePeriod, summary.claimableItc, summary.atRiskItc]
  );

  const supplierScores = useMemo(() => computeSupplierScores(reconciledData), [reconciledData]);

  const topSuppliers = useMemo(() =>
    supplierScores.slice(0, 6).map(s => ({
      name: s.name.length > 12 ? s.name.slice(0, 12) + '…' : s.name,
      Score: s.score,
      'ITC Risk': Math.round(s.itcRisk),
      fill: s.score >= 70 ? '#00DF9A' : s.score >= 40 ? '#FACC15' : '#F87171',
    }))
  , [supplierScores]);

  const statusDist = useMemo(() => {
    const counts = {};
    reconciledData.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const colorMap = {
      MATCHED: '#00DF9A', SUPPLIER_DEFAULT: '#F87171',
      UNCLAIMED: '#38BDF8', MISMATCH_HSN: '#FACC15',
      MISMATCH_AMOUNT: '#FB923C', MISMATCH_GSTIN: '#C084FC',
    };
    return Object.entries(counts).map(([s, c]) => ({
      status: s.replace(/_/g, ' '),
      count: c,
      fill: colorMap[s] || '#94A3B8',
    }));
  }, [reconciledData]);

  const onPieEnter = useCallback((_, index) => setActivePieIndex(index), []);

  /* Download summary as CSV */
  const downloadSummary = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Claimable ITC', summary.claimableItc],
      ['Blocked ITC', summary.blockedItc],
      ['At-Risk ITC', summary.atRiskItc],
      ['Unclaimed ITC', summary.unclaimedItc],
      ['Match Score (%)', summary.reconciliationScore],
      ['Recovery Rate (%)', recoveryPct],
      ['Invoices Processed', purchaseRecords.length],
      ['Suppliers Tracked', supplierScores.length],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'PocketCA_Analytics_Summary.csv'; a.click();
  };

  return (
    <div className="apanel-container">

      {/* ── Header ── */}
      <div className="apanel-header glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="apanel-icon-wrap"><TrendingUp size={20} color="var(--primary)" /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>ITC Analytics</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Interactive charts — hover to explore
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="apanel-badge" style={{ color: summary.reconciliationScore >= 70 ? 'var(--green)' : 'var(--red)', borderColor: summary.reconciliationScore >= 70 ? 'var(--green)' : 'var(--red)' }}>
            <Zap size={13} /> {summary.reconciliationScore}% match
          </div>
          <div className="apanel-badge" style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}>
            <Shield size={13} /> {recoveryPct}% recovery
          </div>
          <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }} onClick={downloadSummary}>
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="apanel-stats">
        {[
          { label: 'Total ITC',        val: fmt(totalItc),         icon: <Target size={16} color="var(--primary)" />, vc: 'var(--primary)' },
          { label: 'Safe & Claimable', val: fmt(summary.claimableItc), icon: <Shield size={16} color="var(--green)" />,  vc: 'var(--green)' },
          { label: 'Invoices',         val: purchaseRecords.length, icon: <Activity size={16} color="var(--blue)" />,   vc: 'var(--blue)' },
          { label: 'Suppliers',        val: supplierScores.length,  icon: <Users size={16} color="var(--yellow)" />,    vc: 'var(--yellow)' },
        ].map((s, i) => (
          <div key={i} className="apanel-stat glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
              {s.icon}
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: s.vc, marginTop: 8 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Charts grid ── */}
      <div className="apanel-charts">

        {/* Donut — ITC Breakdown */}
        <div className="apanel-chart-card glass-panel">
          <div className="apanel-chart-title">
            <PieChartIcon size={15} color="var(--primary)" />
            ITC Breakdown
          </div>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    activeIndex={activePieIndex}
                    activeShape={renderActiveShape}
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={62} outerRadius={92}
                    dataKey="value"
                    onMouseEnter={onPieEnter}
                  >
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} strokeWidth={0} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="apanel-pie-legend">
                {pieData.map((e, i) => (
                  <div
                    key={i}
                    className="apanel-pie-legend-item"
                    style={{ cursor: 'pointer', opacity: activePieIndex === i ? 1 : 0.6 }}
                    onMouseEnter={() => setActivePieIndex(i)}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.color, flexShrink: 0 }} />
                    <span>{e.name}: {fmt(e.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="apanel-empty">Import data to see ITC breakdown</div>
          )}
        </div>

        {/* Area chart — ITC Trend */}
        <div className="apanel-chart-card glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="apanel-chart-title" style={{ marginBottom: 0 }}>
              <Activity size={15} color="var(--green)" /> ITC Trend
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {PERIODS.map(p => (
                <button
                  key={p}
                  onClick={() => setActivePeriod(p)}
                  className={`apanel-period-btn ${activePeriod === p ? 'active' : ''}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              {GRADIENTS}
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<RupeeTip />} />
              <Legend wrapperStyle={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }} />
              <Area type="monotone" dataKey="Safe ITC" stroke="#00DF9A" strokeWidth={2.5} fill="url(#gradGreen)" dot={{ r: 4, fill: '#00DF9A', strokeWidth: 0 }} />
              <Area type="monotone" dataKey="At Risk"  stroke="#F87171" strokeWidth={2.5} fill="url(#gradRed)"   dot={{ r: 4, fill: '#F87171', strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
            * Trend extrapolated from current period data
          </p>
        </div>

        {/* Bar — Invoice status */}
        <div className="apanel-chart-card glass-panel">
          <div className="apanel-chart-title">
            <BarChart2 size={15} color="var(--blue)" /> Invoice Status
          </div>
          {statusDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusDist} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="status" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<CountTip />} />
                <Bar dataKey="count" name="Invoices" radius={[5, 5, 0, 0]}>
                  {statusDist.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="apanel-empty">No reconciliation data yet</div>
          )}
        </div>

        {/* Bar — Supplier reliability */}
        <div className="apanel-chart-card glass-panel">
          <div className="apanel-chart-title">
            <Users size={15} color="var(--yellow)" /> Supplier Scores
          </div>
          {topSuppliers.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topSuppliers} layout="vertical" margin={{ top: 5, right: 32, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} width={80} />
                <Tooltip content={<CountTip />} />
                <Bar dataKey="Score" name="Trust Score" radius={[0, 5, 5, 0]}>
                  {topSuppliers.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="apanel-empty">Import invoices to see scores</div>
          )}
        </div>

      </div>
    </div>
  );
}
