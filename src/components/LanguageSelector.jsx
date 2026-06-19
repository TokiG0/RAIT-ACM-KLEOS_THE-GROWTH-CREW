import React, { useState, useRef, useEffect } from 'react';
import { Languages } from 'lucide-react';

export default function LanguageSelector({ currentLang, onChangeLang }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const languages = [
    { code: 'en', name: 'English', short: 'EN' },
    { code: 'hi', name: 'हिन्दी', short: 'HI' },
    { code: 'hing', name: 'Hinglish', short: 'HG' },
  ];

  const currentLangObj = languages.find(l => l.code === currentLang) || languages[0];

  // Close selector if user clicks outside of it
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggle = () => {
    setIsOpen(prev => !prev);
  };

  return (
    <div 
      ref={containerRef}
      className={`language-selector-container retracting ${isOpen ? 'is-open' : ''}`}
    >
      {/* Retracted Logo Icon Button */}
      <button 
        type="button" 
        className="language-logo-trigger" 
        onClick={handleToggle}
        title="Change Language"
      >
        <Languages size={18} className="logo-trigger-icon" />
        <span className="logo-trigger-badge">{currentLangObj.short}</span>
      </button>

      {/* Expanded Languages Wrapper */}
      <div className="language-chips-wrapper">
        <div className="language-chips">
          {languages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              className={`language-chip-btn ${currentLang === lang.code ? 'active' : ''}`}
              onClick={() => {
                onChangeLang(lang.code);
                setIsOpen(false); // Close on selection
              }}
            >
              {lang.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
