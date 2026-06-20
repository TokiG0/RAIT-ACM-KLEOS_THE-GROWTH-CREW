// HSN Code Rate Validator
// Cross-checks invoice GST rates against official GST rate schedule

// ─── 2-digit chapter → default IGST% (fallback) ───
const HSN_CHAPTER_RATES = {
  '01': 0,  '02': 0,  '03': 5,  '04': 5,  '05': 5,
  '06': 0,  '07': 0,  '08': 5,  '09': 5,  '10': 0,
  '11': 0,  '12': 0,  '13': 5,  '14': 5,  '15': 5,
  '16': 12, '17': 5,  '18': 18, '19': 12, '20': 12,
  '21': 18, '22': 18, '23': 5,  '24': 28, '25': 5,
  '26': 18, '27': 18, '28': 18, '29': 18, '30': 12,
  '31': 5,  '32': 18, '33': 18, '34': 18, '35': 18,
  '36': 18, '37': 18, '38': 18, '39': 18, '40': 18,
  '41': 5,  '42': 18, '43': 5,  '44': 18, '45': 12,
  '46': 12, '47': 12, '48': 18, '49': 12, '50': 5,
  '51': 5,  '52': 5,  '53': 5,  '54': 18, '55': 18,
  '56': 12, '57': 5,  '58': 12, '59': 12, '60': 5,
  '61': 5,  '62': 5,  '63': 5,  '64': 18, '65': 18,
  '66': 18, '67': 12, '68': 18, '69': 18, '70': 18,
  '71': 3,  '72': 18, '73': 18, '74': 18, '75': 18,
  '76': 18, '78': 18, '79': 18, '80': 18, '81': 18,
  '82': 18, '83': 18, '84': 18, '85': 18, '86': 12,
  '87': 28, '88': 5,  '89': 5,  '90': 18, '91': 18,
  '92': 28, '93': 18, '94': 18, '95': 18, '96': 18,
  '97': 12, '98': 18,
};

