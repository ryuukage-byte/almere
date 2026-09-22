// Real-time decoupled market price feed

let cachedPrices = {
  BTC: { usd: 85950, idr: 85950 * 17840 },
  HYPE: { usd: 95.5, idr: 95.5 * 17840 },
  USDC: { usd: 1.0, idr: 17840 },
  USD_IDR: 17840,
  forexRates: {},
  lastUpdated: 0
};

/**
 * Fetches latest prices from public APIs (Hyperliquid L1, Binance, CoinGecko, Indodax, open.er-api) with fallback cache
 */
async function getMarketPrices() {
  // Return cache if less than 15 seconds old
  if (Date.now() - cachedPrices.lastUpdated < 15000 && cachedPrices.lastUpdated > 0) {
    return cachedPrices;
  }

  // 1. Fetch live multi-currency Forex exchange rates (open.er-api.com & jsdelivr)
  try {
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
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

  // 1.5 Fetch Indodax tickers for benchmark Indonesian crypto prices (Triv benchmark)
  try {
    const [indodaxUsdt, indodaxBtc, indodaxHype] = await Promise.all([
      fetch('https://indodax.com/api/ticker/usdtidr').then(r => r.json()).catch(() => null),
      fetch('https://indodax.com/api/ticker/btcidr').then(r => r.json()).catch(() => null),
      fetch('https://indodax.com/api/ticker/hypeidr').then(r => r.json()).catch(() => null)
    ]);
    if (indodaxUsdt?.ticker?.last) {
      const lastUsdt = parseFloat(indodaxUsdt.ticker.last);
      if (lastUsdt > 10000 && lastUsdt < 25000) cachedPrices.USD_IDR = Math.round(lastUsdt);
    }
    if (indodaxBtc?.ticker?.last) {
      const lastBtc = parseFloat(indodaxBtc.ticker.last);
      if (lastBtc > 0) cachedPrices.BTC.idr = Math.round(lastBtc);
    }
    if (indodaxHype?.ticker?.last) {
      const lastHype = parseFloat(indodaxHype.ticker.last);
      if (lastHype > 0) cachedPrices.HYPE.idr = Math.round(lastHype);
    }
  } catch (err) {
    // Keep cached
  }

  // 2. Fetch Hyperliquid L1 official API (Official node mid prices for HYPE and BTC)
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

  // 3. Fetch Binance BTCUSDT ticker as secondary check
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

  // 4. Fetch Binance USDTIDR bookTicker for live stable crypto USD/IDR rate
  try {
    const usdtRes = await fetch('https://api.binance.com/api/v3/ticker/bookTicker?symbol=USDTIDR');
    if (usdtRes.ok) {
      const usdtData = await usdtRes.json();
      const bid = parseFloat(usdtData.bidPrice);
      const ask = parseFloat(usdtData.askPrice);
      if (bid > 10000 && ask < 25000) {
        const midRate = Math.round((bid + ask) / 2);
        cachedPrices.USD_IDR = midRate;
      }
    }
  } catch (err) {
    // Keep cached
  }

  // 5. Fetch CoinGecko prices for USD/IDR conversion rate and fallback
  try {
    const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hyperliquid&vs_currencies=usd,idr');
    if (cgRes.ok) {
      const data = await cgRes.json();
      if (data.bitcoin && data.bitcoin.usd && data.bitcoin.idr && !cachedPrices.USD_IDR) {
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

  // Ensure IDR and USD prices are synchronized with exact 1:1 rate parity
  const rate = cachedPrices.USD_IDR || 17818;
  if (cachedPrices.BTC.idr > 0) {
    cachedPrices.BTC.usd = parseFloat((cachedPrices.BTC.idr / rate).toFixed(2));
  } else if (cachedPrices.BTC.usd > 0) {
    cachedPrices.BTC.idr = Math.round(cachedPrices.BTC.usd * rate);
  }

  if (cachedPrices.HYPE.idr > 0) {
    cachedPrices.HYPE.usd = parseFloat((cachedPrices.HYPE.idr / rate).toFixed(2));
  } else if (cachedPrices.HYPE.usd > 0) {
    cachedPrices.HYPE.idr = Math.round(cachedPrices.HYPE.usd * rate);
  }
  cachedPrices.lastUpdated = Date.now();

  return cachedPrices;
}

module.exports = {
  getMarketPrices
};

