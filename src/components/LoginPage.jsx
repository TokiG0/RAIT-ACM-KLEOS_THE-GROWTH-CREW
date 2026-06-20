import React, { useState, useRef, useEffect } from 'react';
import { 
  Smartphone, 
  ArrowLeft, 
  Lock, 
  CheckCircle2, 
  X, 
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import LanguageSelector from './LanguageSelector';
import ThemeToggle from './ThemeToggle';

export default function LoginPage({ currentLang, onChangeLang, onLoginSuccess, onNavigateToLanding, theme, onToggleTheme }) {
  const t = TRANSLATIONS[currentLang];
  
  const [role, setRole] = useState('user'); // 'user' or 'accountant'
  const [mobileNumber, setMobileNumber] = useState('');
  const [step, setStep] = useState(1); // 1 = Phone Number, 2 = OTP Code
  const [otpVal, setOtpVal] = useState(['', '', '', '']);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSmsBanner, setShowSmsBanner] = useState(false);
  const [smsTriggered, setSmsTriggered] = useState(false);

  const otpRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Reset errors and fields when switching states or roles
  useEffect(() => {
    setMobileNumber('');
    setStep(1);
    setOtpVal(['', '', '', '']);
    setErrorMsg('');
    setShowSmsBanner(false);
  }, [role]);

  useEffect(() => {
    setErrorMsg('');
  }, [step, mobileNumber]);

  // Handle phone validation & OTP send
  const handleSendOtp = (e) => {
    e.preventDefault();
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    if (cleanMobile.length !== 10) {
      setErrorMsg(t.loginErrorMobile);
      return;
    }

    // Advance to OTP step and trigger simulated SMS
    setStep(2);
    setSmsTriggered(true);
    
    // Simulate delay for SMS slide-in banner
    setTimeout(() => {
      setShowSmsBanner(true);
    }, 600);
  };

  // Handle individual OTP input changes
  const handleOtpChange = (index, value) => {
    const cleanVal = value.replace(/\D/g, '');
    if (!cleanVal) {
      const newOtp = [...otpVal];
      newOtp[index] = '';
      setOtpVal(newOtp);
      return;
    }

    const singleDigit = cleanVal.slice(-1);
    const newOtp = [...otpVal];
    newOtp[index] = singleDigit;
    setOtpVal(newOtp);

    // Auto-focus next input box
    if (index < 3 && singleDigit) {
      otpRefs[index + 1].current.focus();
    }
  };

  // Handle backspace navigation in OTP boxes
  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpVal[index] && index > 0) {
      otpRefs[index - 1].current.focus();
    }
  };

  // Handle Paste event for OTP (auto-distributes to input boxes)
  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasteData) {
      const newOtp = [...otpVal];
      for (let i = 0; i < 4; i++) {
        if (pasteData[i]) {
          newOtp[i] = pasteData[i];
        }
      }
      setOtpVal(newOtp);
      
      // Focus the last filled input or the 4th input
      const focusIndex = Math.min(pasteData.length, 3);
      otpRefs[focusIndex].current.focus();
    }
  };

  // Verify OTP submission
  const handleVerifyOtp = (e) => {
    e.preventDefault();
    const enteredOtp = otpVal.join('');
    if (enteredOtp !== '1234') {
      setErrorMsg(t.loginErrorOtp);
      // Highlight boxes in red
      return;
    }

    // Success: Login user
    onLoginSuccess(role);
  };

  // Auto fill helper
  const handleAutoFillOtp = () => {
    setOtpVal(['1', '2', '3', '4']);
    setErrorMsg('');
    setShowSmsBanner(false);
    // Focus last input
    setTimeout(() => {
      if (otpRefs[3].current) otpRefs[3].current.focus();
    }, 100);
  };

  return (
    <div className="login-page">
      {/* Geometric Slanted Color Blocks Background */}
      <div className="landing-bg-decorations">
        <div className="deco-shape deco-orange"></div>
        <div className="deco-shape deco-yellow"></div>
        <div className="deco-shape deco-purple"></div>
      </div>

      {/* Top Navigation */}
      <header className="login-header">
        <button className="back-to-landing-btn" onClick={onNavigateToLanding}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
          <LanguageSelector 
            currentLang={currentLang} 
            onChangeLang={onChangeLang} 
          />
        </div>
      </header>

      {/* Main Login Card */}
      <div className="login-content flex-center">
        <div className="login-card glass-panel">
          <div className="login-card-branding text-center">
            <div className="login-logo-icon">P</div>
            
            {/* Role Select Tabs */}
            <div className="login-role-tabs" style={{
              display: 'flex',
              gap: '6px',
              margin: '16px auto 20px auto',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '4px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              maxWidth: '320px'
            }}>
              <button
                type="button"
                onClick={() => setRole('user')}
                className={`login-role-tab-btn ${role === 'user' ? 'active' : ''}`}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  fontWeight: '600',
                  border: 'none',
                  background: role === 'user' ? 'var(--primary)' : 'transparent',
                  color: role === 'user' ? '#FFFFFF' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {t.loginRoleUser}
              </button>
              <button
                type="button"
                onClick={() => setRole('accountant')}
                className={`login-role-tab-btn ${role === 'accountant' ? 'active' : ''}`}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  fontWeight: '600',
                  border: 'none',
                  background: role === 'accountant' ? 'var(--primary)' : 'transparent',
                  color: role === 'accountant' ? '#FFFFFF' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {t.loginRoleAccountant}
              </button>
            </div>

            <h2>{role === 'user' ? (t.loginCardUserTitle || t.loginCardTitle) : t.loginCardAccountantTitle}</h2>
            <p className="text-secondary" style={{ minHeight: '34px', fontSize: '13px' }}>
              {role === 'user' ? (t.loginCardUserSubtitle || t.loginCardSubtitle) : t.loginCardAccountantSubtitle}
            </p>
          </div>

          {errorMsg && (
            <div className="login-error-alert animate-bounce">
              <span>{errorMsg}</span>
            </div>
          )}

          {step === 1 ? (
            /* Step 1: Mobile Number Entry */
            <form onSubmit={handleSendOtp} className="login-form">
              <div className="form-group">
                <label htmlFor="mobile-input">{t.loginMobileLabel}</label>
                <div className="phone-input-wrapper">
                  <span className="phone-prefix">+91</span>
                  <input
                    id="mobile-input"
                    type="tel"
                    placeholder={t.loginMobilePlaceholder}
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <button type="submit" className="login-submit-btn">
                <span>{t.loginBtnSendOtp}</span>
                <Smartphone size={18} />
              </button>
            </form>
          ) : (
            /* Step 2: OTP Entry */
            <form onSubmit={handleVerifyOtp} className="login-form">
              <div className="form-group">
                <div className="flex-between">
                  <label>{t.loginOtpLabel}</label>
                  <button 
                    type="button" 
                    className="edit-phone-btn" 
                    onClick={() => { setStep(1); setShowSmsBanner(false); }}
                  >
                    Change Client Number (+91 {mobileNumber})
                  </button>
                </div>

                <div className="otp-inputs-row" onPaste={handleOtpPaste}>
                  {otpVal.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={otpRefs[idx]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      className="otp-pin-box"
                      autoFocus={idx === 0}
                      required
                    />
                  ))}
                </div>
              </div>

              <button type="submit" className="login-submit-btn btn-success">
                <span>{t.loginBtnVerify}</span>
                <CheckCircle2 size={18} />
              </button>
            </form>
          )}

          <div className="login-privacy-badge text-center">
            <Lock size={12} className="text-green mr-4" />
            <span className="text-dim text-small">Secure OTP Verification</span>
          </div>
        </div>
      </div>

      {/* Simulated SMS Notification Banner */}
      <div className={`sms-notification-banner glass-panel ${showSmsBanner ? 'show' : ''}`}>
        <div className="sms-banner-header">
          <div className="sms-banner-brand">
            <MessageSquare size={16} className="text-primary-dim mr-8" />
            <span className="sms-app-name">{t.loginSmsTitle}</span>
          </div>
          <button className="sms-close-btn" onClick={() => setShowSmsBanner(false)}>
            <X size={14} />
          </button>
        </div>
        <div className="sms-banner-body">
          <p>{t.loginSmsBody}</p>
          <button className="sms-autofill-btn" onClick={handleAutoFillOtp}>
            <Sparkles size={12} className="mr-4 text-yellow" />
            <span>Auto-fill Code 1234</span>
          </button>
        </div>
      </div>
    </div>
  );
}
