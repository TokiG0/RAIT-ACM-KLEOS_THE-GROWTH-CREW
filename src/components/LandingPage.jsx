import React from 'react';
import { 
  ShieldCheck, 
  Zap, 
  MessageSquare, 
  Quote, 
  Star, 
  Lock, 
  ArrowRight,
  Sparkles,
  HeartHandshake
} from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';
import LanguageSelector from './LanguageSelector';
import ThemeToggle from './ThemeToggle';

export default function LandingPage({ currentLang, onChangeLang, onNavigateToLogin, theme, onToggleTheme }) {
  const t = TRANSLATIONS[currentLang];

  return (
    <div className="landing-page">
      {/* Geometric Slanted Color Blocks Background */}
      <div className="landing-bg-decorations">
        <div className="deco-shape deco-orange"></div>
        <div className="deco-shape deco-yellow"></div>
        <div className="deco-shape deco-purple"></div>
      </div>

      {/* Top Navbar */}
      <header className="landing-header">
        <div className="landing-brand">
          <div className="landing-logo-icon">P</div>
          <div className="landing-logo-text">
            <h2>{t.appTitle}</h2>
            <p>MSME GST Core</p>
          </div>
        </div>
        <div className="landing-header-actions">
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
          <LanguageSelector 
            currentLang={currentLang} 
            onChangeLang={onChangeLang} 
          />
          <button className="landing-login-btn" onClick={onNavigateToLogin}>
            {t.landingCTALogin}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="hero-badge">
          <Sparkles size={14} className="text-yellow mr-8" />
          <span>100% Free & Offline Sandbox Tool</span>
        </div>
        <h1 className="hero-title gradient-text">
          {t.landingHeroTitle}
        </h1>
        <p className="hero-subtitle">
          {t.landingHeroSubtitle}
        </p>
        <div className="hero-cta-container">
          <button className="landing-cta-btn btn-glow" onClick={onNavigateToLogin}>
            <span>{t.landingCTAStart}</span>
            <ArrowRight size={18} />
          </button>
        </div>

        {/* Dashboard Mockup Preview */}
        <div className="landing-mockup glass-panel">
          <div className="mockup-header">
            <div className="mockup-dots">
              <span className="dot-red"></span>
              <span className="dot-yellow"></span>
              <span className="dot-green"></span>
            </div>
            <div className="mockup-title">PocketCA GST Dashboard</div>
          </div>
          <div className="mockup-body">
            <div className="mockup-grid">
              <div className="mockup-kpi glass-panel border-green">
                <span className="mockup-kpi-label">Ready to Claim</span>
                <span className="mockup-kpi-value text-green">₹42,800</span>
              </div>
              <div className="mockup-kpi glass-panel border-yellow">
                <span className="mockup-kpi-label">Blocked ITC</span>
                <span className="mockup-kpi-value text-yellow">₹4,800</span>
              </div>
              <div className="mockup-kpi glass-panel border-red">
                <span className="mockup-kpi-label">At Risk</span>
                <span className="mockup-kpi-value text-red">₹3,200</span>
              </div>
            </div>
            <div className="mockup-chart glass-panel">
              <div className="mockup-bar green-bar" style={{ width: '80%' }}></div>
              <div className="mockup-bar yellow-bar" style={{ width: '12%' }}></div>
              <div className="mockup-bar red-bar" style={{ width: '8%' }}></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="landing-features">
        <h2 className="section-title">{t.landingFeatureTitle}</h2>
        <div className="features-grid">
          {/* Feature 1: Offline Security */}
          <div className="feature-card glass-panel">
            <div className="feature-icon-wrapper bg-green-glow">
              <ShieldCheck size={24} className="text-green" />
            </div>
            <h3>{t.landingFeature1Title}</h3>
            <p>{t.landingFeature1Desc}</p>
          </div>

          {/* Feature 2: Fuzzy Matching */}
          <div className="feature-card glass-panel">
            <div className="feature-icon-wrapper bg-primary-glow">
              <Zap size={24} className="text-primary-dim" />
            </div>
            <h3>{t.landingFeature2Title}</h3>
            <p>{t.landingFeature2Desc}</p>
          </div>

          {/* Feature 3: WhatsApp Outreach */}
          <div className="feature-card glass-panel">
            <div className="feature-icon-wrapper bg-yellow-glow">
              <MessageSquare size={24} className="text-yellow" />
            </div>
            <h3>{t.landingFeature3Title}</h3>
            <p>{t.landingFeature3Desc}</p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="landing-reviews">
        <h2 className="section-title">{t.landingReviewTitle}</h2>
        <div className="reviews-grid">
          {/* Review 1 */}
          <div className="review-card glass-panel">
            <div className="review-stars">
              <Star size={16} className="fill-yellow text-yellow" />
              <Star size={16} className="fill-yellow text-yellow" />
              <Star size={16} className="fill-yellow text-yellow" />
              <Star size={16} className="fill-yellow text-yellow" />
              <Star size={16} className="fill-yellow text-yellow" />
            </div>
            <div className="review-quote-icon">
              <Quote size={32} className="text-dim" />
            </div>
            <p className="review-text">{t.landingReview1Text}</p>
            <h4 className="review-author">{t.landingReview1Author}</h4>
          </div>

          {/* Review 2 */}
          <div className="review-card glass-panel">
            <div className="review-stars">
              <Star size={16} className="fill-yellow text-yellow" />
              <Star size={16} className="fill-yellow text-yellow" />
              <Star size={16} className="fill-yellow text-yellow" />
              <Star size={16} className="fill-yellow text-yellow" />
              <Star size={16} className="fill-yellow text-yellow" />
            </div>
            <div className="review-quote-icon">
              <Quote size={32} className="text-dim" />
            </div>
            <p className="review-text">{t.landingReview2Text}</p>
            <h4 className="review-author">{t.landingReview2Author}</h4>
          </div>
        </div>
      </section>

      {/* Pricing / Secure Seal Section */}
      <section className="landing-pricing glass-panel">
        <div className="pricing-content">
          <h2 className="pricing-title">{t.landingPricingTitle}</h2>
          <p className="pricing-desc">{t.landingPricingDesc}</p>
          <div className="pricing-badge-container">
            <div className="pricing-badge">
              <Lock size={16} className="mr-8 text-green" />
              <span>100% Private Sandbox</span>
            </div>
            <div className="pricing-badge">
              <HeartHandshake size={16} className="mr-8 text-green" />
              <span>No Hidden Charges</span>
            </div>
          </div>
          <button className="landing-cta-btn" onClick={onNavigateToLogin}>
            <span>{t.landingCTAStart}</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <p>© {new Date().getFullYear()} {t.appTitle}. {t.appSubtitle}. Built for compliant, secure tax savings.</p>
          <div className="footer-secure-tag">
            <Lock size={12} className="mr-4 text-green" />
            <span>Local sandbox environment. No server connections.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
