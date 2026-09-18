// Real-time decoupled market price feed

let cachedPrices = {
  BTC: { usd: 118900, idr: 118900 * 16250 },
  HYPE: { usd: 42.5, idr: 42.5 * 16250 },
  USDC: { usd: 1.0, idr: 16250 },
  USD_IDR: 16250,
  lastUpdated: Date.now()
};

/**
 * Fetches latest prices from public APIs (CoinGecko / Binance) with fallback cache
 */
async function getMarketPrices() {
  // If cache is less than 60 seconds old, return cache
  if (Date.now() - cachedPrices.lastUpdated < 60000) {
    return cachedPrices;
  }

  try {
    // 1. Fetch Binance BTCUSDT ticker
    const binanceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    if (binanceRes.ok) {
      const data = await binanceRes.json();
      const btcPrice = parseFloat(data.price);
      if (btcPrice > 0) cachedPrices.BTC.usd = btcPrice;
    }
  } catch (err) {
    // Keep cached BTC price
  }

  try {
    // 2. Fetch CoinGecko prices for Hyperliquid (hyperliquid) & Bitcoin
    const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hyperliquid&vs_currencies=usd,idr');
    if (cgRes.ok) {
      const data = await cgRes.json();
      if (data.bitcoin) {
        if (data.bitcoin.usd) cachedPrices.BTC.usd = data.bitcoin.usd;
        if (data.bitcoin.idr) {
          cachedPrices.BTC.idr = data.bitcoin.idr;
          if (cachedPrices.BTC.usd > 0) {
            cachedPrices.USD_IDR = Math.round(data.bitcoin.idr / cachedPrices.BTC.usd);
          }
        }
      }
      if (data.hyperliquid) {
        if (data.hyperliquid.usd) cachedPrices.HYPE.usd = data.hyperliquid.usd;
        if (data.hyperliquid.idr) cachedPrices.HYPE.idr = data.hyperliquid.idr;
      }
    }
  } catch (err) {
    // Keep cached
  }

  // Ensure IDR prices are synced with USD_IDR rate
  const rate = cachedPrices.USD_IDR || 16250;
  cachedPrices.BTC.idr = cachedPrices.BTC.usd * rate;
  cachedPrices.HYPE.idr = cachedPrices.HYPE.usd * rate;
  cachedPrices.lastUpdated = Date.now();

  return cachedPrices;
}

module.exports = {
  getMarketPrices
};
