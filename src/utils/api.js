/**
 * PocketCA Backend REST API Client
 * Manages HTTP communication with the Python REST backend
 */

const API_BASE = 'http://127.0.0.1:5000/api';

/**
 * Verifies backend health and connectivity
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return { active: false };
    const data = await res.json();
    return {
      active: true,
      vlmLoaded: data.vlm_loaded,
      ollamaActive: data.ollama_active,
      mode: data.mode
    };
  } catch (err) {
    return { active: false };
  }
}

/**
 * Uploads a real invoice (PDF, JPEG, PNG) to the OCR extraction pipeline
 * @param {File} file - The file object from input change
 * @param {string} ocrMode - The chosen OCR mode ('sandbox' or 'vlm')
 */
export async function uploadInvoice(file, ocrMode = 'sandbox', buyerGstin = '') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ocr_mode', ocrMode);
  formData.append('buyer_gstin', buyerGstin);

  const res = await fetch(`${API_BASE}/upload-invoice`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || 'Failed to extract invoice data');
  }

  return await res.json();
}

/**
 * Uploads and parses a GSTR-2B Excel file
 * @param {File} file - Excel worksheet file
 */
export async function parseGstr2bExcel(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/parse-gstr2b`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || 'Failed parsing GSTR-2B Excel');
  }

  return await res.json();
}

/**
 * Fetches all invoices currently stored in the SQLite purchase registry
 */
export async function getPurchaseRegistry() {
  const res = await fetch(`${API_BASE}/purchase-registry`);
  if (!res.ok) {
    throw new Error('Failed to retrieve purchase registry records');
  }
  return await res.json();
}

/**
 * Sends a message context payload to the Llama 3.2 chatbot assistant
 */
export async function sendChatMessage(message, history = [], context = {}) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, context })
  });

  if (!res.ok) {
    throw new Error('Failed to communicate with the AI Tax Assistant');
  }

  return await res.json();
}

/**
 * Runs the compliance rule engine auditor manually
 */
export async function runRules(invoiceData) {
  const res = await fetch(`${API_BASE}/run-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invoiceData)
  });

  if (!res.ok) {
    throw new Error('Rule audit failed');
  }

  return await res.json();
}

/**
 * Deletes a purchase record from the database by ID
 */
export async function deletePurchaseRecord(recordId) {
  const res = await fetch(`${API_BASE}/purchase-registry/${recordId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || 'Failed to delete purchase record');
  }

  return await res.json();
}

