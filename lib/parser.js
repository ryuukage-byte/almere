require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Multi-model fallback chain to handle any 503 high demand spikes or model deprecations
const FALLBACK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest'
];

/**
 * Clean and convert arbitrary text/number to float safely
 */
function cleanFloat(val, defaultVal = 0) {
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  if (!val) return defaultVal;
  // Remove commas, currency symbols, and token names
  const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Normalizes transaction type string
 */
function normalizeType(rawType = '') {
  const upper = String(rawType).toUpperCase();
  if (upper.includes('DEPOSIT')) return 'DEPOSIT';
  if (upper.includes('WITHDRAW')) return 'WITHDRAWAL';
  if (upper.includes('BUY')) return 'BUY';
  if (upper.includes('SELL')) return 'SELL';
  if (upper.includes('FEE')) return 'FEE';
  return 'BUY';
}

/**
 * Parses transaction screenshot using Gemini Vision with automatic model fallback
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {string} mimeType - e.g. 'image/jpeg', 'image/png'
 * @returns {Promise<Object>} Extracted structured transaction data
 */
async function parseTransactionScreenshot(imageBuffer, mimeType = 'image/jpeg') {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const base64Image = imageBuffer.toString('base64');

  const systemPrompt = `
You are an expert financial transaction extraction system for Almere & Co.
Analyze the uploaded cryptocurrency exchange screenshot (typically from Triv Indonesia).
Extract all transaction details accurately into structured JSON.

Rules:
1. "type": Must be one of: "BUY", "SELL", "DEPOSIT", "WITHDRAWAL", "FEE".
   - "Spot Buy (HYPE)" or "Spot Buy (BTC)" -> "BUY"
   - "Spot Sell (...)" -> "SELL"
   - "Deposit Rupiah (IDR)" -> "DEPOSIT"
   - "Withdrawal Rupiah" -> "WITHDRAWAL"
2. "asset": Cryptocurrency or fiat code (e.g. "HYPE", "BTC", "ETH", "IDR", "USDC").
   - For buying HYPE, asset is "HYPE".
   - For Deposit Rupiah, asset is "IDR".
3. "quantity": Number of asset units bought/sold (e.g. 1.277149). For IDR deposit, set to the received IDR amount (e.g. 9000000).
4. "rate_idr": Price per unit in IDR (e.g. 1406429). If deposit/withdrawal, set to 1.
5. "amount_idr": Gross amount in IDR (e.g. 1800000 or 9000000).
6. "fee_idr": Total fee in IDR (sum of Tax Fee, Triv Fee, QRIS Fee). If Free, 0.
7. "total_received": Total received asset quantity (e.g. 1.277149 for HYPE, or 9000000 for IDR).
8. "tx_id": Unique transaction reference ID (e.g. "TRIV-19yri9y2ck3tn5gu").
9. "date": ISO 8601 string or original timestamp representation.
10. "status": "COMPLETED" or other.

Return ONLY a valid JSON object:
{
  "type": "BUY" | "SELL" | "DEPOSIT" | "WITHDRAWAL",
  "asset": string,
  "quantity": number,
  "rate_idr": number,
  "amount_idr": number,
  "fee_idr": number,
  "total_received": number,
  "tx_id": string,
  "date": string,
  "status": string,
  "summary_text": string,
  "confidence": "HIGH" | "LOW"
}
`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: 'application/json'
    }
  };

  let lastError = null;

  for (const model of FALLBACK_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    try {
      console.log(`🤖 Attempting OCR with model: ${model}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`⚠️ Model ${model} returned ${response.status}: ${errText.substring(0, 150)}`);
        lastError = new Error(`Gemini API error (${response.status}) on ${model}: ${errText}`);
        continue;
      }

      const result = await response.json();
      const parts = result.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => p.text);
      const rawText = textPart ? textPart.text : null;

      if (!rawText) {
        lastError = new Error(`Model ${model} returned empty response`);
        continue;
      }

      // Parse JSON from text, handling any accidental markdown wrap
      const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const rawParsed = JSON.parse(cleanJson);

      // Sanitize and normalize fields
      const type = normalizeType(rawParsed.type);
      const asset = (rawParsed.asset || (type === 'DEPOSIT' ? 'IDR' : 'UNKNOWN')).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const quantity = cleanFloat(rawParsed.quantity);
      const amountIdr = cleanFloat(rawParsed.amount_idr);
      const feeIdr = cleanFloat(rawParsed.fee_idr);
      const totalReceived = cleanFloat(rawParsed.total_received) || quantity;
      const rateIdr = cleanFloat(rawParsed.rate_idr) || (quantity > 0 && amountIdr > 0 ? amountIdr / quantity : 1);

      const parsed = {
        type,
        asset,
        quantity,
        rate_idr: rateIdr,
        amount_idr: amountIdr,
        fee_idr: feeIdr,
        total_received: totalReceived,
        tx_id: rawParsed.tx_id || `TRIV-${Date.now()}`,
        date: rawParsed.date || new Date().toISOString(),
        status: (rawParsed.status || 'COMPLETED').toUpperCase(),
        summary_text: rawParsed.summary_text || `${type} ${quantity} ${asset}`,
        confidence: rawParsed.confidence || 'HIGH'
      };

      console.log(`✅ OCR parsed successfully using ${model} (TX: ${parsed.tx_id}, Type: ${parsed.type}, Amount: Rp ${parsed.amount_idr})`);
      return parsed;
    } catch (err) {
      console.warn(`⚠️ Error with model ${model}: ${err.message}`);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini fallback models failed to parse the screenshot.');
}

module.exports = {
  parseTransactionScreenshot,
  cleanFloat,
  normalizeType
};
