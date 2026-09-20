require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('⚠️ [Uncaught Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Unhandled Rejection]:', reason);
});

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db/index.js');
const { calculatePortfolio } = require('./lib/portfolio_engine.js');
const { getMarketPrices } = require('./lib/price_feed.js');
const { startTelegramBot } = require('./lib/telegram_bot.js');

const PORT = process.env.PORT || 4173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const urlParts = req.url.split('?');
  const reqPath = urlParts[0];

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API ROUTE: /api/portfolio/summary ---
  if (reqPath === '/api/portfolio/summary') {
    try {
      const summary = await calculatePortfolio();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(summary));
    } catch (err) {
      console.error('Error calculating portfolio summary:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // --- API ROUTE: /api/portfolio/transactions ---
  if (reqPath === '/api/portfolio/transactions') {
    try {
      const txRes = await db.query(
        'SELECT id, reference_id, type, asset, quantity, rate_idr, amount_idr, total_received, tx_timestamp, status, created_at FROM transactions ORDER BY tx_timestamp DESC LIMIT 20'
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ transactions: txRes.rows }));
    } catch (err) {
      console.error('Error fetching transactions:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // --- API ROUTE: /api/prices/live ---
  if (reqPath === '/api/prices/live') {
    try {
      const prices = await getMarketPrices();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(prices));
    } catch (err) {
      console.error('Error fetching live prices:', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // --- API ROUTE: /api/health ---
  if (reqPath === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'OK', uptime: process.uptime() }));
    return;
  }

  // --- STATIC FILE SERVING ---
  let filePathStr = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = path.join(__dirname, filePathStr);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// Startup sequence: Init DB -> Start Telegram Bot -> Start HTTP Server
async function startApp() {
  try {
    await db.initDatabase();
    console.log('✅ Connected to Neon PostgreSQL Database.');

    // Start Telegram Sentinel Bot
    startTelegramBot().catch(err => {
      console.error('Telegram bot startup error:', err);
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`🚀 Almere & Co Server running at http://127.0.0.1:${PORT}`);
      console.log(`🤖 Telegram Bot active: @SevntinelBot`);
    });
  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

startApp();
