require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-3.5-flash';

/**
 * Parses transaction screenshot using Gemini 2.5 Flash Vision
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {string} mimeType - e.g. 'image/jpeg', 'image/png'
 * @returns {Promise<Object>} Extracted structured transaction data
 */
async function parseTransactionScreenshot(imageBuffer, mimeType = 'image/jpeg') {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const base64Image = imageBuffer.toString('base64');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('Gemini API returned empty response');
  }

  // Parse JSON from text, handling any accidental markdown wrap
  const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleanJson);
  return parsed;
}

module.exports = {
  parseTransactionScreenshot
};