// ─── Specific 4-digit HSN overrides ───
const HSN4_RATES = {
  // Chapter 3 – Fish
  '0301': 0, '0302': 0, '0303': 0, '0304': 5, '0305': 12,
  // Chapter 4 – Dairy
  '0401': 0, '0402': 0, '0403': 0, '0404': 5,  '0405': 12,
  '0406': 5, '0407': 0, '0408': 5, '0409': 0,  '0410': 0,
  // Chapter 8 – Fruits
  '0801': 5,  '0802': 5,  '0803': 0, '0804': 5, '0805': 5,
  '0806': 0,  '0808': 0,  '0809': 0, '0811': 12,'0812': 5, '0813': 12,
  // Chapter 9 – Spices
  '0901': 0,  '0902': 5,  '0903': 0, '0904': 5, '0905': 5,
  '0906': 5,  '0907': 5,  '0908': 5, '0909': 0, '0910': 5,
  // Chapter 11 – Milling
  '1101': 0,  '1102': 0,  '1103': 0, '1104': 0, '1105': 5,
  '1106': 0,  '1107': 5,  '1108': 0, '1109': 5,
  // Chapter 13 – Resins
  '1301': 0,  '1302': 18,
  // Chapter 15 – Oils
  '1507': 5,  '1508': 5,  '1509': 5,  '1510': 5,  '1511': 5,
  '1512': 5,  '1513': 5,  '1514': 5,  '1515': 5,  '1516': 12,
  '1517': 12, '1518': 18, '1520': 0,  '1521': 0,
  // Chapter 17 – Sugar
  '1701': 5,  '1702': 0,  '1703': 0,  '1704': 28,
  // Chapter 18 – Cocoa
  '1801': 5,  '1802': 5,  '1803': 5,  '1804': 18, '1805': 18, '1806': 18,
  // Chapter 19 – Cereal preps
  '1901': 18, '1902': 18, '1903': 5,  '1904': 0,  '1905': 5,
  // Chapter 21 – Misc food
  '2101': 18, '2102': 18, '2103': 0,  '2104': 18, '2105': 18, '2106': 18,
  // Chapter 22 – Beverages
  '2201': 0,  '2202': 18, '2203': 28, '2204': 18, '2205': 18,
  '2206': 18, '2207': 18, '2208': 18, '2209': 0,
  // Chapter 23 – Animal feed
  '2301': 0, '2302': 0, '2303': 5, '2304': 0, '2305': 0, '2306': 0,
  '2307': 18, '2308': 5, '2309': 5,
  // Chapter 27 – Fuels
  '2701': 5,  '2702': 5,  '2703': 5,  '2704': 18, '2705': 5,
  '2709': 5,  '2710': 5,  '2711': 5,
  // Chapter 28 – Inorganic chemicals
  '2801': 5,  '2802': 5,  '2803': 18, '2804': 5,  '2805': 5,
  '2836': 18, '2843': 0.25, '2844': 5,
  // Chapter 30 – Pharma
  '3001': 0, '3002': 0, '3003': 5, '3004': 12, '3005': 12, '3006': 12,
  // Chapter 31 – Fertilizers
  '3101': 5, '3102': 5, '3103': 5, '3104': 5, '3105': 5,
  // Chapter 40 – Rubber
  '4001': 5,  '4002': 5,  '4003': 5,  '4004': 5,  '4005': 5,
  '4006': 5,  '4007': 5,  '4008': 18, '4009': 18, '4010': 18,
  '4011': 28, '4012': 28, '4013': 12, '4014': 0,  '4015': 18,
  '4016': 18, '4017': 18,
  // Chapter 44 – Wood
  '4401': 0,  '4402': 0,  '4403': 18, '4404': 12, '4405': 12,
  '4406': 12, '4407': 12, '4408': 12, '4409': 18, '4410': 18,
  '4411': 18, '4412': 18, '4414': 12, '4415': 18, '4419': 0, '4420': 18, '4421': 18,
  // Chapter 48 – Paper
  '4801': 12, '4802': 12, '4813': 28, '4814': 28,
  // Chapter 49 – Printed matter
  '4901': 0, '4902': 0, '4903': 0, '4904': 0, '4905': 0,
  '4906': 0, '4907': 12,'4908': 12,'4909': 0, '4910': 0, '4911': 12,
  // Chapter 57 – Carpets
  '5701': 12, '5702': 5, '5703': 5, '5704': 5, '5705': 5,
  // Chapter 64 – Footwear
  '6401': 18, '6402': 18, '6403': 18, '6404': 18, '6405': 18, '6406': 18,
  // Chapter 68 – Stone
  '6801': 0,  '6802': 12, '6803': 12, '6804': 12, '6805': 18,
  '6806': 18, '6807': 5,  '6812': 18,
  // Chapter 69 – Ceramics
  '6901': 5,  '6902': 18, '6903': 18, '6904': 5,  '6905': 12,
  '6907': 28, '6908': 28, '6911': 12, '6912': 0,  '6914': 12,
  // Chapter 70 – Glass
  '7017': 12, '7018': 0, '7019': 12,
  // Chapter 71 – Precious metals
  '7101': 0,   '7102': 0.25, '7103': 0.25, '7104': 0.25, '7105': 0.25,
  '7106': 3,   '7108': 3,    '7110': 3,    '7113': 3,    '7114': 3,
  '7117': 3,   '7118': 0,
  // Chapter 86 – Railway
  '8601': 0,  '8602': 12, '8603': 12, '8604': 18, '8605': 5,
  '8606': 12, '8607': 12, '8608': 12, '8609': 18,
  // Chapter 87 – Vehicles
  '8701': 12, '8702': 28, '8703': 28, '8704': 28, '8705': 18,
  '8706': 28, '8707': 28, '8708': 28, '8709': 18, '8711': 28,
  '8712': 12, '8713': 5,  '8714': 18, '8715': 0,  '8716': 18,
  // Chapter 88 – Aircraft
  '8801': 0, '8802': 5, '8803': 5, '8804': 5, '8805': 18,
  // Chapter 89 – Ships
  '8901': 5, '8902': 5, '8903': 5, '8904': 5, '8905': 0,
  '8906': 5, '8907': 5, '8908': 5,
  // Chapter 90 – Medical/Optical
  '9018': 12, '9019': 12, '9020': 12, '9021': 12,
  // Chapter 92 – Musical instruments
  '9201': 28, '9202': 28, '9203': 12, '9204': 28,
  '9205': 12, '9206': 12, '9207': 28, '9208': 28, '9209': 18,
  // Chapter 94 – Furniture
  '9401': 18, '9402': 18, '9403': 18, '9404': 18, '9405': 12, '9406': 18,
  // Chapter 95 – Toys
  '9501': 12, '9502': 18, '9503': 12, '9504': 18, '9505': 18,
  '9506': 12, '9507': 12, '9508': 18,
  // Chapter 96 – Misc
  '9610': 0, '9619': 12,
};

