import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Trash2, HelpCircle, X, Sparkles } from 'lucide-react';
import { sendChatMessage } from '../utils/api';
import { TRANSLATIONS } from '../utils/translations';

export default function AiChatWindow({ reconciledData, currentLang, onClose }) {
  const t = TRANSLATIONS[currentLang];
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [systemSource, setSystemSource] = useState('');
  const messagesEndRef = useRef(null);

  // Suggested questions based on the reconciliation discrepancies
  const SUGGESTIONS = [
    { label: currentLang === 'hi' ? "एचएसएन विसंगति क्या है?" : "Explain HSN Mismatches", text: "What is an HSN mismatch error in GST, and how do I resolve it?" },
    { label: currentLang === 'hi' ? "सप्लायर डिफ़ॉल्ट कैसे ठीक करें?" : "Fix Supplier Defaults", text: "One of my suppliers has not uploaded my invoice in GSTR-2B. How do I get them to upload it?" },
    { label: currentLang === 'hi' ? "इनपुट टैक्स क्रेडिट (ITC) नियम क्या हैं?" : "ITC Claim Rules", text: "What are the core eligibility rules for claiming Input Tax Credit (ITC) under Section 16?" },
    { label: currentLang === 'hi' ? "जीएसटी नंबर गड़बड़ी" : "GSTIN Code Errors", text: "My invoice is showing under the wrong GSTIN (mismatch GSTIN). What is the remedy?" }
  ];

  // Welcome greeting
  useEffect(() => {
    const welcomeText = currentLang === 'hi' 
      ? "नमस्ते! मैं आपका पॉकेटसीए एआई जीएसटी सहायक हूँ। मैं आपके इनवॉइस विसंगतियों और इनपुट टैक्स क्रेडिट के मुद्दों को हल करने में मदद कर सकता हूँ। पूछिए!"
      : currentLang === 'hing'
      ? "Namaste! Main aapka PocketCA AI Tax Assistant hoon. Aapke billing mismatches aur GSTR-2B reconciliation details ko resolve karne me main help kar sakta hoon. Poochhiye!"
      : "Hello! I am your interactive PocketCA AI Assistant. I have analyzed your reconciliation data and can help explain any HSN mismatches, supplier defaults, or compliance rules. How can I help you today?";
    
    setMessages([
      { role: 'assistant', content: welcomeText }
    ]);
  }, [currentLang]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (text) => {
    const messageText = text || inputValue;
    if (!messageText.trim()) return;

    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // Build conversational context from current discrepancies
      const contextSummary = reconciledData.map(item => ({
        invoiceNumber: item.purchase?.invoiceNumber || item.gstr?.invoiceNumber,
        supplierName: item.purchase?.supplierName || item.gstr?.supplierName,
        status: item.status,
        taxDiscrepancy: item.financialImpact,
        explanation: item.explanation
      }));

      // Send to local Llama 3.2 backend
      const response = await sendChatMessage(messageText, messages, contextSummary);
      
      setSystemSource(response.source);
      setMessages(prev => [...prev, { role: 'assistant', content: response.reply }]);
    } catch (err) {
      const errMsg = currentLang === 'hi'
        ? "माफ़ कीजिये, सर्वर से जुड़ने में समस्या आ रही है। कृपया सुनिश्चित करें कि बैकग्राउंड सर्वर सक्रिय है।"
        : "Failed to connect to the AI service. Please make sure the local server.py is running.";
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      { 
        role: 'assistant', 
        content: currentLang === 'hi' ? "चैट इतिहास साफ़ कर दिया गया है। पूछिए!" : "Chat history cleared. How can I assist you?" 
      }
    ]);
    setSystemSource('');
  };

  return (
    <div className="ai-chat-window-panel glass-panel">
      {/* Header */}
      <div className="ai-chat-header">
        <div className="flex-center-inline gap-8">
          <div className="ai-logo-glow flex-center">
            <Sparkles size={16} className="text-primary" />
          </div>
          <div>
            <h4>AI Tax Assistant</h4>
            <span className="text-small text-muted flex-center-inline">
              <span className={`chat-indicator ${systemSource === 'ollama' ? 'indicator-green' : 'indicator-blue'}`}></span>
              {systemSource === 'ollama' ? 'Llama 3.2 (Ollama Local)' : 'PocketCA VLM Sandbox'}
            </span>
          </div>
        </div>
        
        <div className="flex-center-inline gap-8">
          <button className="chat-action-btn" title="Clear Chat" onClick={clearChat}>
            <Trash2 size={16} />
          </button>
          {onClose && (
            <button className="chat-action-btn" title="Close" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="ai-chat-body">
        {messages.map((msg, index) => (
          <div key={index} className={`chat-bubble-container ${msg.role}`}>
            <div className={`chat-bubble ${msg.role}`}>
              <p className="chat-bubble-text">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble-container assistant">
            <div className="chat-bubble assistant typing-indicator">
              <div className="dot-pulse"></div>
              <div className="dot-pulse"></div>
              <div className="dot-pulse"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested chips */}
      {messages.length === 1 && (
        <div className="chat-suggestions-container">
          <p className="text-small text-muted flex-center-inline gap-4 mb-8">
            <HelpCircle size={12} />
            <span>Suggested Questions:</span>
          </p>
          <div className="suggestions-flex">
            {SUGGESTIONS.map((s, idx) => (
              <button 
                key={idx} 
                className="suggestion-chip"
                onClick={() => handleSendMessage(s.text)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input controls */}
      <div className="ai-chat-footer">
        <input 
          type="text" 
          placeholder={currentLang === 'hi' ? "जीएसटी विसंगति के बारे में पूछें..." : "Ask about a GST discrepancy..."} 
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={loading}
        />
        <button 
          className="chat-send-btn flex-center"
          onClick={() => handleSendMessage()}
          disabled={loading || !inputValue.trim()}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
