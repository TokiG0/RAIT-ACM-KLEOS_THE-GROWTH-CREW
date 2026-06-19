#  Pocket CA

> **Your AI-Powered Chartered Accountant for GST Compliance, Reconciliation, and ITC Recovery**

Pocket CA is an intelligent compliance assistant designed to help Indian MSMEs, traders, and small businesses automate GST-related workflows. By combining OCR, deterministic compliance rules, reconciliation engines, and local LLM intelligence, Pocket CA transforms unstructured invoices into actionable compliance insights.

The platform acts as a **"CA in Your Pocket"**, helping businesses identify GST mismatches, recover missed Input Tax Credit (ITC), and understand compliance issues through natural language conversations.

---

##  Features

###  Intelligent Invoice Processing

* OCR-powered invoice extraction
* Support for scanned PDFs, invoices, and receipt images
* Automatic extraction of:

  * GSTIN
  * Invoice Number
  * Invoice Date
  * HSN/SAC Codes
  * Taxable Amount
  * CGST / SGST / IGST

###  GST Reconciliation

* Invoice vs GSTR-2B matching
* Missing invoice detection
* Duplicate invoice identification
* GST mismatch analysis
* Supplier reconciliation

###  ITC Recovery Intelligence

* Detect blocked Input Tax Credit
* Estimate recoverable ITC
* Highlight high-priority compliance issues
* Recommend corrective actions

### AI Compliance Assistant

* Natural language GST explanations
* Conversational compliance support
* Context-aware recommendations
* Local LLM-powered assistance

###  Compliance Analytics

* GST Health Score
* Risk Assessment
* Invoice Compliance Insights
* Recovery Opportunity Tracking

---

#  System Architecture

```text
Invoice Images / PDFs
           │
           ▼
      OCR Pipeline
           │
           ▼
 Structured Invoice Data
           │
           ▼
 Reconciliation Engine
           │
           ▼
 Compliance Rule Engine
           │
           ▼
 Local LLM Assistant
           │
           ▼
 Actionable Recommendations
```

---

#  OCR Pipeline

The OCR subsystem converts unstructured invoice documents into structured GST-ready data.

### Components

### 1. Pixel Budget & Resize Constants

Optimized image preprocessing and resizing strategy for efficient document understanding.

### 2. Model Loader (Singleton)

Efficient loading and reuse of OCR/VLM models to minimize memory overhead.

### 3. Image Utilities

Preprocessing utilities for:

* Resizing
* Compression
* Normalization
* Format conversion

### 4. Prompt Engineering

Token-efficient prompts designed for invoice extraction and structured output generation.

### 5. Inference Engine

Performs OCR and invoice understanding using Vision-Language Models.

### 6. Post-Processing & Cleaning

Normalizes extracted values and removes OCR inconsistencies.

### 7. VLM Output Parsing

Converts raw model outputs into structured invoice schemas.

### 8. Main OCR Pipeline

End-to-end invoice processing workflow.

### 9. GSTR-2B Excel Parser

Parses GSTR-2B exports for reconciliation and compliance analysis.

### 10. CLI Interface

Command-line interface for invoice processing and analysis.

---

#  LLM Compliance Pipeline

The compliance intelligence layer combines deterministic GST rules with local LLM reasoning.

### 1. Configuration & Constants

Centralized configuration and environment management.

### 2. Data Input & Blueprint Validation (`schema.py`)

Schema validation and structured invoice verification.

### 3. Compliance Master Lookup Registry (`rules.py`)

Central repository of GST compliance references and business rules.

### 4. Deterministic Compliance Rule Engine (`rules.py`)

Rule-based compliance checks including:

* GSTIN validation
* HSN verification
* Tax mismatch detection
* ITC eligibility assessment

### 5. Local B2B Reconciliation Engine (`reconcile.py`)

Invoice-to-GSTR reconciliation framework.

### 6. Local Infrastructure Initializer (`main.py`)

Initializes local services and processing modules.

### 7. Local LLM Orchestration

Powered by:

**Llama-3.2-3B-Instruct**

Capabilities:

* Compliance explanations
* GST assistance
* Risk analysis
* Actionable recommendations

### 8. Strict Conversational Pattern Prompt (`main.py`)

Structured prompting framework for reliable compliance-focused interactions.

### 9. Persistent Local Chat Loop Thread (`main.py`)

Maintains conversational context for ongoing compliance discussions.

### 10. Interactive CLI Interface (`main.py`)

Chat-based compliance assistant running locally.

---

# Technology Stack

### AI & Machine Learning

* Python
* OCR Pipeline
* Vision Language Models (VLM)
* Llama 3.2 3B Instruct

### Data Processing

* Pandas
* NumPy
* OpenPyXL

### Compliance Intelligence

* Custom Rule Engine
* GST Reconciliation Engine
* Compliance Knowledge Registry

### Interface

* CLI-Based Assistant
* Conversational AI Interface

---

#  Project Structure

```text
Pocket-CA/
│
├── ocr/
│   ├── image_utils.py
│   ├── inference.py
│   ├── parser.py
│   └── pipeline.py
│
├── compliance/
│   ├── schema.py
│   ├── rules.py
│   ├── reconcile.py
│   └── registry.py
│
├── llm/
│   ├── orchestrator.py
│   ├── prompts.py
│   └── chat.py
│
├── data/
│   └── gstr2b_parser.py
│
├── main.py
│
└── README.md
```

---

# Key Benefits

* Automates invoice processing
* Reduces manual GST reconciliation effort
* Improves ITC claim accuracy
* Identifies compliance risks early
* Provides explainable GST recommendations
* Makes GST compliance accessible to MSMEs

---

#  Future Roadmap

* Multilingual Support (Hindi, Marathi, Gujarati)
* WhatsApp Invoice Processing
* Voice-Based GST Assistant
* Mobile Application
* GST Health Dashboard
* Advanced Risk Scoring
* Real-Time Supplier Verification

---

#  Vision

Pocket CA aims to become the trusted AI compliance companion for every small business in India by simplifying GST workflows, improving financial visibility, and making expert-level compliance guidance accessible to everyone.

### **Pocket CA — Your Chartered Accountant in Your Pocket.**
