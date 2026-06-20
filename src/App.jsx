import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Upload, ScanLine, CheckSquare,
  MessageSquareWarning, BookOpenCheck, LogOut, Sparkles,
  FileSpreadsheet, BarChart2,
  Users, CalendarDays, ShieldCheck, CreditCard, ClipboardList,
} from 'lucide-react';

// Component imports
import LanguageSelector    from './components/LanguageSelector';
import Dashboard           from './components/Dashboard';
import Gstr2bImport        from './components/Gstr2bImport';
import InvoiceUpload       from './components/InvoiceUpload';
import PurchaseRegister    from './components/PurchaseRegister';
import Reconciliation      from './components/Reconciliation';
import ActionCenter        from './components/ActionCenter';
import EducationHub        from './components/EducationHub';
import LandingPage         from './components/LandingPage';
import LoginPage           from './components/LoginPage';
import ThemeToggle         from './components/ThemeToggle';
import AiChatWindow        from './components/AiChatWindow';
import AnalyticsPanel      from './components/AnalyticsPanel';
import SupplierScorecard   from './components/SupplierScorecard';
import GstCalendar         from './components/GstCalendar';
import HsnValidator        from './components/HsnValidator';
import Billing             from './components/Billing';
import Gstr1View          from './components/Gstr1View';

// Utilities
import { TRANSLATIONS }    from './utils/translations';
import { reconcileRecords } from './utils/reconciliationEngine';
import { checkBackendHealth, getPurchaseRegistry, deletePurchaseRecord } from './utils/api';

/* ─── localStorage helpers ─── */
const LS_GSTR     = 'pca_gstr_records';
const LS_PURCHASE = 'pca_purchase_records';
const LS_LANG     = 'pca_lang';

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Profiles removed as requested

