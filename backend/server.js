const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

process.on('uncaughtException', (err) => {
  console.error('⚠️ [Uncaught Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Unhandled Rejection]:', reason);
});

const http = require('http');
const fs = require('fs');
const db = require('../db/index.js');
const { calculatePortfolio } = require('../lib/portfolio_engine.js');
const { getMarketPrices } = require('../lib/price_feed.js');
const { startTelegramBot, stopTelegramBot } = require('../lib/telegram_bot.js');

const PORT = process.env.PORT || 4173;
const PID_FILE = path.join(__dirname, '..', '.bot.pid');

// Prevent multiple instances from running concurrently
try {
  if (fs.existsSync(PID_FILE)) {
    const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!isNaN(existingPid)) {
      try {
        process.kill(existingPid, 0); // throws error if process is dead
        console.warn(`⚠️ [Single Instance] Bot sudah berjalan dengan PID ${existingPid}. Proses ini dihentikan agar tidak bentrok.`);
        process.exit(0);
      } catch (e) {
        // Process is dead, proceed normally
      }
    }
  }
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
} catch (e) {
  // Ignore filesystem race conditions
}

function cleanupPid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const storedPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (storedPid === process.pid) {
        fs.unlinkSync(PID_FILE);
      }
    }
  } catch (e) {}
}

process.on('exit', cleanupPid);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
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

  // --- API ROUTE: /api/research ---
  if (reqPath === '/api/research') {
    const researchFilePath = path.join(__dirname, '..', 'data', 'research_papers.json');
    if (req.method === 'GET') {
      try {
        const raw = fs.readFileSync(researchFilePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(raw);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const newPaper = JSON.parse(body);
          let papers = [];
          if (fs.existsSync(researchFilePath)) {
            papers = JSON.parse(fs.readFileSync(researchFilePath, 'utf8'));
          }
          // Avoid duplicate ID
          papers = papers.filter(p => p.id !== newPaper.id);
          papers.unshift(newPaper);
          fs.writeFileSync(researchFilePath, JSON.stringify(papers, null, 2), 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, paper: newPaper }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // --- STATIC FILE SERVING ---
  const normalizedPath = path.normalize(reqPath).replace(/^[\\\/]+/, '');
  if (
    normalizedPath.startsWith('private') ||
    normalizedPath.startsWith('.env') ||
    normalizedPath.startsWith('.git') ||
    normalizedPath.startsWith('db') ||
    normalizedPath.startsWith('backend') ||
    normalizedPath.includes('..')
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  let filePathStr = reqPath === '/' ? '/index.html' : reqPath;
  if (reqPath === '/about' || reqPath === '/tentang') {
    filePathStr = '/about.html';
  }
  if (reqPath === '/research' || reqPath === '/riset') {
    filePathStr = '/research.html';
  }
  const filePath = path.join(__dirname, '..', filePathStr);
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

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`⚠️ [Port Conflict] Port ${PORT} sedang dipakai proses lain. Bot Telegram tetap berjalan normal.`);
  } else {
    console.error('⚠️ [Server Error]:', err.message);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Menghentikan server & bot Telegram secara aman...');
  stopTelegramBot();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  stopTelegramBot();
  server.close(() => process.exit(0));
});

// Startup sequence: Init DB (with auto-retry on boot/network delay) -> Start Telegram Bot -> Start HTTP Server
async function startApp() {
  let dbConnected = false;
  while (!dbConnected) {
    try {
      await db.initDatabase();
      dbConnected = true;
      console.log('✅ Connected to Neon PostgreSQL Database.');
    } catch (err) {
      console.warn(`⚠️ [Database Pending] Menunggu koneksi internet & PostgreSQL (${err.message}). Coba lagi dalam 5 detik...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Start Telegram Sentinel Bot
  startTelegramBot().catch(err => {
    console.error('Telegram bot startup error:', err);
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 Almere & Co Server running at http://127.0.0.1:${PORT}`);
    console.log(`🤖 Telegram Bot active: @SevntinelBot`);
  });
}

startApp();
