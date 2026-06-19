import React from 'react';
import { HelpCircle, Shield, ArrowRight, UserCheck } from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';

export default function EducationHub({ currentLang }) {
  const t = TRANSLATIONS[currentLang];

  const faqs = [
    {
      q: t.faqQ1,
      a: t.faqA1,
    },
    {
      q: t.faqQ2,
      a: t.faqA2,
    },
    {
      q: t.faqQ3,
      a: t.faqA3,
    },
    {
      q: t.faqQ4,
      a: t.faqA4,
    }
  ];

  return (
    <div className="education-hub-container">
      <div className="edu-header-panel glass-panel">
        <div className="flex-center-inline mb-8">
          <UserCheck size={24} className="text-primary mr-8" />
          <h3>{t.helpTitle}</h3>
        </div>
        <p className="text-secondary">Learn how to make the most of your Input Tax Credit (ITC) and prevent compliance losses.</p>
      </div>

      <div className="faq-list">
        {faqs.map((faq, index) => (
          <div key={index} className="faq-card glass-panel">
            <div className="faq-question-row">
              <HelpCircle size={18} className="text-primary-dim flex-shrink-0" />
              <h4>{faq.q}</h4>
            </div>
            <div className="faq-answer-row text-secondary">
              <ArrowRight size={14} className="flex-shrink-0 mt-4 text-dim" />
              <p>{faq.a}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Safety & Compliance Badge */}
      <div className="privacy-safety-card glass-panel flex-center">
        <Shield className="text-green mr-16" size={32} />
        <div>
          <h4 className="text-green">Offline & Secure (100% Private)</h4>
          <p className="text-secondary text-small">
            All files (GSTR-2B, CSV, bills) stay on your device. We do not use any servers or cloud uploads. Your business secrets are 100% safe.
          </p>
        </div>
      </div>
    </div>
  );
}