const HSN_DESCRIPTIONS = {
  '01':'Live Animals','02':'Meat & Edible Offal','03':'Fish & Seafood',
  '04':'Dairy Products','05':'Animal Products','06':'Live Plants',
  '07':'Vegetables','08':'Fruits & Nuts','09':'Spices & Coffee',
  '10':'Cereals','11':'Milling Products','12':'Oil Seeds',
  '13':'Gums & Resins','14':'Plaiting Materials','15':'Vegetable Fats & Oils',
  '16':'Meat Preparations','17':'Sugar & Confectionery','18':'Cocoa Products',
  '19':'Cereal Preparations','20':'Vegetable Preparations',
  '21':'Misc Food Preparations','22':'Beverages & Spirits',
  '23':'Animal Feed','24':'Tobacco',
  '25':'Salt & Minerals','26':'Ores & Slag','27':'Mineral Fuels',
  '28':'Inorganic Chemicals','29':'Organic Chemicals','30':'Pharmaceuticals',
  '31':'Fertilisers','32':'Dyes, Paints & Inks','33':'Cosmetics & Perfumery',
  '34':'Soap & Detergent','35':'Albuminoids & Starch','36':'Explosives',
  '37':'Photographic Goods','38':'Miscellaneous Chemicals',
  '39':'Plastics','40':'Rubber','41':'Raw Hides & Leather',
  '42':'Leather Articles','43':'Furskins','44':'Wood & Articles',
  '45':'Cork','46':'Straw & Basketware','47':'Paper Pulp',
  '48':'Paper & Paperboard','49':'Printed Books & Maps',
  '50':'Silk','51':'Wool & Animal Hair','52':'Cotton',
  '53':'Other Vegetable Fibres','54':'Manmade Filaments','55':'Manmade Staple Fibres',
  '56':'Wadding & Felt','57':'Carpets & Floor Coverings','58':'Special Fabrics',
  '59':'Technical Textiles','60':'Knitted Fabrics',
  '61':'Knitted Apparel','62':'Woven Apparel','63':'Home Textiles',
  '64':'Footwear','65':'Headgear','66':'Umbrellas',
  '67':'Feathers & Artificial Flowers','68':'Stone Articles',
  '69':'Ceramic Products','70':'Glass & Glassware',
  '71':'Precious Metals & Jewellery','72':'Iron & Steel','73':'Iron/Steel Articles',
  '74':'Copper','75':'Nickel','76':'Aluminium',
  '78':'Lead','79':'Zinc','80':'Tin','81':'Other Base Metals',
  '82':'Tools','83':'Misc Metal Articles',
  '84':'Machinery & Equipment','85':'Electrical Equipment',
  '86':'Railway Equipment','87':'Vehicles',
  '88':'Aircraft','89':'Ships & Boats',
  '90':'Optical & Medical Equipment','91':'Clocks & Watches',
  '92':'Musical Instruments','93':'Arms & Ammunition',
  '94':'Furniture','95':'Toys & Games',
  '96':'Misc Manufactured Articles','97':'Works of Art',
  '98':'Special Import Projects',
};

export function lookupExpectedRate(hsnCode) {
  if (!hsnCode) return null;
  const clean = String(hsnCode).replace(/\s+/g, '').replace(/[^0-9]/g, '');
  if (clean.length < 2) return null;

  const hsn4 = clean.substring(0, 4);
  if (HSN4_RATES.hasOwnProperty(hsn4)) {
    const igst = HSN4_RATES[hsn4];
    return { igst, cgst: igst / 2, sgst: igst / 2, isChapterLevel: false };
  }

  const ch = clean.substring(0, 2);
  if (HSN_CHAPTER_RATES.hasOwnProperty(ch)) {
    const igst = HSN_CHAPTER_RATES[ch];
    return { igst, cgst: igst / 2, sgst: igst / 2, isChapterLevel: true };
  }

  return null;
}

