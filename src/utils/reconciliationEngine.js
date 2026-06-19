// Core Reconciliation Engine for PocketCA
// Handles fuzzy matching of invoice numbers, dates, and amounts

/**
 * Standardizes an invoice number for fuzzy comparison:
 * - Converts to lowercase
 * - Removes non-alphanumeric characters (slashes, dashes, spaces)
 * - Removes common prefixes like "inv", "invoice", "bill", "txn", "no"
 * - Removes leading zeros
 */
export function standardizeInvoiceNumber(invNum) {
  if (!invNum) return "";
  let clean = String(invNum).toLowerCase().replace(/[^a-z0-9]/g, "");
  
  // Strip common prefixes
  const prefixes = ["invoice", "inv", "bill", "txn", "no", "transaction"];
  for (const prefix of prefixes) {
    if (clean.startsWith(prefix)) {
      clean = clean.substring(prefix.length);
    }
  }
  
  // Remove leading zeros
  clean = clean.replace(/^0+/, "");
  return clean;
}

/**
 * Checks if two dates are within a specific number of days tolerance.
 */
export function isDateWithinTolerance(dateStr1, dateStr2, toleranceDays = 5) {
  if (!dateStr1 || !dateStr2) return false;
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  
  if (isNaN(d1.getTime()) || !isNaN(d2.getTime())) {
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= toleranceDays;
  }
  return false;
}

/**
 * Checks if two invoice numbers are a fuzzy match.
 * E.g., "INV-2026-001" and "001" or "2026/001"
 */
export function isFuzzyInvoiceMatch(inv1, inv2) {
  const s1 = standardizeInvoiceNumber(inv1);
  const s2 = standardizeInvoiceNumber(inv2);
  
  if (!s1 || !s2) return false;
  if (s1 === s2) return true;
  
  // If one is a suffix of another and is reasonably long (at least 3 chars)
  if (s1.length >= 3 && s2.endsWith(s1)) return true;
  if (s2.length >= 3 && s1.endsWith(s2)) return true;
  
  return false;
}

/**
 * Reconciles Purchase Invoices against GSTR-2B records.
 */
