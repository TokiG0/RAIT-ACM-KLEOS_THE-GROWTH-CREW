import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, ArrowUpRight } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';

export default function Dashboard({ summary, currentLang, changeTab }) {
  const t = TRANSLATIONS[currentLang];
  const { claimableItc, blockedItc, atRiskItc, unclaimedItc, totalLoss, reconciliationScore } = summary;

  // Format currency in Indian standard Rupees
  const formatRupee = (num) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  const lossPercent = (totalLoss + claimableItc) > 0 
    ? Math.round((totalLoss / (totalLoss + claimableItc)) * 100) 
    : 0;

  const claimPercent = 100 - lossPercent;

  // Get dynamic summary sentence
  const summarySentence = t.kpiSummaryText
    .replace('{claimable}', formatRupee(claimableItc))
    .replace('{loss}', formatRupee(totalLoss));

  return (
    <div className="dashboard-container">
      {/* Dynamic Summary Card */}
      <div className="summary-banner-card glass-panel">
        <div className="summary-banner-content">
          <div className="summary-banner-icon animate-pulse">
            <ArrowUpRight size={28} />
          </div>
          <div>
            <h3>{t.appSubtitle}</h3>
            <p className="summary-text">{summarySentence}</p>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        {/* KPI: Ready to Claim (Green) */}
        <div className="kpi-card glass-panel border-green" onClick={() => changeTab('reconciliation')}>
          <div className="kpi-header">
            <span className="kpi-title text-green">{t.kpiClaimable}</span>
            <CheckCircle2 size={24} className="text-green" />
          </div>
          <div className="kpi-value text-green">{formatRupee(claimableItc)}</div>
          <p className="kpi-desc text-secondary">{t.kpiClaimableDesc}</p>
        </div>

        {/* KPI: Blocked ITC (Yellow) */}
        <div className="kpi-card glass-panel border-yellow" onClick={() => changeTab('reconciliation')}>
          <div className="kpi-header">
            <span className="kpi-title text-yellow">{t.kpiBlocked}</span>
            <AlertTriangle size={24} className="text-yellow" />
          </div>
          <div className="kpi-value text-yellow">{formatRupee(blockedItc)}</div>
          <p className="kpi-desc text-secondary">{t.kpiBlockedDesc}</p>
        </div>

        {/* KPI: Supplier Defaults (Red) */}
        <div className="kpi-card glass-panel border-red" onClick={() => changeTab('reconciliation')}>
          <div className="kpi-header">
            <span className="kpi-title text-red">{t.kpiAtRisk}</span>
            <XCircle size={24} className="text-red" />
          </div>
          <div className="kpi-value text-red">{formatRupee(atRiskItc)}</div>
          <p className="kpi-desc text-secondary">{t.kpiAtRiskDesc}</p>
        </div>

        {/* KPI: Unclaimed (Blue) */}
        <div className="kpi-card glass-panel border-blue" onClick={() => changeTab('reconciliation')}>
          <div className="kpi-header">
            <span className="kpi-title text-blue">{t.kpiUnclaimed}</span>
            <HelpCircle size={24} className="text-blue" />
          </div>
          <div className="kpi-value text-blue">{formatRupee(unclaimedItc)}</div>
          <p className="kpi-desc text-secondary">{t.kpiUnclaimedDesc}</p>
        </div>
      </div>

      {/* Visual Charts Section */}
      <div className="charts-section">
        {/* Compliance Meter */}
        <div className="chart-card glass-panel">
          <h4>{t.kpiScore}</h4>
          <div className="meter-container">
            <div className="radial-progress-outer">
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" className="radial-bg" />
                <circle 
                  cx="80" 
                  cy="80" 
                  r="70" 
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
              <div className="legend-item">
                <span className="dot dot-green"></span>
                <span>Verified Match: {reconciliationScore}%</span>
              </div>
              <div className="legend-item">
                <span className="dot dot-red"></span>
                <span>Mismatched or Missing: {100 - reconciliationScore}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Split Bar */}
        <div className="chart-card glass-panel">
          <h4>Tax Credit Health</h4>
          <div className="progress-bar-container">
            <div className="financial-totals">
              <div>
                <span className="text-secondary">Total Booked ITC: </span>
                <span className="text-bold">{formatRupee(claimableItc + totalLoss)}</span>
              </div>
            </div>
            
            <div className="split-bar-track">
              <div 
                className="split-bar-fill bg-green" 
                style={{ width: `${(claimableItc / (claimableItc + totalLoss || 1)) * 100}%` }}
                title={`Safe: ${formatRupee(claimableItc)}`}
              />
              <div 
                className="split-bar-fill bg-yellow" 
                style={{ width: `${(blockedItc / (claimableItc + totalLoss || 1)) * 100}%` }}
                title={`Blocked: ${formatRupee(blockedItc)}`}
              />
              <div 
                className="split-bar-fill bg-red" 
                style={{ width: `${(atRiskItc / (claimableItc + totalLoss || 1)) * 100}%` }}
                title={`At Risk: ${formatRupee(atRiskItc)}`}
              />
            </div>

            <div className="split-bar-labels">
              <div className="label-item">
                <span className="color-box bg-green"></span>
                <span>Safe Claims ({Math.round((claimableItc / (claimableItc + totalLoss || 1)) * 100)}%)</span>
              </div>
              <div className="label-item">
                <span className="color-box bg-yellow"></span>
                <span>HSN/Rate Issues ({Math.round((blockedItc / (claimableItc + totalLoss || 1)) * 100)}%)</span>
              </div>
              <div className="label-item">
                <span className="color-box bg-red"></span>
                <span>Supplier Defaults ({Math.round((atRiskItc / (claimableItc + totalLoss || 1)) * 100)}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
