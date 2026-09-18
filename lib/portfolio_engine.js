const db = require('../db/index.js');
const { getMarketPrices } = require('./price_feed.js');

/**
 * Recalculates entire portfolio state from confirmed transactions and live market feeds.
 */
async function calculatePortfolio() {
  const prices = await getMarketPrices();
  const usdIdrRate = prices.USD_IDR || 16250;

  // Base starting holdings from Almere & Co specification
  // New confirmed transactions will adjust and accumulate on top of this ledger
  const holdings = {
    BTC: {
      name: 'Bitcoin',
      code: 'BTC',
      quantity: 1.24,
      totalCostIdr: 1.24 * 105000 * usdIdrRate,
      avgBuyPriceIdr: 105000 * usdIdrRate,
      change30d: '+9.4%'
    },
    HYPE: {
      name: 'Hyperliquid',
      code: 'HYPE',
      quantity: 2150,
      totalCostIdr: 2150 * 35 * usdIdrRate,
      avgBuyPriceIdr: 35 * usdIdrRate,
      change30d: '+21.6%'
    }
  };

  let cashIdr = 15220 * usdIdrRate; // Seed cash
  let realizedPnlIdr = 0;

  // Fetch all completed transactions from PostgreSQL
  const txResult = await db.query(
    'SELECT * FROM transactions WHERE status = $1 ORDER BY tx_timestamp ASC, id ASC',
    ['COMPLETED']
  );

  const transactions = txResult.rows;

  for (const tx of transactions) {
    const asset = (tx.asset || '').toUpperCase();
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
      if (!holdings[asset]) {
        holdings[asset] = {
          name: asset,
          code: asset,
          quantity: 0,
          totalCostIdr: 0,
          avgBuyPriceIdr: 0,
          change30d: '+0.0%'
        };
      }
      holdings[asset].quantity += received;
      holdings[asset].totalCostIdr += amount;
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

  // Calculate current valuations
  let totalPortfolioIdr = Math.max(0, cashIdr);
  let totalPortfolioUsd = Math.max(0, cashIdr) / usdIdrRate;

  const holdingsList = [];

  for (const key of Object.keys(holdings)) {
    const item = holdings[key];
    if (item.quantity <= 0) continue;

    const currentPriceUsd = prices[key]?.usd || (prices.BTC.usd && key === 'BTC' ? prices.BTC.usd : 0);
    const currentPriceIdr = currentPriceUsd * usdIdrRate;

    const valIdr = item.quantity * currentPriceIdr;
    const valUsd = item.quantity * currentPriceUsd;

    totalPortfolioIdr += valIdr;
    totalPortfolioUsd += valUsd;

    const unrealizedPnlIdr = valIdr - item.totalCostIdr;
    const unrealizedPnlPct = item.totalCostIdr > 0 ? (unrealizedPnlIdr / item.totalCostIdr) * 100 : 0;

    holdingsList.push({
      code: item.code,
      name: item.name,
      quantity: item.quantity,
      unitsText: `${item.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${item.code}`,
      currentPriceUsd,
      currentPriceIdr,
      valueUsd: Math.round(valUsd),
      valueIdr: Math.round(valIdr),
      unrealizedPnlIdr: Math.round(unrealizedPnlIdr),
      unrealizedPnlPct: parseFloat(unrealizedPnlPct.toFixed(2)),
      change30d: item.change30d
    });
  }

  // Add Cash as holding item
  const cashUsd = Math.round(cashIdr / usdIdrRate);
  holdingsList.push({
    code: 'CASH',
    name: 'Kas Tunai',
    quantity: cashUsd,
    unitsText: 'USDC / USD · Cadangan Kas',
    currentPriceUsd: 1,
    currentPriceIdr: usdIdrRate,
    valueUsd: cashUsd,
    valueIdr: Math.round(cashIdr),
    unrealizedPnlIdr: 0,
    unrealizedPnlPct: 0,
    change30d: '-1.1%'
  });

  // Calculate Allocations
  holdingsList.forEach(item => {
    item.allocationPct = totalPortfolioUsd > 0
      ? parseFloat(((item.valueUsd / totalPortfolioUsd) * 100).toFixed(1))
      : 0;
  });

  return {
    totalValuationUsd: Math.round(totalPortfolioUsd),
    totalValuationIdr: Math.round(totalPortfolioIdr),
    usdIdrRate,
    holdings: holdingsList,
    cashBalanceIdr: Math.round(cashIdr),
    cashBalanceUsd: cashUsd,
    realizedPnlIdr: Math.round(realizedPnlIdr),
    marketPrices: {
      BTC: prices.BTC,
      HYPE: prices.HYPE
    },
    transactionCount: transactions.length,
    lastUpdated: new Date().toISOString()
  };
}

module.exports = {
  calculatePortfolio
};