export function reconcileRecords(purchaseInvoices, gstr2bRecords) {
  const reconciled = [];
  const unmatchedGstr2b = [...gstr2bRecords];
  
  // Summaries
  let claimableItc = 0;
  let blockedItc = 0; // HSN mismatches or tax amount discrepancies
  let atRiskItc = 0;   // Supplier defaults (missing in GSTR-2B)
  let unclaimedItc = 0;  // Found in GSTR-2B, missing in Purchases

  purchaseInvoices.forEach(purchase => {
    // 1. Find matching GSTIN first
    const gstinMatches = unmatchedGstr2b.filter(
      gstr => gstr.supplierGstin.toLowerCase() === purchase.supplierGstin.toLowerCase()
    );
    
    let match = null;
    let matchIndex = -1;
    
    // 2. Look for exact/fuzzy invoice number match
    if (gstinMatches.length > 0) {
      matchIndex = unmatchedGstr2b.findIndex(gstr => {
        // GSTIN matches AND Invoice matches (fuzzy)
        return gstr.supplierGstin.toLowerCase() === purchase.supplierGstin.toLowerCase() && 
               isFuzzyInvoiceMatch(gstr.invoiceNumber, purchase.invoiceNumber);
      });
      
      if (matchIndex !== -1) {
        match = unmatchedGstr2b[matchIndex];
        // Remove from unmatched list so it's not matched again
        unmatchedGstr2b.splice(matchIndex, 1);
      }
    }
    
    if (match) {
      // We found a match! Check for discrepancies
      const hsnMismatch = String(purchase.hsnCode).substring(0, 2) !== String(match.hsnCode).substring(0, 2);
      // Wait, let's calculate ITC amounts. ITC is CGST + SGST or IGST.
      const purchaseItc = (purchase.cgst || 0) + (purchase.sgst || 0) + (purchase.igst || 0);
      const portalItc = (match.cgst || 0) + (match.sgst || 0) + (match.igst || 0);
      const amountMismatch = Math.abs(purchaseItc - portalItc) > 1.0; // Tolerance of ₹1
      
      let status = "MATCHED";
      let explanation = "";
      let explanationHi = "";
      let explanationHing = "";
      let financialImpact = 0;
      
      if (hsnMismatch) {
        status = "MISMATCH_HSN";
        financialImpact = purchaseItc; // If HSN is mismatched, government may block full ITC or require re-filing
        blockedItc += financialImpact;
        explanation = `HSN mismatch. Purchase shows HSN ${purchase.hsnCode} but Supplier uploaded ${match.hsnCode}. Government may block this ITC.`;
        explanationHi = `एचएसएन (HSN) कोड मेल नहीं खाता। आपके बिल में HSN ${purchase.hsnCode} है लेकिन सप्लायर ने ${match.hsnCode} अपलोड किया है। आपका क्रेडिट रुक सकता है।`;
        explanationHing = `HSN code alag hai. Aapke bill me HSN ${purchase.hsnCode} hai par Supplier ne portal par ${match.hsnCode} dala hai. Isse ITC block ho sakta hai.`;
      } else if (amountMismatch) {
        status = "MISMATCH_AMOUNT";
        // Loss is the difference if portal has less tax, or full difference
        financialImpact = purchaseItc - portalItc;
        if (financialImpact > 0) {
          blockedItc += financialImpact;
          explanation = `Tax mismatch. Purchase invoice tax is ₹${purchaseItc.toFixed(2)}, but supplier uploaded ₹${portalItc.toFixed(2)}. You can only claim ₹${portalItc.toFixed(2)} (Loss: ₹${financialImpact.toFixed(2)}).`;
          explanationHi = `टैक्स राशि में अंतर। आपके बिल का टैक्स ₹${purchaseItc.toFixed(2)} है, पर सप्लायर ने ₹${portalItc.toFixed(2)} अपलोड किया है। आप केवल ₹${portalItc.toFixed(2)} का दावा कर सकते हैं (नुकसान: ₹${financialImpact.toFixed(2)})।`;
          explanationHing = `Tax amount match nahi ho raha. Aapke bill me tax ₹${purchaseItc.toFixed(2)} hai par Supplier ne ₹${portalItc.toFixed(2)} upload kiya hai. Aap sirf ₹${portalItc.toFixed(2)} claim kar sakte hain (Loss: ₹${financialImpact.toFixed(2)}).`;
        } else {
          // Supplier uploaded more tax than purchase? Technically allowed to claim purchase tax, but flags warning.
          explanation = `Tax mismatch. Supplier uploaded ₹${portalItc.toFixed(2)} which is higher than purchase tax ₹${purchaseItc.toFixed(2)}. Claim purchase value.`;
          explanationHi = `टैक्स राशि में अंतर। सप्लायर ने ₹${portalItc.toFixed(2)} अपलोड किया है जो आपके रिकॉर्ड ₹${purchaseItc.toFixed(2)} से ज़्यादा है। अपने रिकॉर्ड के अनुसार दावा करें।`;
          explanationHing = `Tax mismatch. Supplier ne ₹${portalItc.toFixed(2)} upload kiya hai jo aapke bill ₹${purchaseItc.toFixed(2)} se zyada hai. Bill ke hisab se claim karein.`;
        }
      } else {
        claimableItc += purchaseItc;
        explanation = "Perfect match. Input Tax Credit is fully claimable!";
        explanationHi = "सही मिलान। इनपुट टैक्स क्रेडिट का पूरा दावा किया जा सकता है!";
        explanationHing = "Perfect match hai. Aap pura ITC claim kar sakte hain!";
      }
      
      reconciled.push({
        id: `rec-${purchase.invoiceNumber}-${purchase.supplierGstin}`,
        purchase,
        gstr: match,
        status,
        financialImpact,
        explanation,
        explanationHi,
        explanationHing
      });
    } else {
      // No match found in GSTR-2B -> Supplier Default!
      const purchaseItc = (purchase.cgst || 0) + (purchase.sgst || 0) + (purchase.igst || 0);
      atRiskItc += purchaseItc;
      
      // Let's check if the supplier uploaded under a different GSTIN
      const potentialGstinTypo = gstr2bRecords.find(gstr => 
        isFuzzyInvoiceMatch(gstr.invoiceNumber, purchase.invoiceNumber) &&
        gstr.supplierName.toLowerCase() === purchase.supplierName.toLowerCase()
      );
      
      let status = "SUPPLIER_DEFAULT";
      let explanation = `Missing in GSTR-2B. Supplier hasn't uploaded this invoice. You cannot claim ₹${purchaseItc.toFixed(2)} ITC until they upload it.`;
      let explanationHi = `जीएसटीआर-2बी में गायब। सप्लायर ने इस इनवॉइस को अपलोड नहीं किया है। जब तक वे इसे अपलोड नहीं करते, आप ₹${purchaseItc.toFixed(2)} का आईटीसी दावा नहीं कर सकते।`;
      let explanationHing = `GSTR-2B me missing hai. Supplier ne upload nahi kiya. Jab tak upload nahi hoga, aap ₹${purchaseItc.toFixed(2)} ITC claim nahi kar sakte.`;
      
      if (potentialGstinTypo) {
        status = "MISMATCH_GSTIN";
        explanation = `GSTIN Error. Supplier uploaded invoice under wrong GSTIN (${potentialGstinTypo.supplierGstin}). Inform them to amend it.`;
        explanationHi = `गलत जीएसटी नंबर। सप्लायर ने गलत GSTIN (${potentialGstinTypo.supplierGstin}) पर बिल अपलोड कर दिया है। उन्हें सुधार करने को कहें।`;
        explanationHing = `Wrong GSTIN. Supplier ne galat GSTIN (${potentialGstinTypo.supplierGstin}) par bill upload kiya hai. Unhe correction karne ko bolein.`;
        
        const typoIndex = unmatchedGstr2b.findIndex(g => 
          g.invoiceNumber === potentialGstinTypo.invoiceNumber && 
          g.supplierGstin === potentialGstinTypo.supplierGstin
        );
        if (typoIndex !== -1) {
          unmatchedGstr2b.splice(typoIndex, 1);
        }
      }
      
      reconciled.push({
        id: `rec-${purchase.invoiceNumber}-${purchase.supplierGstin}`,
        purchase,
        gstr: null,
        status,
        financialImpact: purchaseItc,
        explanation,
        explanationHi,
        explanationHing
      });
    }
  });
  
  // 3. Process remaining unmatched records in GSTR-2B -> Unclaimed ITC!
  const unclaimedList = unmatchedGstr2b.map(gstr => {
    const portalItc = (gstr.cgst || 0) + (gstr.sgst || 0) + (gstr.igst || 0);
    unclaimedItc += portalItc;
    
    return {
      id: `unclaimed-${gstr.invoiceNumber}-${gstr.supplierGstin}`,
      purchase: null,
      gstr,
      status: "UNCLAIMED",
      financialImpact: portalItc,
      explanation: `Unclaimed ITC. Supplier uploaded invoice for ₹${portalItc.toFixed(2)} but it is missing in your purchase book. Record it to claim.`,
      explanationHi: `अदावाकृत आईटीसी (Unclaimed). सप्लायर ने ₹${portalItc.toFixed(2)} का इनवॉइस अपलोड किया है, लेकिन यह आपके रिकॉर्ड में नहीं है। दावा करने के लिए इसे दर्ज करें।`,
      explanationHing: `Unclaimed ITC. Supplier ne ₹${portalItc.toFixed(2)} ka invoice upload kiya hai par aapke books me entry nahi hai. Claim karne ke liye enter karein.`
    };
  });
  
  // Note: the line assignment above had a syntax error. It used `=` instead of `:` for object properties in Hindi and Hinglish.
  // Let's write it carefully. Let's fix that!
  
  return {
    reconciled: [...reconciled, ...unclaimedList],
    summary: {
      claimableItc,
      blockedItc,
      atRiskItc,
      unclaimedItc,
      totalLoss: blockedItc + atRiskItc,
      reconciliationScore: purchaseInvoices.length > 0 
        ? Math.round((reconciled.filter(r => r.status === "MATCHED").length / purchaseInvoices.length) * 100)
        : 100
    }
  };
}