export function getHsnDescription(hsnCode) {
  if (!hsnCode) return 'Unknown';
  const clean = String(hsnCode).replace(/\s+/g, '').replace(/[^0-9]/g, '');
  return HSN_DESCRIPTIONS[clean.substring(0, 2)] || 'Unclassified Goods';
}

export function validatePurchaseRecords(purchaseRecords) {
  return purchaseRecords
    .map(rec => {
      const { hsnCode, taxableValue, cgst, sgst, igst, supplierName, supplierGstin, invoiceNumber } = rec;
      if (!hsnCode) return null;

      const numericTaxable = Number(taxableValue) || 0;
      const totalTax = (Number(cgst) || 0) + (Number(sgst) || 0) + (Number(igst) || 0);
      const actualIgstRate = numericTaxable > 0 ? (totalTax / numericTaxable) * 100 : 0;

      const expected = lookupExpectedRate(hsnCode);
      if (!expected) {
        return {
          ...rec,
          actualRate: Math.round(actualIgstRate * 10) / 10,
          expectedRate: null,
          status: 'UNKNOWN_HSN',
          description: getHsnDescription(hsnCode),
          isChapterLevel: false,
          totalTax,
          taxableValue: numericTaxable,
          overchargeAmount: 0,
        };
      }

      const diff = actualIgstRate - expected.igst;
      const hasMismatch = Math.abs(diff) > 0.5;

      return {
        ...rec,
        actualRate: Math.round(actualIgstRate * 10) / 10,
        expectedRate: expected.igst,
        diff: hasMismatch ? diff : 0,
        status: hasMismatch ? 'RATE_MISMATCH' : 'CORRECT',
        description: getHsnDescription(hsnCode),
        isChapterLevel: expected.isChapterLevel,
        totalTax,
        taxableValue: numericTaxable,
        overchargeAmount: hasMismatch ? (diff / 100) * numericTaxable : 0,
      };
    })
    .filter(Boolean);
}

export function buildHsnCorrectionWhatsApp(issue, lang = 'en') {
  const {
    supplierName = 'Supplier', invoiceNumber = 'N/A',
    hsnCode, actualRate, expectedRate, taxableValue, overchargeAmount,
  } = issue;
  const diff = ((expectedRate || 0) - (actualRate || 0)).toFixed(1);
  const over = Math.abs(overchargeAmount || 0).toFixed(0);
  const tv = (taxableValue || 0).toFixed(0);

  const msgs = {
    en:
`Dear ${supplierName},

Re: Invoice No. ${invoiceNumber} — GST Rate Discrepancy

We noticed an incorrect GST rate for HSN code ${hsnCode}:
• Rate applied on invoice: ${actualRate}%
• Correct GST rate (per schedule): ${expectedRate}%
• Taxable value: ₹${tv}
• Tax difference: ₹${over} (${diff > 0 ? 'under-billed' : 'over-billed'})

Please amend your GSTR-1 with the correct rate so we can claim the right ITC amount.

Regards,
PocketCA – GST Compliance Assistant`,

    hi:
`प्रिय ${supplierName},

इनवॉइस नंबर ${invoiceNumber} — GST दर में गड़बड़ी

HSN कोड ${hsnCode} पर गलत GST दर लगी है:
• बिल पर दर: ${actualRate}%
• सही GST दर: ${expectedRate}%
• करयोग्य राशि: ₹${tv}
• टैक्स अंतर: ₹${over}

कृपया सही दर से GSTR-1 में सुधार करें।

धन्यवाद,
PocketCA – GST सहायक`,

    hing:
`Dear ${supplierName},

Invoice no ${invoiceNumber} ke baare mein — GST Rate Galat Hai

HSN code ${hsnCode} par wrong GST rate laga hai:
• Bill par lagi rate: ${actualRate}%
• Sahi GST rate: ${expectedRate}%
• Taxable amount: ₹${tv}
• Tax difference: ₹${over}

Please sahi rate se GSTR-1 amend karein, tabhi hum sahi ITC claim kar payenge.

Shukriya,
PocketCA – GST Assistant`,
  };

  return msgs[lang] || msgs.en;
}
