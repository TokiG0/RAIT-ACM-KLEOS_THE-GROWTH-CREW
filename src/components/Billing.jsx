import React, { useState, useMemo } from 'react';
import { CreditCard, Calculator, Check, ArrowRight, ShieldCheck, HelpCircle, AlertCircle, X, Sparkles } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';

export default function Billing({ currentLang, actualInvoiceCount = 0 }) {
  const t = TRANSLATIONS[currentLang];
  
  // Interactive Slider State
  const [sliderInvoices, setSliderInvoices] = useState(50);
  const [checkoutPlan, setCheckoutPlan] = useState(null); // plan object to checkout
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  
  // Payment Form States
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [formError, setFormError] = useState('');

  // Plan Tiers Definition
  const PLANS = useMemo(() => [
    {
      id: 'starter',
      name: t.planStarter,
      range: '1 - 20',
      price: 500,
      period: 'month',
      desc: currentLang === 'hi' ? 'छोटे व्यवसायों और स्वतंत्र पेशेवरों के लिए।' : currentLang === 'hing' ? 'Chhote businesses aur freelancers ke liye.' : 'For micro-businesses and independent retailers.',
      features: [
        'Up to 20 invoices / month',
        'Offline AI Sandbox OCR',
        'Standard GST Reconciler',
        'Email Support'
      ],
      hsnCheck: true,
      min: 1,
      max: 20
    },
    {
      id: 'growth',
      name: t.planGrowth,
      range: '21 - 100',
      price: 750,
      period: 'month',
      desc: currentLang === 'hi' ? 'बढ़ते आउटलेट्स और किराना स्टोर के लिए।' : currentLang === 'hing' ? 'Badhte outlets aur kirana stores ke liye.' : 'For growing retailers and local grocery shops.',
      features: [
        'Up to 100 invoices / month',
        'Qwen2.5-VL Neural OCR',
        'Fuzzy Number Matcher',
        'WhatsApp Supplier Alert',
        'Priority CA Hub Access'
      ],
      hsnCheck: true,
      min: 21,
      max: 100,
      popular: true
    },
    {
      id: 'business',
      name: t.planBusiness,
      range: '101 - 500',
      price: 1500,
      period: 'month',
      desc: currentLang === 'hi' ? 'मध्यम आकार के व्यवसायों और डीलरों के लिए।' : currentLang === 'hing' ? 'Medium businesses aur distributors ke liye.' : 'For medium distribution hubs and wholesale dealers.',
      features: [
        'Up to 500 invoices / month',
        'Multi-user Accountant Mode',
        'Section 17(5) Audit Engine',
        'Supplier Compliance Scorecard',
        'WhatsApp Automation integration',
        '24/7 Priority Support'
      ],
      hsnCheck: true,
      min: 101,
      max: 500
    },
    {
      id: 'enterprise',
      name: t.planEnterprise,
      range: '501 - 1000',
      price: 2500,
      period: 'month',
      desc: currentLang === 'hi' ? 'बड़े वितरकों और सीए फर्मों के लिए।' : currentLang === 'hing' ? 'Bade distributors aur CA firms ke liye.' : 'For large-scale suppliers and busy CA offices.',
      features: [
        'Up to 1,000 invoices / month',
        'Full Analytics Dashboard',
        'All Core & Premium features',
        'Dedicated Account Specialist',
        'API Export Access'
      ],
      hsnCheck: true,
      min: 501,
      max: 1000
    },
    {
      id: 'custom',
      name: t.planCustom,
      range: '1000+',
      price: 2000,
      period: '1,000 invoices lot',
      desc: currentLang === 'hi' ? 'असीमित वॉल्यूम वाले बड़े उद्यमों के लिए।' : currentLang === 'hing' ? 'Unlimited volume wale enterprises ke liye.' : 'For high-volume enterprises with custom lot billing.',
      features: [
        '₹2,000 per 1,000 invoices',
        'Scale as you grow',
        'Unlimited parallel workers',
        'Custom SLA support',
        'Dedicated Database cluster'
      ],
      hsnCheck: true,
      min: 1001,
      max: Infinity
    }
  ], [t, currentLang]);

  // Pricing calculator helper
  const calculateCost = (invoices) => {
    if (invoices <= 20) return { price: 500, tier: 'starter', name: t.planStarter };
    if (invoices <= 100) return { price: 750, tier: 'growth', name: t.planGrowth };
    if (invoices <= 500) return { price: 1500, tier: 'business', name: t.planBusiness };
    if (invoices <= 1000) return { price: 2500, tier: 'enterprise', name: t.planEnterprise };
    
    // 1000+ is ₹2000 per thousand lot
    const lots = Math.ceil(invoices / 1000);
    return { price: lots * 2000, tier: 'custom', name: t.planCustom + ` (${lots} lot${lots > 1 ? 's' : ''})` };
  };

  const currentEst = useMemo(() => calculateCost(sliderInvoices), [sliderInvoices, t]);
  const usageEst = useMemo(() => calculateCost(actualInvoiceCount), [actualInvoiceCount, t]);

  // Select active plan matching slider
  const activePlanId = currentEst.tier;

  const handleOpenCheckout = (plan) => {
    // If custom plan, calculate price based on slider invoices
    let price = plan.price;
    if (plan.id === 'custom') {
      price = calculateCost(sliderInvoices).price;
    }
    setCheckoutPlan({ ...plan, calculatedPrice: price });
    setCardNumber('');
    setCardExpiry('');
    setCardCvv('');
    setCardName('');
    setFormError('');
    setPaymentSuccess(false);
    setCheckoutModalOpen(true);
  };

  const handleProcessPayment = (e) => {
    e.preventDefault();
    if (!cardNumber || !cardExpiry || !cardCvv || !cardName) {
      setFormError('Please fill in all checkout fields.');
      return;
    }
    if (cardNumber.replace(/\s/g, '').length < 16) {
      setFormError('Please enter a valid 16-digit card number.');
      return;
    }
    setFormError('');
    setPaymentLoading(true);

    // Simulate payment call
    setTimeout(() => {
      setPaymentLoading(false);
      setPaymentSuccess(true);
    }, 2000);
  };

  return (
    <div className="billing-section-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.5s ease-out' }}>
      
      {/* Title & Subtitle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h2 className="gradient-text" style={{ fontSize: '24px', fontWeight: '700', margin: '0' }}>{t.billingTitle}</h2>
        <p className="text-secondary" style={{ fontSize: '14px', margin: '0', maxWidth: '750px' }}>{t.billingSubtitle}</p>
      </div>

      {/* Grid: Actual Usage Tracker & Calculator Slider */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Actual Usage Card */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'between', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute',
            width: '100px',
            height: '100px',
            background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
            bottom: '-20px',
            right: '-20px',
            opacity: 0.3,
            pointerEvents: 'none'
          }}></div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'var(--primary-glow)', color: 'var(--primary-dim)' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 style={{ margin: '0', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>{t.billingActualUsage}</h3>
              <p className="text-secondary" style={{ margin: '0', fontSize: '12px' }}>Usage synced from local workspace</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--primary-dim)', display: 'block' }}>{actualInvoiceCount}</span>
              <span className="text-secondary" style={{ fontSize: '12px' }}>
                {t.billingActualUsageDesc.replace('{count}', actualInvoiceCount)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', paddingTop: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{t.billingActualPlan}</span>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{usageEst.name}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', borderBottom: '1px dashed var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Cost for this cycle:</span>
              <span style={{ fontWeight: '700', color: 'var(--green)', fontSize: '15px' }}>₹{usageEst.price}</span>
            </div>
          </div>

          <button 
            type="button" 
            className="btn-primary w-100 flex-center"
            style={{ marginTop: '16px', gap: '8px' }}
            onClick={() => {
              const matchedPlan = PLANS.find(p => p.id === usageEst.tier) || PLANS[PLANS.length - 1];
              handleOpenCheckout(matchedPlan);
            }}
          >
            <span>Subscribe to Usage Plan</span>
            <ArrowRight size={16} />
          </button>
        </div>

        {/* Cost Estimator Calculator */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'between' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'var(--primary-glow)', color: 'var(--primary-dim)' }}>
              <Calculator size={24} />
            </div>
            <div>
              <h3 style={{ margin: '0', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>{t.billingCalculator}</h3>
              <p className="text-secondary" style={{ margin: '0', fontSize: '12px' }}>Estimate subscription billing interactively</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexGrow: 1 }}>
            
            {/* Input & Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="text-secondary" style={{ fontSize: '13px' }}>{t.billingInvoicesLabel}</span>
                <input 
                  type="number"
                  value={sliderInvoices}
                  onChange={(e) => setSliderInvoices(Math.max(1, parseInt(e.target.value) || 0))}
                  style={{
                    width: '90px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    textAlign: 'right',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}
                />
              </div>

              <input 
                type="range"
                min="1"
                max="2000"
                value={sliderInvoices > 2000 ? 2000 : sliderInvoices}
                onChange={(e) => setSliderInvoices(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--primary)',
                  height: '6px',
                  borderRadius: '3px',
                  background: 'rgba(255,255,255,0.1)',
                  cursor: 'pointer'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span>1 Invoice</span>
                <span>500</span>
                <span>1000</span>
                <span>2000+ Invoices</span>
              </div>
            </div>

            {/* Live Pricing Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(var(--primary-rgb), 0.02)', border: '1px solid var(--primary-glow)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span className="text-secondary">Selected Tier:</span>
                <span style={{ fontWeight: '600', color: 'var(--primary-dim)' }}>{currentEst.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-secondary" style={{ fontSize: '13px' }}>{t.billingEstimatedCost}</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '22px', fontWeight: '800', color: 'var(--green)' }}>₹{currentEst.price}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '4px' }}>/mo</span>
                </div>
              </div>
            </div>

          </div>

          <button 
            type="button" 
            className="btn-secondary w-100 flex-center"
            style={{ marginTop: '16px', gap: '8px' }}
            onClick={() => {
              const matchedPlan = PLANS.find(p => p.id === currentEst.tier) || PLANS[PLANS.length - 1];
              handleOpenCheckout(matchedPlan);
            }}
          >
            <CreditCard size={16} />
            <span>{t.billingSubscribeBtn}</span>
          </button>
        </div>

      </div>

      {/* Plan Card Grid */}
      <h3 style={{ margin: '12px 0 0 0', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>Available Subscription Tiers</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: '16px'
      }}>
        {PLANS.map((plan) => {
          const isHighlighted = activePlanId === plan.id;
          
          return (
            <div 
              key={plan.id} 
              className={`glass-panel plan-card ${isHighlighted ? 'active-plan' : ''}`}
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 'var(--radius-sm)',
                border: isHighlighted ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                boxShadow: isHighlighted ? '0 0 20px rgba(var(--primary-rgb), 0.15)' : 'none',
                transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
                transition: 'all 0.3s ease',
                position: 'relative',
                background: isHighlighted ? 'linear-gradient(180deg, rgba(var(--primary-rgb), 0.05) 0%, rgba(0,0,0,0.1) 100%)' : 'var(--glass-bg)'
              }}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--primary-dim)',
                  color: '#FFFFFF',
                  padding: '2px 10px',
                  borderRadius: '20px',
                  fontSize: '10px',
                  fontWeight: '700',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                }}>
                  Popular
                </div>
              )}

              {/* Header */}
              <div style={{ marginBottom: '16px' }}>
                <span className="text-secondary" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>
                  {plan.range} invoices
                </span>
                <h4 style={{ margin: '4px 0 8px 0', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>{plan.name}</h4>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-primary)' }}>₹{plan.price}</span>
                  <span className="text-secondary" style={{ fontSize: '12px', marginLeft: '4px' }}>/ {plan.period}</span>
                </div>
                <p className="text-secondary" style={{ fontSize: '11px', margin: '8px 0 0 0', minHeight: '34px', lineHeight: '1.4' }}>{plan.desc}</p>
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '0 0 16px 0' }}></div>

              {/* Features List */}
              <ul style={{ padding: '0', margin: '0 0 20px 0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                {plan.features.map((feature, i) => (
                  <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', alignItems: 'center' }}>
                    <Check size={14} style={{ color: 'var(--primary-dim)', flexShrink: 0 }} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Action Button */}
              <button 
                type="button" 
                className={`w-100 btn-small ${isHighlighted ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}
                onClick={() => handleOpenCheckout(plan)}
              >
                {isHighlighted ? 'Select & Subscribe' : 'Choose Plan'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Checkout Simulator Modal */}
      {checkoutModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            position: 'relative',
            boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-color)',
            animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            
            {/* Close button */}
            <button 
              type="button" 
              onClick={() => setCheckoutModalOpen(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            {!paymentSuccess ? (
              <form onSubmit={handleProcessPayment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                  <CreditCard size={22} className="text-primary-dim" />
                  <div>
                    <h3 style={{ margin: '0', fontSize: '16px', fontWeight: '700' }}>Confirm Subscription</h3>
                    <p style={{ margin: '0', fontSize: '11px', color: 'var(--text-secondary)' }}>Secure Sandboxed Payment Gateway</p>
                  </div>
                </div>

                {/* Plan Cost details */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ fontWeight: '500' }}>{checkoutPlan?.name}</span>
                    <span style={{ fontWeight: '700', color: 'var(--green)' }}>₹{checkoutPlan?.calculatedPrice}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Charges recursively every month. Cancel anytime.</span>
                </div>

                {formError && (
                  <div className="alert alert-red p-8 text-small flex-center-inline gap-8" style={{ fontSize: '12px' }}>
                    <AlertCircle size={14} />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Card Fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label className="text-secondary text-small" style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>Cardholder Name</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. RAKESH VERMA"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value.toUpperCase())}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-secondary text-small" style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>Card Number</label>
                    <input 
                      type="text"
                      required
                      maxLength="19"
                      placeholder="1234 5678 1234 5678"
                      value={cardNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        const match = val.match(/.{1,4}/g);
                        setCardNumber(match ? match.join(' ') : val);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        fontFamily: 'monospace'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="text-secondary text-small" style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>Expiry Date</label>
                      <input 
                        type="text"
                        required
                        maxLength="5"
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val.length >= 3) {
                            setCardExpiry(val.slice(0,2) + '/' + val.slice(2,4));
                          } else {
                            setCardExpiry(val);
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          textAlign: 'center'
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-secondary text-small" style={{ display: 'block', marginBottom: '4px', fontSize: '11px' }}>CVV</label>
                      <input 
                        type="password"
                        required
                        maxLength="3"
                        placeholder="***"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          textAlign: 'center'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={paymentLoading}
                  className="btn-primary w-100 flex-center"
                  style={{ gap: '8px', padding: '10px' }}
                >
                  {paymentLoading ? (
                    <span>Processing Subscription...</span>
                  ) : (
                    <>
                      <ShieldCheck size={18} />
                      <span>Pay ₹{checkoutPlan?.calculatedPrice} & Subscribe</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', textAlign: 'center', gap: '16px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--green-glow)',
                  border: '2px solid var(--green)',
                  color: 'var(--green)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'bounce 1s infinite'
                }}>
                  <Check size={36} />
                </div>

                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>{t.billingSuccessMsg}</h3>
                  <p style={{ margin: '0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Your subscription to <strong style={{ color: 'var(--primary-dim)' }}>{checkoutPlan?.name}</strong> is now fully active!
                  </p>
                </div>

                <div style={{
                  borderTop: '1px dashed var(--border-color)',
                  width: '100%',
                  paddingTop: '12px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div>Status: <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>ACTIVE</span></div>
                  <div>Next renewal: 20-Jul-2026</div>
                </div>

                <button 
                  type="button" 
                  className="btn-primary w-100"
                  onClick={() => setCheckoutModalOpen(false)}
                >
                  Back to Dashboard
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
