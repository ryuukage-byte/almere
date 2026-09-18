const db = require('../db/index.js');
const { getMarketPrices } = require('./price_feed.js');

/**
 * Recalculates entire portfolio state from confirmed transactions and live market feeds.
 * Starts from pure zero ledger (no fake/seed money).
 */
async function calculatePortfolio() {
  const prices = await getMarketPrices();
  const usdIdrRate = prices.USD_IDR || 16250;

  // Ledger starts completely empty
  const holdings = {};
  let cashIdr = 0;
  let realizedPnlIdr = 0;

  // Fetch all completed transactions from PostgreSQL
  const txResult = await db.query(
    'SELECT * FROM transactions WHERE status = $1 ORDER BY tx_timestamp ASC, id ASC',
    ['COMPLETED']
  );

  const transactions = txResult.rows;

  for (const tx of transactions) {
    const asset = (tx.asset || '').toUpperCase().trim();
    const qty = parseFloat(tx.quantity) || 0;
    const rate = parseFloat(tx.rate_idr) || 0;
    const amount = parseFloat(tx.amount_idr) || 0;
    const fee = parseFloat(tx.fee_idr) || 0;
    const received = parseFloat(tx.total_received) || qty;

    if (tx.type === 'DEPOSIT') {
      cashIdr += (amount - fee);
    } else if (tx.type === 'WITHDRAWAL') {
      cashIdr -= (amount + fee);
    } else if (tx.type === 'BUY') {
      cashIdr -= amount;
      const assetName = asset === 'HYPE' ? 'Hyperliquid'
        : asset === 'BTC' ? 'Bitcoin'
        : asset === 'ETH' ? 'Ethereum'
        : asset === 'SOL' ? 'Solana'
        : asset;

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
        const costPortion = (holdings[asset].avgBuyPriceIdr || 0) * qty;
        realizedPnlIdr += (netIdr - costPortion);
        holdings[asset].quantity = Math.max(0, holdings[asset].quantity - qty);
        holdings[asset].totalCostIdr = Math.max(0, holdings[asset].totalCostIdr - costPortion);
      }
    }
  }

  // Prevent negative cash display on public UI if buy happened without recorded deposit
  const effectiveCashIdr = Math.max(0, cashIdr);
  const holdingsList = [];

  // 1. Process Asset Holdings
  for (const key of Object.keys(holdings)) {
    const item = holdings[key];
    if (item.quantity <= 0.000001) continue;

    let currentPriceUsd = 0;
    if (item.lastRateIdr > 0) {
      currentPriceUsd = item.lastRateIdr / usdIdrRate;
    } else if (prices[key]?.usd) {
      currentPriceUsd = prices[key].usd;
    } else if (prices.BTC.usd && key === 'BTC') {
      currentPriceUsd = prices.BTC.usd;
    }
    const currentPriceIdr = currentPriceUsd * usdIdrRate;

    const valIdr = item.quantity * currentPriceIdr;
    const valUsd = item.quantity * currentPriceUsd;

    const unrealizedPnlIdr = valIdr - item.totalCostIdr;
    const unrealizedPnlPct = item.totalCostIdr > 0 ? (unrealizedPnlIdr / item.totalCostIdr) * 100 : 0;

    holdingsList.push({
      code: item.code,
      name: item.name,
      quantity: item.quantity,
      unitsText: `${item.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${item.code}`,
      currentPriceUsd: parseFloat(currentPriceUsd.toFixed(2)),
      currentPriceIdr: Math.round(currentPriceIdr),
      valueUsd: Math.round(valUsd),
      valueIdr: Math.round(valIdr),
      unrealizedPnlIdr: Math.round(unrealizedPnlIdr),
      unrealizedPnlPct: parseFloat(unrealizedPnlPct.toFixed(2)),
      change30d: item.change30d
    });
  }

  // 2. Process Cash Holding (only if cash > 0)
  const cashUsd = Math.round(effectiveCashIdr / usdIdrRate);
  if (effectiveCashIdr > 0) {
    holdingsList.push({
      code: 'CASH',
      name: 'Kas Tunai',
      quantity: cashUsd,
      unitsText: `Rp ${Math.round(effectiveCashIdr).toLocaleString('id-ID')} · Cadangan Kas`,
      currentPriceUsd: 1,
      currentPriceIdr: usdIdrRate,
      valueUsd: cashUsd,
      valueIdr: Math.round(effectiveCashIdr),
      unrealizedPnlIdr: 0,
      unrealizedPnlPct: 0,
      change30d: '0.0%'
    });
  }

  // 3. Compute Totals & Exact Allocations
  const totalPortfolioUsd = holdingsList.reduce((sum, h) => sum + (h.valueUsd || 0), 0);
  const totalPortfolioIdr = holdingsList.reduce((sum, h) => sum + (h.valueIdr || 0), 0);

  holdingsList.forEach(item => {
    item.allocationPct = totalPortfolioUsd > 0
      ? parseFloat(((item.valueUsd / totalPortfolioUsd) * 100).toFixed(1))
      : 0;
  });

  // Sort holdings by value descending (largest cut first)
  holdingsList.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

  const fs = require('fs');
  const path = require('path');

  const result = {
    totalValuationUsd: Math.round(totalPortfolioUsd),
    totalValuationIdr: Math.round(totalPortfolioIdr),
    usdIdrRate,
    holdings: holdingsList,
    cashBalanceIdr: Math.round(effectiveCashIdr),
    cashBalanceUsd: cashUsd,
    realizedPnlIdr: Math.round(realizedPnlIdr),
    marketPrices: {
      BTC: prices.BTC,
      HYPE: prices.HYPE
    },
    transactionCount: transactions.length,
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

module.exports = {
  calculatePortfolio
};

