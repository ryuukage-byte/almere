// Real-time decoupled market price feed

let cachedPrices = {
  BTC: { usd: 74000, idr: 74000 * 17840 },
  HYPE: { usd: 72.5, idr: 72.5 * 17840 },
  USDC: { usd: 1.0, idr: 17840 },
  USD_IDR: 17840,
  forexRates: {},
  lastUpdated: 0
};

/**
 * Fetches latest prices from public APIs (Hyperliquid L1, CoinGecko, open.er-api, Binance, Indodax) with fallback cache
 */
async function getMarketPrices() {
  // Return cache if less than 15 seconds old
  if (Date.now() - cachedPrices.lastUpdated < 15000 && cachedPrices.lastUpdated > 0) {
    return cachedPrices;
  }

  // 1. Fetch live multi-currency Forex exchange rates (open.er-api.com) with 3s timeout
  try {
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(3000)
    });
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      if (fxData && fxData.rates) {
        cachedPrices.forexRates = fxData.rates;
        if (fxData.rates.IDR && fxData.rates.IDR > 10000) {
          cachedPrices.USD_IDR = Math.round(fxData.rates.IDR);
        }
      }
    }
  } catch (err) {
    // Keep cached forex
  }

  // 2. Fetch Hyperliquid L1 official API (Official node mid prices for HYPE and BTC) - Primary Global Spot
  try {
    const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
      signal: AbortSignal.timeout(3000)
    });
    if (hlRes.ok) {
      const allMids = await hlRes.json();
      if (allMids.HYPE) {
        const hypePrice = parseFloat(allMids.HYPE);
        if (hypePrice > 0) cachedPrices.HYPE.usd = parseFloat(hypePrice.toFixed(4));
      }
      if (allMids.BTC) {
        const btcHlPrice = parseFloat(allMids.BTC);
        if (btcHlPrice > 0) cachedPrices.BTC.usd = parseFloat(btcHlPrice.toFixed(2));
      }
    }
  } catch (err) {
    // Keep cached
  }

  // 3. CoinGecko prices for USD and USD/IDR fallback
  try {
    const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hyperliquid&vs_currencies=usd,idr', {
      signal: AbortSignal.timeout(3000)
    });
    if (cgRes.ok) {
      const data = await cgRes.json();
      if (data.bitcoin && data.bitcoin.usd && !cachedPrices.BTC.usd) {
        cachedPrices.BTC.usd = parseFloat(data.bitcoin.usd);
      }
      if (data.hyperliquid && data.hyperliquid.usd && !cachedPrices.HYPE.usd) {
        cachedPrices.HYPE.usd = parseFloat(data.hyperliquid.usd);
      }
      if (data.bitcoin && data.bitcoin.usd && data.bitcoin.idr && (!cachedPrices.USD_IDR || cachedPrices.USD_IDR === 17840)) {
        const impliedRate = Math.round(data.bitcoin.idr / data.bitcoin.usd);
        if (impliedRate > 10000 && impliedRate < 25000) {
          cachedPrices.USD_IDR = impliedRate;
        }
      }
    }
  } catch (err) {
    // Keep cached
  }

  // 4. Binance BTCUSDT ticker as optional secondary check (with fast 2s timeout)
  try {
    const binanceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {
      signal: AbortSignal.timeout(2000)
    });
    if (binanceRes.ok) {
      const data = await binanceRes.json();
      const btcPrice = parseFloat(data.price);
      if (btcPrice > 0) cachedPrices.BTC.usd = parseFloat(btcPrice.toFixed(2));
    }
  } catch (err) {
    // Keep cached BTC price
  }

  // Ensure IDR and USD prices are synchronized with exact 1:1 rate parity based on primary USD spot
  const rate = cachedPrices.USD_IDR || 17840;
  if (cachedPrices.BTC.usd > 0) {
    cachedPrices.BTC.idr = Math.round(cachedPrices.BTC.usd * rate);
  }
  if (cachedPrices.HYPE.usd > 0) {
    cachedPrices.HYPE.idr = Math.round(cachedPrices.HYPE.usd * rate);
  }
  cachedPrices.lastUpdated = Date.now();

  return cachedPrices;
}

module.exports = {
  getMarketPrices
};

