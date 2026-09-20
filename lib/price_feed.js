// Real-time decoupled market price feed

let cachedPrices = {
  BTC: { usd: 80450, idr: 80450 * 17800 },
  HYPE: { usd: 90.95, idr: 90.95 * 17800 },
  USDC: { usd: 1.0, idr: 17800 },
  USD_IDR: 17800,
  lastUpdated: 0
};

/**
 * Fetches latest prices from public APIs (Hyperliquid L1, Binance, CoinGecko) with fallback cache
 */
async function getMarketPrices() {
  // Return cache if less than 15 seconds old
  if (Date.now() - cachedPrices.lastUpdated < 15000 && cachedPrices.lastUpdated > 0) {
    return cachedPrices;
  }

  // 1. Fetch Hyperliquid L1 official API (Official node mid prices for HYPE and BTC)
  try {
    const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' })
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

  // 2. Fetch Binance BTCUSDT ticker as secondary check
  try {
    const binanceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    if (binanceRes.ok) {
      const data = await binanceRes.json();
      const btcPrice = parseFloat(data.price);
      if (btcPrice > 0) cachedPrices.BTC.usd = parseFloat(btcPrice.toFixed(2));
    }
  } catch (err) {
    // Keep cached BTC price
  }

  // 3. Fetch CoinGecko prices for USD/IDR conversion rate and fallback
  try {
    const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hyperliquid&vs_currencies=usd,idr');
    if (cgRes.ok) {
      const data = await cgRes.json();
      if (data.bitcoin && data.bitcoin.usd && data.bitcoin.idr) {
        const rate = Math.round(data.bitcoin.idr / data.bitcoin.usd);
        if (rate > 10000 && rate < 25000) {
          cachedPrices.USD_IDR = rate;
        }
      }
      if (data.hyperliquid && data.hyperliquid.usd && !cachedPrices.HYPE.usd) {
        cachedPrices.HYPE.usd = data.hyperliquid.usd;
      }
    }
  } catch (err) {
    // Keep cached
  }

  // Ensure IDR prices are synchronized with USD_IDR rate
  const rate = cachedPrices.USD_IDR || 17800;
  cachedPrices.BTC.idr = Math.round(cachedPrices.BTC.usd * rate);
  cachedPrices.HYPE.idr = Math.round(cachedPrices.HYPE.usd * rate);
  cachedPrices.lastUpdated = Date.now();

  return cachedPrices;
}

module.exports = {
  getMarketPrices
};