export default function App() {
  const [currentLang,    setCurrentLang]    = useState(() => lsGet(LS_LANG, 'en'));
  const [theme,          setTheme]          = useState(() => localStorage.getItem('theme') || 'dark');
  const [routingState,   setRoutingState]   = useState('landing');
  const [activeTab,      setActiveTab]      = useState('dashboard');
  
  // Dual Login Roles and Client Switcher States
  const [userRole, setUserRole] = useState(() => localStorage.getItem('pca_user_role') || 'user');
  const [currentClient, setCurrentClient] = useState(() => localStorage.getItem('pca_current_client') || 'self');

  const [gstrRecords,    setGstrRecords]    = useState([]);
  const [purchaseRecords,setPurchaseRecords]= useState([]);
  const [reconciledData, setReconciledData] = useState([]);
  const [summary, setSummary] = useState({
    claimableItc: 0, blockedItc: 0, atRiskItc: 0,
    unclaimedItc: 0, totalLoss: 0, reconciliationScore: 100,
  });

  const [backendActive,  setBackendActive]  = useState(false);
  const [backendDetails, setBackendDetails] = useState({ vlmLoaded: false, ollamaActive: false, mode: 'fallback' });
  const [showAiChat,     setShowAiChat]     = useState(false);

  // Client configuration helpers
  const getClientGstin = useCallback((client) => {
    switch (client) {
      case 'self': return '09ABCDE1234F1Z5';
      case 'client1': return '09AAAAC4451M1Z1';
      case 'client2': return '08BCDEF5678G2Z1';
      case 'client3': return '27ABCDE1234F1Z5';
      default: return '09ABCDE1234F1Z5';
    }
  }, []);

  const getGstrKey = useCallback((client) => `pca_gstr_records_${client}`, []);
  const getPurchaseKey = useCallback((client) => `pca_purchase_records_${client}`, []);

  const loadClientData = useCallback(async (client, activeBackend) => {
    const localPurchase = lsGet(getPurchaseKey(client), []);
    const localGstr = lsGet(getGstrKey(client), []);
    
    if (activeBackend) {
      try {
        const dbRecords = await getPurchaseRegistry();
        if (dbRecords && dbRecords.length >= 0) {
          const clientGstin = getClientGstin(client).toUpperCase();
          const mapped = dbRecords
            .filter(r => (r.buyer_gstin || '09AAAAC4451M1Z1').toUpperCase() === clientGstin)
            .map(r => ({
              id: r.id,
              invoiceNumber:  r.document_number,
              invoiceDate:    r.document_date,
              supplierGstin:  r.gstin_of_supplier,
              supplierName:   r.trade_legal_name,
              hsnCode:        r.line_items?.[0]?.hsn_code || '',
              taxableValue:   r.taxable_value,
              gstRate:        r.line_items?.[0]?.gst_rate || '18%',
              cgst:           r.central_tax,
              sgst:           r.state_ut_tax,
              igst:           r.integrated_tax,
              totalAmount:    r.grand_total,
              buyerGstin:     r.buyer_gstin,
              warnings:       r.warnings || [],
              needsReview:    r.needs_review === 1,
            }));
          setPurchaseRecords(mapped);
          setGstrRecords(localGstr);
          return;
        }
      } catch (e) {
        console.error('Failed loading from SQLite:', e);
      }
    }
    
    setPurchaseRecords(localPurchase);
    setGstrRecords(localGstr);
  }, [getPurchaseKey, getGstrKey, getClientGstin]);

  /* ─── persistence side-effects ─── */
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { lsSet(LS_LANG, currentLang); }, [currentLang]);
  
  useEffect(() => {
    if (currentClient) {
      lsSet(getGstrKey(currentClient), gstrRecords);
    }
  }, [gstrRecords, currentClient, getGstrKey]);

  useEffect(() => {
    if (currentClient) {
      lsSet(getPurchaseKey(currentClient), purchaseRecords);
    }
  }, [purchaseRecords, currentClient, getPurchaseKey]);

  /* ─── client change trigger ─── */
  useEffect(() => {
    localStorage.setItem('pca_current_client', currentClient);
    loadClientData(currentClient, backendActive);
  }, [currentClient, backendActive, loadClientData]);

  /* ─── backend init ─── */
  useEffect(() => {
    async function initBackend() {
      const health = await checkBackendHealth();
      if (health.active) {
        setBackendActive(true);
        setBackendDetails(health);
      }
    }
    initBackend();
  }, []);

  /* ─── reconciliation ─── */
  useEffect(() => {
    const results = reconcileRecords(purchaseRecords, gstrRecords);
    setReconciledData(results.reconciled);
    setSummary(results.summary);
  }, [purchaseRecords, gstrRecords]);

  /* ─── handlers ─── */
  const toggleTheme         = useCallback(() => setTheme(p => p === 'light' ? 'dark' : 'light'), []);
  const handleLoadGstr      = useCallback((records) => setGstrRecords(records), []);
  const handleLoadPurchases = useCallback((records) => setPurchaseRecords(records), []);

  const handleAddScannedPurchase = useCallback((scannedInvoice) => {
    setPurchaseRecords(prev => {
      if (prev.some(p => p.invoiceNumber === scannedInvoice.invoiceNumber && p.supplierGstin === scannedInvoice.supplierGstin)) return prev;
      return [...prev, {
        id: scannedInvoice.id || `scanned-${scannedInvoice.invoiceNumber}-${Date.now()}`,
        ...scannedInvoice,
      }];
    });
  }, []);

  const handleDeletePurchaseRecord = useCallback(async (invoiceNumber, supplierGstin, id) => {
    if (backendActive && id && !String(id).startsWith('scanned-') && !String(id).startsWith('manual-')) {
      try { await deletePurchaseRecord(id); }
      catch (err) { alert(err.message || 'Failed to delete from DB'); return; }
    }
    setPurchaseRecords(prev => prev.filter(r => !(r.invoiceNumber === invoiceNumber && r.supplierGstin === supplierGstin)));
  }, [backendActive]);

  const t = TRANSLATIONS[currentLang];

  /* ─── nav items ─── */
  const NAV = [
    { id: 'dashboard',       icon: <LayoutDashboard size={18} />,     label: t.tabDashboard },
    { id: 'import',          icon: <Upload size={18} />,              label: t.tabImport },
    { id: 'upload',          icon: <ScanLine size={18} />,            label: t.tabUpload },
    { id: 'purchaseRegister',icon: <FileSpreadsheet size={18} />,     label: t.tabPurchaseRegister },
    { id: 'gstr1',           icon: <ClipboardList size={18} />,      label: 'GSTR-1' },
    { id: 'reconciliation',  icon: <CheckSquare size={18} />,         label: t.tabReconciliation },
    { id: 'analytics',       icon: <BarChart2 size={18} />,           label: t.tabAnalytics || 'Analytics' },
    { id: 'suppliers',       icon: <Users size={18} />,               label: t.tabSuppliers || 'Suppliers' },
    { id: 'calendar',        icon: <CalendarDays size={18} />,        label: t.tabCalendar || 'Calendar' },
    { id: 'hsnCheck',        icon: <ShieldCheck size={18} />,         label: t.tabHsnCheck || 'HSN Check' },
    { id: 'actions',         icon: <MessageSquareWarning size={18} />, label: t.tabActions },
    { id: 'billing',         icon: <CreditCard size={18} />,          label: t.tabBilling || 'Billing' },
    { id: 'help',            icon: <BookOpenCheck size={18} />,       label: t.tabHelp },
  ];

  /* ─── routing ─── */
  if (routingState === 'landing')
    return <LandingPage currentLang={currentLang} onChangeLang={setCurrentLang} onNavigateToLogin={() => setRoutingState('login')} theme={theme} onToggleTheme={toggleTheme} />;

  if (routingState === 'login')
    return (
      <LoginPage
        currentLang={currentLang}
        onChangeLang={setCurrentLang}
        onLoginSuccess={(role) => {
          setUserRole(role);
          localStorage.setItem('pca_user_role', role);
          if (role === 'user') {
            setCurrentClient('self');
          } else {
            setCurrentClient('client1');
          }
          setRoutingState('app');
        }}
        onNavigateToLanding={() => setRoutingState('landing')}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );

  return (
    <div className="app-shell">

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div>
          {/* Logo */}
          <div className="sidebar-logo">
            <div className="logo-icon">P</div>
            <div className="logo-text">
              <h2>{t.appTitle}</h2>
              <p>MSME GST Core</p>
            </div>
          </div>

          {/* Client Switcher Dropdown (only visible when userRole === 'accountant') */}
          {userRole === 'accountant' && (
            <div className="client-switcher-sidebar-container">
              <label htmlFor="client-select" className="client-select-label">
                {t.clientSelectorLabel || "Active Client:"}
              </label>
              <div className="client-select-wrapper">
                <select
                  id="client-select"
                  value={currentClient}
                  onChange={(e) => setCurrentClient(e.target.value)}
                  className="client-select-dropdown"
                >
                  <option value="client1">{t.client1 || "Verma Grocery Store"}</option>
                  <option value="client2">{t.client2 || "Sharma Electronics"}</option>
                  <option value="client3">{t.client3 || "Maharashtra Distributors"}</option>
                  <option value="self">{t.clientSelf || "Self Account (Verma Dairy)"}</option>
                </select>
              </div>
            </div>
          )}

          {/* Nav */}
          <nav>
            <ul className="nav-links">
              {NAV.map(item => (
                <li key={item.id}>
                  <button
                    className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(item.id)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="sidebar-footer">
          <button className="nav-btn logout-btn" onClick={() => setRoutingState('landing')}>
            <LogOut size={18} /><span>{t.loginHeaderLogout}</span>
          </button>
          <div className="flex-center-inline text-dim text-small">
            <div className="mr-8" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: backendActive ? 'var(--green)' : 'var(--yellow)', boxShadow: backendActive ? '0 0 8px var(--green)' : 'none' }} />
            <span>{backendActive ? `API (${backendDetails.vlmLoaded ? 'VLM' : 'Sandbox'})` : 'Secure Sandbox'}</span>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main-content">
        <header className="page-header">
          <div>
            <h1>{t.appTitle}</h1>
            <p className="text-secondary text-small">{t.appSubtitle}</p>
          </div>
          <div className="header-actions-group">
            <ThemeToggle theme={theme} onToggleTheme={toggleTheme} />
            <LanguageSelector currentLang={currentLang} onChangeLang={setCurrentLang} />
            <button className="btn-secondary logout-header-btn" onClick={() => setRoutingState('landing')} title={t.loginHeaderLogout}>
              <LogOut size={16} /><span className="logout-header-text">{t.loginHeaderLogout}</span>
            </button>
          </div>
        </header>

        <div className="tab-content-body">
          {activeTab === 'dashboard' && (
            <Dashboard summary={summary} reconciledData={reconciledData} currentLang={currentLang} changeTab={setActiveTab} />
          )}
          {activeTab === 'import' && (
            <Gstr2bImport gstrRecords={gstrRecords} purchaseRecords={purchaseRecords} onLoadGstr={handleLoadGstr} onLoadPurchases={handleLoadPurchases} currentLang={currentLang} backendActive={backendActive} />
          )}
          {activeTab === 'upload' && (
            <InvoiceUpload currentLang={currentLang} onAddScannedPurchase={handleAddScannedPurchase} backendActive={backendActive} activeClientGstin={getClientGstin(currentClient)} />
          )}
          {activeTab === 'purchaseRegister' && (
            <PurchaseRegister purchaseRecords={purchaseRecords} reconciledData={reconciledData} currentLang={currentLang} backendActive={backendActive} onDeleteRecord={handleDeletePurchaseRecord} />
          )}
          {activeTab === 'gstr1' && (
            <Gstr1View purchaseRecords={purchaseRecords} backendActive={backendActive} />
          )}
          {activeTab === 'reconciliation' && (
            <Reconciliation reconciledData={reconciledData} currentLang={currentLang} changeTab={setActiveTab} />
          )}
          {activeTab === 'analytics' && (
            <AnalyticsPanel reconciledData={reconciledData} summary={summary} purchaseRecords={purchaseRecords} currentLang={currentLang} />
          )}
          {activeTab === 'suppliers' && (
            <SupplierScorecard reconciledData={reconciledData} currentLang={currentLang} />
          )}
          {activeTab === 'calendar' && (
            <GstCalendar currentLang={currentLang} />
          )}
          {activeTab === 'hsnCheck' && (
            <HsnValidator purchaseRecords={purchaseRecords} currentLang={currentLang} />
          )}
          {activeTab === 'actions' && (
            <ActionCenter reconciledData={reconciledData} currentLang={currentLang} />
          )}
          {activeTab === 'billing' && (
            <Billing currentLang={currentLang} actualInvoiceCount={purchaseRecords.length} />
          )}
          {activeTab === 'help' && (
            <EducationHub currentLang={currentLang} />
          )}
        </div>
      </main>

      {/* Floating AI chat */}
      {!showAiChat && (
        <button className="floating-ai-chat-btn" onClick={() => setShowAiChat(true)} title="Chat with AI Tax Assistant">
          <Sparkles size={22} className="animate-pulse" />
        </button>
      )}
      {showAiChat && (
        <AiChatWindow reconciledData={reconciledData} currentLang={currentLang} onClose={() => setShowAiChat(false)} />
      )}
    </div>
  );
}
