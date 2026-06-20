// Generates smart, data-driven insights from reconciliation results.

const formatRupee = (num) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);

export function generateInsights(reconciledData, summary) {
  const insights = [];

  const defaults = reconciledData.filter(r => r.status === 'SUPPLIER_DEFAULT');
  const hsnErrors = reconciledData.filter(r => r.status === 'MISMATCH_HSN');
  const amtErrors = reconciledData.filter(r => r.status === 'MISMATCH_AMOUNT');
  const gstinErrors = reconciledData.filter(r => r.status === 'MISMATCH_GSTIN');
  const totalTracked = summary.claimableItc + summary.blockedItc + summary.atRiskItc + summary.unclaimedItc;

  // Critical: large total ITC at risk
  if (summary.totalLoss > 0) {
    const lossPercent = totalTracked > 0 ? Math.round((summary.totalLoss / totalTracked) * 100) : 0;
    insights.push({
      id: 'total-risk',
      severity: lossPercent > 50 ? 'critical' : 'high',
      icon: 'alert',
      title: `${formatRupee(summary.totalLoss)} ITC at Risk`,
      desc: `${lossPercent}% of your tracked tax credit is blocked or at risk this period. Act now to minimize denial.`,
      action: 'Go to Action Center',
      actionTab: 'actions',
    });
  }

  // Supplier defaults
  if (defaults.length > 0) {
    const worstDefault = [...defaults].sort((a, b) => b.financialImpact - a.financialImpact)[0];
    const totalDefaultRisk = defaults.reduce((s, r) => s + r.financialImpact, 0);
    insights.push({
      id: 'supplier-defaults',
      severity: 'critical',
      icon: 'supplier',
      title: `${defaults.length} Supplier${defaults.length > 1 ? 's' : ''} Failed to File`,
      desc: `${formatRupee(totalDefaultRisk)} locked. Top offender: ${worstDefault.purchase?.supplierName || 'Unknown'} (${formatRupee(worstDefault.financialImpact)}).`,
      action: 'Send WhatsApp Reminder',
      actionTab: 'actions',
    });
  }

  // HSN mismatches
  if (hsnErrors.length > 0) {
    const total = hsnErrors.reduce((s, r) => s + r.financialImpact, 0);
    insights.push({
      id: 'hsn-mismatch',
      severity: 'high',
      icon: 'code',
      title: `${hsnErrors.length} HSN Code Error${hsnErrors.length > 1 ? 's' : ''} Found`,
      desc: `${formatRupee(total)} blocked due to wrong product category codes uploaded by suppliers.`,
      action: 'Fix HSN Issues',
      actionTab: 'actions',
    });
  }

  // Amount mismatches
  if (amtErrors.length > 0) {
    const total = amtErrors.reduce((s, r) => s + Math.abs(r.financialImpact), 0);
    insights.push({
      id: 'amount-mismatch',
      severity: 'medium',
      icon: 'rupee',
      title: `Tax Amount Discrepancy on ${amtErrors.length} Invoice${amtErrors.length > 1 ? 's' : ''}`,
      desc: `${formatRupee(total)} difference between your books and portal entries. Ask suppliers to amend GSTR-1.`,
      action: 'View Mismatches',
      actionTab: 'reconciliation',
    });
  }

  // GSTIN errors
  if (gstinErrors.length > 0) {
    insights.push({
      id: 'gstin-error',
      severity: 'high',
      icon: 'id',
      title: `${gstinErrors.length} Wrong GSTIN Upload${gstinErrors.length > 1 ? 's' : ''}`,
      desc: `Suppliers filed under the wrong GSTIN. ITC cannot be claimed until they amend their returns.`,
      action: 'Contact Suppliers',
      actionTab: 'actions',
    });
  }

  // Unclaimed opportunity
  if (summary.unclaimedItc > 0) {
    insights.push({
      id: 'unclaimed',
      severity: 'medium',
      icon: 'money',
      title: `${formatRupee(summary.unclaimedItc)} Unclaimed — Act Now`,
      desc: `Invoices on the portal not recorded in your purchase book. Add them before filing to claim this credit.`,
      action: 'View Purchase Book',
      actionTab: 'purchaseRegister',
    });
  }

  // Positive: great match score
  if (summary.reconciliationScore >= 80 && summary.claimableItc > 0) {
    insights.push({
      id: 'score-good',
      severity: 'success',
      icon: 'trophy',
      title: `Compliance Score: ${summary.reconciliationScore}% — Great Job!`,
      desc: `Most invoices match perfectly. ${formatRupee(summary.claimableItc)} is fully claimable this period.`,
      action: 'View Full Report',
      actionTab: 'reconciliation',
    });
  } else if (summary.reconciliationScore < 40 && reconciledData.length > 0) {
    insights.push({
      id: 'score-bad',
      severity: 'critical',
      icon: 'warning',
      title: `Low Compliance Rate: ${summary.reconciliationScore}%`,
      desc: `Over half of invoices have issues. Without action, ITC denial notices may follow.`,
      action: 'Fix Issues Now',
      actionTab: 'reconciliation',
    });
  }

  // No data state
  if (reconciledData.length === 0) {
    insights.push({
      id: 'no-data',
      severity: 'info',
      icon: 'start',
      title: 'Import Data to Get Insights',
      desc: 'Load your GSTR-2B and Purchase data to see AI-powered reconciliation insights here.',
      action: 'Import GSTR-2B',
      actionTab: 'import',
    });
  }

  return insights;
}

export function getGSTDeadlines() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  const nextM = m === 11 ? 0 : m + 1;
  const nextY = m === 11 ? y + 1 : y;

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const deadlines = [
    { id: 'gstr1', name: 'GSTR-1', desc: 'Sales returns — outward supply', date: new Date(nextY, nextM, 11), color: 'yellow' },
    { id: 'gstr3b', name: 'GSTR-3B', desc: 'Monthly tax summary & payment', date: new Date(nextY, nextM, 20), color: 'red' },
    { id: 'gstr2b', name: 'GSTR-2B', desc: 'Auto ITC statement (view only)', date: new Date(nextY, nextM, 14), color: 'blue' },
  ];

  return deadlines.map(d => {
    const daysLeft = Math.ceil((d.date - now) / (1000 * 60 * 60 * 24));
    return {
      ...d,
      daysLeft,
      urgent: daysLeft <= 5,
      dateLabel: `${d.date.getDate()} ${MONTH_NAMES[d.date.getMonth()]}`,
    };
  }).sort((a, b) => a.daysLeft - b.daysLeft);
}
