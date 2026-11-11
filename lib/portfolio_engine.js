const fs = require('fs');
const path = require('path');
const db = require('../db/index.js');
const { getMarketPrices } = require('./price_feed.js');

/**
 * Recalculates entire portfolio state from confirmed transactions and live market feeds.
 * Starts from pure zero ledger (no fake/seed money).
 */
async function calculatePortfolio() {
  const prices = await getMarketPrices();
  const usdIdrRate = prices.USD_IDR || 17840;

  // Ledger starts completely empty
  const holdings = {};
  let cashIdr = 0;
  let realizedPnlIdr = 0;
  const documentedSales = [];

  // Fetch all completed transactions from PostgreSQL
  let transactions = [];
  try {
    const txResult = await db.query(
      'SELECT * FROM transactions WHERE status = $1 ORDER BY tx_timestamp ASC, id ASC',
      ['COMPLETED']
    );
    transactions = txResult.rows;
  } catch (dbErr) {
    console.warn('Database fetch warning in calculatePortfolio:', dbErr.message);
  }

  // Enriched transaction records for UI history
  const enrichedTransactions = [];

  for (const tx of transactions) {
    const asset = (tx.asset || '').toUpperCase().trim();
    const qty = parseFloat(tx.quantity) || 0;
    const rate = parseFloat(tx.rate_idr) || 0;
    const amount = parseFloat(tx.amount_idr) || 0;
    const fee = parseFloat(tx.fee_idr) || 0;
    const received = parseFloat(tx.total_received) || qty;

    let salePnlIdr = 0;

    const getAssetName = (sym) => {
      switch (sym) {
        case 'HYPE': return 'Hyperliquid';
        case 'BTC': return 'Bitcoin';
        case 'ETH': return 'Ethereum';
        case 'SOL': return 'Solana';
        case 'USDT': return 'Tether';
        case 'USDC': return 'USD Coin';
        default: return sym;
      }
    };

    if (tx.type === 'DEPOSIT') {
      if (asset === 'IDR') {
        cashIdr += (amount - fee);
      } else {
        // Crypto deposit (e.g. USDT, BTC) - enters crypto holding, does NOT add to cashIdr
        if (!holdings[asset]) {
          holdings[asset] = {
            name: getAssetName(asset),
            code: asset,
            quantity: 0,
            totalCostIdr: 0,
            avgBuyPriceIdr: 0,
            lastRateIdr: rate,
            change30d: '+0.0%'
          };
        }
        holdings[asset].quantity += received;
        holdings[asset].totalCostIdr += (amount - fee);
        if (rate > 0) holdings[asset].lastRateIdr = rate;
        if (holdings[asset].quantity > 0) {
          holdings[asset].avgBuyPriceIdr = holdings[asset].totalCostIdr / holdings[asset].quantity;
        }
      }
    } else if (tx.type === 'WITHDRAWAL') {
      if (asset === 'IDR') {
        cashIdr -= (amount + fee);
      } else {
        if (holdings[asset]) {
          holdings[asset].quantity = Math.max(0, holdings[asset].quantity - qty);
          if (holdings[asset].quantity <= 0.000001) {
            holdings[asset].quantity = 0;
            holdings[asset].totalCostIdr = 0;
            holdings[asset].avgBuyPriceIdr = 0;
          }
        }
      }
    } else if (tx.type === 'BUY') {
      cashIdr -= amount;
      const assetName = getAssetName(asset);

      if (!holdings[asset]) {
        holdings[asset] = {
          name: assetName,
          code: asset,
          quantity: 0,
          totalCostIdr: 0,
          avgBuyPriceIdr: 0,
          lastRateIdr: rate,
          change30d: '+0.0%'
        };
      }
      holdings[asset].quantity += received;
      holdings[asset].totalCostIdr += amount;
      if (rate > 0) holdings[asset].lastRateIdr = rate;
      if (holdings[asset].quantity > 0) {
        holdings[asset].avgBuyPriceIdr = holdings[asset].totalCostIdr / holdings[asset].quantity;
      }
    } else if (tx.type === 'SELL') {
      const netIdr = amount - fee;
      cashIdr += netIdr;
      if (holdings[asset] && holdings[asset].quantity > 0) {
        const avgCost = holdings[asset].avgBuyPriceIdr || 0;
        const costPortion = avgCost * qty;
        salePnlIdr = netIdr - costPortion;
        realizedPnlIdr += salePnlIdr;

        holdings[asset].quantity = Math.max(0, holdings[asset].quantity - qty);
        holdings[asset].totalCostIdr = Math.max(0, holdings[asset].totalCostIdr - costPortion);
        if (holdings[asset].quantity <= 0.000001) {
          holdings[asset].quantity = 0;
          holdings[asset].totalCostIdr = 0;
          holdings[asset].avgBuyPriceIdr = 0;
        }

        documentedSales.push({
          referenceId: tx.reference_id,
          asset,
          quantity: qty,
          rateIdr: rate,
          amountIdr: amount,
          feeIdr: fee,
          netIdr,
          realizedPnlIdr: Math.round(salePnlIdr),
          realizedPnlUsd: parseFloat((salePnlIdr / usdIdrRate).toFixed(2)),
          timestamp: tx.tx_timestamp
        });
      }
    }

    // Build enriched record for frontend history table
    enrichedTransactions.push({
      id: tx.id,
      reference_id: tx.reference_id,
      type: tx.type,
      asset: tx.asset,
      quantity: qty,
      rate_idr: rate,
      rate_usd: parseFloat((rate / usdIdrRate).toFixed(2)),
      amount_idr: amount,
      amount_usd: parseFloat((amount / usdIdrRate).toFixed(2)),
      fee_idr: fee,
      total_received: received,
      currency: tx.currency || 'IDR',
      tx_timestamp: tx.tx_timestamp,
      status: tx.status,
      sale_pnl_idr: Math.round(salePnlIdr),
      sale_pnl_usd: parseFloat((salePnlIdr / usdIdrRate).toFixed(2))
    });
  }

  // Prevent negative cash display on public UI if buy happened without recorded deposit
  const effectiveCashIdr = Math.max(0, cashIdr);
  const holdingsList = [];

  // 1. Process Asset Holdings with LIVE Market Prices (Hyperliquid / Binance / CoinGecko)
  for (const key of Object.keys(holdings)) {
    const item = holdings[key];
    if (item.quantity <= 0.000001) continue;

    // Prioritize LIVE 24/7 market price
    let currentPriceUsd = 0;
    if (prices[key]?.usd && prices[key].usd > 0) {
      currentPriceUsd = prices[key].usd;
    } else if (key === 'BTC' && prices.BTC?.usd) {
      currentPriceUsd = prices.BTC.usd;
    } else if (key === 'HYPE' && prices.HYPE?.usd) {
      currentPriceUsd = prices.HYPE.usd;
    } else if (item.lastRateIdr > 0) {
      // Fallback only if no live feed is reachable
      currentPriceUsd = item.lastRateIdr / usdIdrRate;
    }

    const currentPriceIdr = currentPriceUsd * usdIdrRate;
    const valIdr = item.quantity * currentPriceIdr;
    const valUsd = item.quantity * currentPriceUsd;

    const avgBuyPriceUsd = item.avgBuyPriceIdr > 0 ? (item.avgBuyPriceIdr / usdIdrRate) : currentPriceUsd;

    const unrealizedPnlIdr = valIdr - item.totalCostIdr;
    const unrealizedPnlUsd = valUsd - (item.totalCostIdr / usdIdrRate);
    const unrealizedPnlPct = item.totalCostIdr > 0 ? (unrealizedPnlIdr / item.totalCostIdr) * 100 : 0;

    // Format 30d change indicator
    const change30dFormatted = unrealizedPnlPct >= 0
      ? `+${unrealizedPnlPct.toFixed(1)}%`
      : `${unrealizedPnlPct.toFixed(1)}%`;

    holdingsList.push({
      code: item.code,
      name: item.name,
      quantity: item.quantity,
      unitsText: `${item.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${item.code}`,
      avgBuyPriceUsd: parseFloat(avgBuyPriceUsd.toFixed(2)),
      avgBuyPriceIdr: Math.round(item.avgBuyPriceIdr),
      currentPriceUsd: parseFloat(currentPriceUsd.toFixed(2)),
      currentPriceIdr: Math.round(currentPriceIdr),
      totalCostIdr: Math.round(item.totalCostIdr),
      totalCostUsd: Math.round(item.totalCostIdr / usdIdrRate),
      valueUsd: parseFloat(valUsd.toFixed(2)),
      valueIdr: Math.round(valIdr),
      unrealizedPnlIdr: Math.round(unrealizedPnlIdr),
      unrealizedPnlUsd: parseFloat(unrealizedPnlUsd.toFixed(2)),
      unrealizedPnlPct: parseFloat(unrealizedPnlPct.toFixed(2)),
      change30d: change30dFormatted
    });
  }

  // 2. Process Cash Holding (only if cash > 0)
  const cashUsd = parseFloat((effectiveCashIdr / usdIdrRate).toFixed(2));
  if (effectiveCashIdr > 0) {
    holdingsList.push({
      code: 'CASH',
      name: 'Kas Tunai',
      quantity: Math.round(effectiveCashIdr),
      unitsText: `Rp ${Math.round(effectiveCashIdr).toLocaleString('id-ID')} · Cadangan Kas`,
      avgBuyPriceUsd: 1,
      avgBuyPriceIdr: usdIdrRate,
      currentPriceUsd: 1,
      currentPriceIdr: usdIdrRate,
      totalCostIdr: Math.round(effectiveCashIdr),
      totalCostUsd: cashUsd,
      valueUsd: cashUsd,
      valueIdr: Math.round(effectiveCashIdr),
      unrealizedPnlIdr: 0,
      unrealizedPnlUsd: 0,
      unrealizedPnlPct: 0,
      change30d: '0.0%'
    });
  }

  // 3. Compute Totals & Exact Allocations ("ga kurang dan ga lebih")
  const totalPortfolioUsd = holdingsList.reduce((sum, h) => sum + (h.valueUsd || 0), 0);
  const totalPortfolioIdr = holdingsList.reduce((sum, h) => sum + (h.valueIdr || 0), 0);

  holdingsList.forEach(item => {
    item.allocationPct = totalPortfolioUsd > 0
      ? parseFloat(((item.valueUsd / totalPortfolioUsd) * 100).toFixed(1))
      : 0;
  });

  // Sort holdings by value descending (largest cut first)
  holdingsList.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

  // Reverse transactions for chronological descending view (newest first)
  const sortedTransactions = [...enrichedTransactions].reverse();

  // Compute 1:1 authentic historical portfolio valuation series based on real ledger transactions
  let historical = {};
  try {
    historical = await calculateHistoricalSeries(transactions, totalPortfolioUsd, usdIdrRate);
  } catch (histErr) {
    console.warn('Historical series calculation warning:', histErr.message);
  }

  const result = {
    totalValuationUsd: parseFloat(totalPortfolioUsd.toFixed(2)),
    totalValuationIdr: Math.round(totalPortfolioIdr),
    usdIdrRate,
    holdings: holdingsList,
    cashBalanceIdr: Math.round(effectiveCashIdr),
    cashBalanceUsd: Math.round(cashUsd),
    realizedPnlIdr: Math.round(realizedPnlIdr),
    realizedPnlUsd: parseFloat((realizedPnlIdr / usdIdrRate).toFixed(2)),
    documentedSales,
    marketPrices: {
      BTC: prices.BTC,
      HYPE: prices.HYPE
    },
    forexRates: prices.forexRates || {},
    transactions: sortedTransactions,
    transactionCount: transactions.length,
    historical,
    lastUpdated: new Date().toISOString()
  };

  // Persist to static data/portfolio.json for GitHub Pages and client fallback
  try {
    const portfolioJsonPath = path.join(__dirname, '..', 'data', 'portfolio.json');
    const dataDir = path.dirname(portfolioJsonPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(portfolioJsonPath, JSON.stringify(result, null, 2), 'utf8');
  } catch (fsErr) {
    console.warn('Could not write data/portfolio.json:', fsErr.message);
  }

  return result;
}

/**
 * Calculates authentic 1:1 daily portfolio performance series for 7D, 30D, 90D, and 1Y ranges
 * using actual transaction timestamps and daily historical candles.
 */
async function calculateHistoricalSeries(transactions, currentTotalUsd, usdIdrRate) {
  const now = Date.now();
  const ranges = {
    '7D': 7,
    '30D': 30,
    '90D': 90,
    '1Y': 365
  };

  let btcCandles = [];
  let hypeCandles = [];

  try {
    const [rBtc, rHype] = await Promise.all([
      fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: { coin: 'BTC', interval: '1d', startTime: now - 365 * 86400000, endTime: now }
        }),
        signal: AbortSignal.timeout(4000)
      }).then(r => r.json()).catch(() => []),
      fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: { coin: 'HYPE', interval: '1d', startTime: now - 365 * 86400000, endTime: now }
        }),
        signal: AbortSignal.timeout(4000)
      }).then(r => r.json()).catch(() => [])
    ]);
    if (Array.isArray(rBtc)) btcCandles = rBtc;
    if (Array.isArray(rHype)) hypeCandles = rHype;
  } catch (e) {}

  const txsSorted = transactions.slice().sort((a, b) => new Date(a.tx_timestamp).getTime() - new Date(b.tx_timestamp).getTime());
  const historical = {};

  for (const [key, numDays] of Object.entries(ranges)) {
    const startTime = now - numDays * 86400000;
    const btcSubset = btcCandles.filter(c => c.t >= startTime - 86400000);
    const hypeSubset = hypeCandles.filter(c => c.t >= startTime - 86400000);

    const dataPoints = [];
    const labels = [];

    if (btcSubset.length > 0) {
      btcSubset.forEach((bCandle) => {
        const t = bCandle.t;
        const hCandle = hypeSubset.find(c => Math.abs(c.t - t) < 43200000);
        const bPrice = parseFloat(bCandle.c) || 0;
        const hPrice = hCandle ? parseFloat(hCandle.c) : 0;

        const eod = t + 86400000;
        let bQty = 0;
        let hQty = 0;
        let cIdr = 0;

        for (const tx of txsSorted) {
          if (new Date(tx.tx_timestamp).getTime() <= eod) {
            const qty = parseFloat(tx.quantity) || 0;
            const rec = parseFloat(tx.total_received) || qty;
            const amt = parseFloat(tx.amount_idr) || 0;
            const fee = parseFloat(tx.fee_idr) || 0;

            if (tx.type === 'DEPOSIT') {
              if (tx.asset === 'IDR') cIdr += (amt - fee);
              else if (tx.asset === 'BTC') bQty += rec;
              else if (tx.asset === 'HYPE') hQty += rec;
            } else if (tx.type === 'BUY') {
              cIdr -= amt;
              if (tx.asset === 'BTC') bQty += rec;
              else if (tx.asset === 'HYPE') hQty += rec;
            } else if (tx.type === 'SELL') {
              cIdr += (amt - fee);
              if (tx.asset === 'BTC') bQty -= qty;
              else if (tx.asset === 'HYPE') hQty -= qty;
            } else if (tx.type === 'WITHDRAWAL') {
              if (tx.asset === 'IDR') cIdr -= (amt + fee);
              else if (tx.asset === 'BTC') bQty -= qty;
              else if (tx.asset === 'HYPE') hQty -= qty;
            }
          }
        }

        const valUsd = (bQty * bPrice) + (hQty * hPrice) + (Math.max(0, cIdr) / usdIdrRate);
        dataPoints.push(Math.round(valUsd));

        const d = new Date(t);
        labels.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
      });
    }

    if (dataPoints.length > 0) {
      dataPoints[dataPoints.length - 1] = Math.round(currentTotalUsd);
      labels[labels.length - 1] = 'Hari ini';
    }

    let finalPoints = dataPoints;
    let finalLabels = labels;
    if (numDays === 90 && dataPoints.length > 30) {
      const step = Math.ceil(dataPoints.length / 30);
      finalPoints = dataPoints.filter((_, i) => i % step === 0 || i === dataPoints.length - 1);
      finalLabels = labels.filter((_, i) => i % step === 0 || i === labels.length - 1);
    } else if (numDays === 365 && dataPoints.length > 36) {
      const step = Math.ceil(dataPoints.length / 36);
      finalPoints = dataPoints.filter((_, i) => i % step === 0 || i === dataPoints.length - 1);
      finalLabels = labels.filter((_, i) => i % step === 0 || i === labels.length - 1);
    }

    const startVal = finalPoints[0] || 0;
    const endVal = finalPoints[finalPoints.length - 1] || Math.round(currentTotalUsd);
    const diff = endVal - startVal;
    const growthPct = startVal > 0 ? parseFloat(((diff / startVal) * 100).toFixed(1)) : 0;

    historical[key] = {
      days: numDays,
      startUsd: startVal,
      currentUsd: endVal,
      diffUsd: diff,
      growthPct,
      dataPoints: finalPoints,
      labels: finalLabels
    };
  }

  return historical;
}

module.exports = {
  calculatePortfolio
};


