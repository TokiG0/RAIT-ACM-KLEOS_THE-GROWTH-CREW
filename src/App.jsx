import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Upload, 
  ScanLine, 
  CheckSquare, 
  MessageSquareWarning, 
  BookOpenCheck,
  ShieldCheck,
  LogOut,
  Sparkles,
  FileSpreadsheet
} from 'lucide-react';

// Component Imports
import LanguageSelector from './components/LanguageSelector';
import Dashboard from './components/Dashboard';
import Gstr2bImport from './components/Gstr2bImport';
import InvoiceUpload from './components/InvoiceUpload';
import PurchaseRegister from './components/PurchaseRegister';
import Reconciliation from './components/Reconciliation';
import ActionCenter from './components/ActionCenter';
import EducationHub from './components/EducationHub';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import ThemeToggle from './components/ThemeToggle';
import AiChatWindow from './components/AiChatWindow';

// Utility Imports
import { TRANSLATIONS } from './utils/translations';
import { reconcileRecords } from './utils/reconciliationEngine';
import { checkBackendHealth, getPurchaseRegistry, deletePurchaseRecord } from './utils/api';

export default function App() {
  const [currentLang, setCurrentLang] = useState('en');
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });
  const [routingState, setRoutingState] = useState('landing');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [gstrRecords, setGstrRecords] = useState([]);
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [reconciledData, setReconciledData] = useState([]);
  const [summary, setSummary] = useState({
    claimableItc: 0,
    blockedItc: 0,
    atRiskItc: 0,
    unclaimedItc: 0,
    totalLoss: 0,
    reconciliationScore: 100
  });

  const [backendActive, setBackendActive] = useState(false);
  const [backendDetails, setBackendDetails] = useState({ vlmLoaded: false, ollamaActive: false, mode: 'fallback' });
  const [showAiChat, setShowAiChat] = useState(false);

  // Apply theme to document root element and persist in localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Heartbeat check on python backend API server
  useEffect(() => {
    async function initBackend() {
      const health = await checkBackendHealth();
      if (health.active) {
        setBackendActive(true);
        setBackendDetails(health);
        
        // Fetch saved invoices from SQLite DB and populate purchaseRecords
        try {
          const dbRecords = await getPurchaseRegistry();
          if (dbRecords && dbRecords.length > 0) {
            const mapped = dbRecords.map(r => ({
              id: r.id,
              invoiceNumber: r.document_number,
              invoiceDate: r.document_date,
              supplierGstin: r.gstin_of_supplier,
              supplierName: r.trade_legal_name,
              hsnCode: r.line_items?.[0]?.hsn_code || "",
              taxableValue: r.taxable_value,
              gstRate: r.line_items?.[0]?.gst_rate || "18%",
              cgst: r.central_tax,
              sgst: r.state_ut_tax,
              igst: r.integrated_tax,
              totalAmount: r.grand_total,
              warnings: r.warnings || [],
              needsReview: r.needs_review === 1
            }));
            setPurchaseRecords(mapped);
          }
        } catch (dbErr) {
          console.error("Failed to load records from SQLite database:", dbErr);
        }
      }
    }
    initBackend();
  }, []);

  // Re-run reconciliation whenever inputs change
  useEffect(() => {
    const results = reconcileRecords(purchaseRecords, gstrRecords);
    setReconciledData(results.reconciled);
    setSummary(results.summary);
  }, [purchaseRecords, gstrRecords]);

  // Handler: Toggle Theme
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Handler: Load government records
  const handleLoadGstr = (records) => {
    setGstrRecords(records);
  };

  // Handler: Load local store purchase records
  const handleLoadPurchases = (records) => {
    setPurchaseRecords(records);
  };


  // Handler: Add a single invoice scanned via mock OCR scanner
  const handleAddScannedPurchase = (scannedInvoice) => {
    setPurchaseRecords(prev => {
      // Check if invoice already exists in purchase records to avoid duplication
      const exists = prev.some(p => 
        p.invoiceNumber === scannedInvoice.invoiceNumber && 
        p.supplierGstin === scannedInvoice.supplierGstin
      );
      if (exists) return prev;
      
      const newInvoice = {
        id: scannedInvoice.id || `scanned-${scannedInvoice.invoiceNumber}-${Date.now()}`,
        invoiceNumber: scannedInvoice.invoiceNumber,
        invoiceDate: scannedInvoice.invoiceDate,
        supplierGstin: scannedInvoice.supplierGstin,
        supplierName: scannedInvoice.supplierName,
        hsnCode: scannedInvoice.hsnCode,
        taxableValue: scannedInvoice.taxableValue,
        gstRate: scannedInvoice.gstRate,
        cgst: scannedInvoice.cgst,
        sgst: scannedInvoice.sgst,
        igst: scannedInvoice.igst,
        totalAmount: scannedInvoice.totalAmount
      };
      return [...prev, newInvoice];
    });
  };

  // Handler: Delete a purchase record from backend and local state
  const handleDeletePurchaseRecord = async (invoiceNumber, supplierGstin, id) => {
    if (backendActive && id && !String(id).startsWith('scanned-')) {
      try {
        await deletePurchaseRecord(id);
      } catch (err) {
        console.error("Failed to delete record from SQLite:", err);
        alert(err.message || "Failed to delete record from backend DB");
        return;
      }
    }
    
    // Always filter out locally from the state
    setPurchaseRecords(prev => prev.filter(r => 
      !(r.invoiceNumber === invoiceNumber && r.supplierGstin === supplierGstin)
    ));
  };

  const t = TRANSLATIONS[currentLang];

  // Route: Landing Page
  if (routingState === 'landing') {
    return (
      <LandingPage 
        currentLang={currentLang} 
        onChangeLang={setCurrentLang} 
        onNavigateToLogin={() => setRoutingState('login')} 
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // Route: Login Page
  if (routingState === 'login') {
    return (
      <LoginPage 
        currentLang={currentLang} 
        onChangeLang={setCurrentLang} 
        onLoginSuccess={() => setRoutingState('app')} 
        onNavigateToLanding={() => setRoutingState('landing')} 
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  // Route: Main Dashboard Application
  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-logo">
            <div className="logo-icon">P</div>
            <div className="logo-text">
              <h2>{t.appTitle}</h2>
              <p>MSME GST Core</p>
            </div>
          </div>
          
          <nav>
            <ul className="nav-links">
              <li>
                <button 
                  className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                  onClick={() => setActiveTab('dashboard')}
                >
                  <LayoutDashboard size={18} />
                  <span>{t.tabDashboard}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-btn ${activeTab === 'import' ? 'active' : ''}`}
                  onClick={() => setActiveTab('import')}
                >
                  <Upload size={18} />
                  <span>{t.tabImport}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-btn ${activeTab === 'upload' ? 'active' : ''}`}
                  onClick={() => setActiveTab('upload')}
                >
                  <ScanLine size={18} />
                  <span>{t.tabUpload}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-btn ${activeTab === 'purchaseRegister' ? 'active' : ''}`}
                  onClick={() => setActiveTab('purchaseRegister')}
                >
                  <FileSpreadsheet size={18} />
                  <span>{t.tabPurchaseRegister}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-btn ${activeTab === 'reconciliation' ? 'active' : ''}`}
                  onClick={() => setActiveTab('reconciliation')}
                >
                  <CheckSquare size={18} />
                  <span>{t.tabReconciliation}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-btn ${activeTab === 'actions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('actions')}
                >
                  <MessageSquareWarning size={18} />
                  <span>{t.tabActions}</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-btn ${activeTab === 'help' ? 'active' : ''}`}
                  onClick={() => setActiveTab('help')}
                >
                  <BookOpenCheck size={18} />
                  <span>{t.tabHelp}</span>
                </button>
              </li>
            </ul>
          </nav>
        </div>

        <div className="sidebar-footer">
          <button 
            className="nav-btn logout-btn"
            onClick={() => setRoutingState('landing')}
          >
            <LogOut size={18} />
            <span>{t.loginHeaderLogout}</span>
          </button>
          
          <div className="flex-center-inline text-dim text-small">
            <div className="mr-8" style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: backendActive ? 'var(--green)' : 'var(--yellow)',
              boxShadow: backendActive ? '0 0 8px var(--green)' : 'none'
            }}></div>
            <span>{backendActive ? `API Connected (${backendDetails.vlmLoaded ? 'VLM' : 'Sandbox'})` : 'Secure Sandbox'}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        {/* Page Topbar */}
        <header className="page-header">
          <div>
            <h1>{t.appTitle}</h1>
            <p className="text-secondary text-small">{t.appSubtitle}</p>
          </div>
          
          <div className="header-actions-group">
            <ThemeToggle theme={theme} onToggleTheme={toggleTheme} />
            <LanguageSelector 
              currentLang={currentLang} 
              onChangeLang={setCurrentLang} 
            />
            <button 
              className="btn-secondary logout-header-btn"
              onClick={() => setRoutingState('landing')}
              title={t.loginHeaderLogout}
            >
              <LogOut size={16} />
              <span className="logout-header-text">{t.loginHeaderLogout}</span>
            </button>
          </div>
        </header>

        {/* Dynamic Tab Body */}
        <div className="tab-content-body">
          {activeTab === 'dashboard' && (
            <Dashboard 
              summary={summary} 
              currentLang={currentLang} 
              changeTab={setActiveTab}
            />
          )}

          {activeTab === 'import' && (
            <Gstr2bImport 
              gstrRecords={gstrRecords}
              purchaseRecords={purchaseRecords}
              onLoadGstr={handleLoadGstr}
              onLoadPurchases={handleLoadPurchases}
              currentLang={currentLang}
              backendActive={backendActive}
            />
          )}

          {activeTab === 'upload' && (
            <InvoiceUpload 
              currentLang={currentLang}
              onAddScannedPurchase={handleAddScannedPurchase}
              backendActive={backendActive}
            />
          )}

          {activeTab === 'purchaseRegister' && (
            <PurchaseRegister 
              purchaseRecords={purchaseRecords}
              reconciledData={reconciledData}
              currentLang={currentLang}
              backendActive={backendActive}
              onDeleteRecord={handleDeletePurchaseRecord}
            />
          )}

          {activeTab === 'reconciliation' && (
            <Reconciliation 
              reconciledData={reconciledData}
              currentLang={currentLang}
              changeTab={setActiveTab}
            />
          )}

          {activeTab === 'actions' && (
            <ActionCenter 
              reconciledData={reconciledData}
              currentLang={currentLang}
            />
          )}

          {activeTab === 'help' && (
            <EducationHub 
              currentLang={currentLang}
            />
          )}
        </div>
      </main>

      {/* Floating AI chat bubble trigger and window overlay */}
      {!showAiChat && (
        <button 
          className="floating-ai-chat-btn" 
          onClick={() => setShowAiChat(true)}
          title="Chat with AI Tax Assistant"
        >
          <Sparkles size={22} className="animate-pulse" />
        </button>
      )}

      {showAiChat && (
        <AiChatWindow 
          reconciledData={reconciledData}
          currentLang={currentLang}
          onClose={() => setShowAiChat(false)}
        />
      )}
    </div>
  );
}
