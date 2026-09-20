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
  const usdIdrRate = prices.USD_IDR || 17800;

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
    transactions: sortedTransactions,
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


