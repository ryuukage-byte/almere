require('dotenv').config();
const db = require('../db/index.js');
const { parseTransactionScreenshot } = require('./parser.js');
const { calculatePortfolio } = require('./portfolio_engine.js');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// In-memory cache for pending unconfirmed transactions by callback ID
const pendingTransactions = new Map();

/**
 * Security: Checks if incoming Telegram user ID is on the authorized allowlist
 */
function isAuthorized(userId) {
  const rawList = process.env.AUTHORIZED_USERS || '';
  const allowed = rawList
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (allowed.length === 0) return true; // Fallback if allowlist not configured
  return allowed.includes(String(userId));
}

/**
 * Helper to call Telegram Bot API
 */
async function callTelegramApi(method, body = {}, timeoutMs = 45000) {
  if (!TELEGRAM_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN is not defined in .env');
    return { ok: false, error_code: 500, description: 'TELEGRAM_BOT_TOKEN missing' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const rawText = await res.text();
    let json;
    try {
      json = JSON.parse(rawText);
    } catch {
      json = { ok: false, error_code: res.status || 500, description: rawText.slice(0, 120) };
    }

    // Auto-fallback: If Markdown parsing fails due to reserved characters, retry as plain text
    if (!json.ok && body.parse_mode && (json.description || '').toLowerCase().includes("can't parse entities")) {
      console.warn('⚠️ Telegram Markdown parsing error, falling back to plain text...');
      const fallbackBody = { ...body };
      delete fallbackBody.parse_mode;
      return await callTelegramApi(method, fallbackBody, timeoutMs);
    }

    return json;
  } catch (err) {
    const isAbort = err.name === 'AbortError' || err.cause?.name === 'AbortError' || (err.message && err.message.includes('aborted'));
    if (isAbort) {
      return { ok: false, error_code: 408, description: 'Request timeout' };
    }
    return { ok: false, error_code: 503, description: err.message || 'Network fetch failed' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads image buffer from Telegram file_id
 */
async function downloadTelegramFile(fileId) {
  const fileRes = await callTelegramApi('getFile', { file_id: fileId });
  if (!fileRes.ok || !fileRes.result.file_path) {
    throw new Error('Gagal mendapatkan path file dari Telegram');
  }

  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileRes.result.file_path}`;
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Formats a transaction into a Telegram card
 */
function formatTransactionCard(tx) {
  const isBuy = tx.type === 'BUY';
  const isDeposit = tx.type === 'DEPOSIT';
  const isSell = tx.type === 'SELL';

  const typeIcon = isBuy ? '🟢' : isDeposit ? '💰' : isSell ? '🔴' : '🔄';
  const typeLabel = isSell ? 'PENJUALAN ASET (SELL)' : isBuy ? 'PEMBELIAN ASET (BUY)' : isDeposit ? 'DEPOSIT KAS (IDR)' : tx.type;
  const rateText = tx.rate_idr ? `Rp ${Math.round(tx.rate_idr).toLocaleString('id-ID')}` : '-';
  const amountText = tx.amount_idr ? `Rp ${Math.round(tx.amount_idr).toLocaleString('id-ID')}` : '-';
  const feeText = tx.fee_idr ? `Rp ${Math.round(tx.fee_idr).toLocaleString('id-ID')}` : 'Gratis';
  const netReceivedIdr = Math.max(0, (tx.amount_idr || 0) - (tx.fee_idr || 0));

  const receivedText = isSell
    ? `Rp ${Math.round(netReceivedIdr).toLocaleString('id-ID')} (Masuk ke Kas Tunai)`
    : `${tx.total_received} ${tx.asset}`;

  const notice = isSell
    ? `\n⚠️ *Pemberitahuan Transparansi:*\nSetelah dikonfirmasi, aset *${tx.asset}* akan otomatis dihapus dari Daftar Aset & Live Ticker di website publik (0 ${tx.asset} tersisa), dan penjualan tercatat di Riwayat Transaksi agar publik mengetahui Anda sudah tidak memegang aset ini.`
    : '\n_Apakah data di atas sudah sesuai?_';

  return `
${typeIcon} *DETEKSI TRANSAKSI TRIV*

• *Tipe Transaksi:* ${typeLabel}
• *Aset:* ${tx.asset}
• *Jumlah ${isSell ? 'Dijual' : 'Aset'}:* ${tx.quantity} ${tx.asset}
• *Total Nilai (IDR):* ${amountText}
• *Harga / Kurs:* ${rateText}
• *Fee / Biaya:* ${feeText}
• *Penerimaan Bersih:* ${receivedText}
• *ID Referensi:* \`${tx.tx_id}\`
• *Waktu:* ${tx.date || 'Sekarang'}
• *Status Triv:* ${tx.status || 'Completed'}
${notice}
`.trim();
}

/**
 * Handles incoming message
 */
async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const userId = msg.from?.id || chatId;
  const text = msg.text?.trim() || '';

  // 0. Security Firewall: Verify authorized user ID
  if (!isAuthorized(userId)) {
    console.warn(`⚠️ [Security Firewall] Akses ditolak dari Telegram ID: ${userId} (@${msg.from?.username || 'none'}, ${msg.from?.first_name || 'Anonymous'})`);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `⛔ *Akses Ditolak (Unauthorized)*\n\nMaaf, bot ini adalah bot operasional privat milik *Almere & Co*.\n\nAkun Telegram Anda (ID: \`${userId}\`) tidak terdaftar dalam daftar administrator yang berwenang.\n\nHubungi administrator sistem untuk meminta otorisasi.`
    });
    return;
  }

  // 1. Command /start
  if (text.startsWith('/start')) {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `
🛡️ *Almere & Co — Sentinel Bot Aktif*
Sistem Pelacak Portofolio Transparan & Terverifikasi.
Status: *Otorisasi Terverifikasi (Admin: ${userId})*

Silakan *kirim foto screenshot konfirmasi transaksi dari Triv* kapan saja. Sistem AI OCR kami akan membaca dan mengurai data transaksi secara otomatis.

*Perintah yang Tersedia:*
• /portfolio - Ringkasan valuasi dan alokasi aset saat ini
• /transactions - Daftar transaksi terakhir yang tercatat di Ledger
• /add - Input transaksi manual jika OCR gagal
• /ping - Tes koneksi & status bot
• /help - Bantuan & panduan lengkap
• /reset - Bersihkan seluruh transaksi (reset saldo ke $0)
• /upload_research - Panduan cara mempublikasikan riset baru
      `.trim()
    });
    return;
  }

  // 1.1 Command /ping
  if (text.startsWith('/ping')) {
    const uptimeSec = Math.floor(process.uptime());
    const uptimeMin = Math.floor(uptimeSec / 60);
    const uptimeHrs = Math.floor(uptimeMin / 60);
    const uptimeStr = uptimeHrs > 0 ? `${uptimeHrs}j ${uptimeMin % 60}m` : `${uptimeMin}m ${uptimeSec % 60}d`;
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `🏓 *Pong!*\n\n• *Status Bot:* Online & Aktif\n• *Database:* Terhubung ke Neon PostgreSQL\n• *Uptime Server:* ${uptimeStr}\n• *Admin ID:* \`${userId}\``
    });
    return;
  }

  // 1.2 Command /help
  if (text.startsWith('/help')) {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `
🛡️ *Panduan Penggunaan — Sentinel Bot*

*1. Mencatat Transaksi Otomatis (OCR):*
Kirim foto/screenshot bukti transaksi Triv Anda ke chat ini. Bot akan membaca data otomatis dan menampilkan tombol konfirmasi.

*2. Mencatat Transaksi Manual:*
Gunakan perintah \`/add\`:
Format: \`/add <BUY|SELL|DEPOSIT> <JUMLAH> <ASET> <TOTAL_IDR>\`
Contoh:
• \`/add BUY 1.25 HYPE 1800000\`
• \`/add SELL 1.25 HYPE 2100000\`
• \`/add DEPOSIT 5000000 IDR 5000000\`

*3. Perintah Informasi Portofolio:*
• /portfolio atau /status - Valuasi portofolio & alokasi aset
• /transactions - 5 transaksi terakhir di ledger
• /ping - Tes koneksi bot & status database
• /reset - Bersihkan seluruh transaksi (reset saldo ke $0)
• /upload_research - Panduan upload dokumen riset
      `.trim()
    });
    return;
  }

  // 1.3 Command /add or /manual
  if (text.startsWith('/add') || text.startsWith('/manual')) {
    const parts = text.split(/\s+/).slice(1);
    if (parts.length < 4) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `⚠️ *Format /add belum lengkap.*\n\nGunakan format:\n\`/add <BUY|SELL|DEPOSIT> <JUMLAH> <ASET> <TOTAL_IDR>\`\n\n*Contoh:*\n• \`/add BUY 1.277149 HYPE 1800000\`\n• \`/add SELL 1.277149 HYPE 2064844\`\n• \`/add DEPOSIT 5000000 IDR 5000000\``
      });
      return;
    }

    const rawType = parts[0].toUpperCase();
    const type = rawType.includes('SELL') ? 'SELL' : rawType.includes('DEP') ? 'DEPOSIT' : 'BUY';
    const quantity = parseFloat(parts[1].replace(/,/g, '')) || 0;
    const asset = parts[2].toUpperCase().replace(/[^A-Z0-9]/g, '');
    const amountIdr = parseFloat(parts[3].replace(/,/g, '')) || 0;
    const rateIdr = quantity > 0 && amountIdr > 0 ? amountIdr / quantity : 1;
    const feeIdr = parseFloat(parts[4]?.replace(/,/g, '')) || 0;

    const parsedData = {
      type,
      asset,
      quantity,
      rate_idr: Math.round(rateIdr),
      amount_idr: Math.round(amountIdr),
      fee_idr: Math.round(feeIdr),
      total_received: type === 'SELL' ? amountIdr - feeIdr : quantity,
      tx_id: `MANUAL-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      summary_text: `Manual Entry: ${type} ${quantity} ${asset}`,
      confidence: 'MANUAL'
    };

    const pendingId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    pendingTransactions.set(pendingId, {
      parsedData,
      chatId
    });

    const cardText = formatTransactionCard(parsedData);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `📝 *INPUT TRANSAKSI MANUAL*\n\n` + cardText,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Konfirmasi & Masukkan Ledger', callback_data: `confirm_${pendingId}` },
            { text: '❌ Batalkan', callback_data: `cancel_${pendingId}` }
          ]
        ]
      }
    });
    return;
  }

  // 1.5 Command /reset (Safe double-confirmation)
  if (text === '/reset') {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `⚠️ *KONFIRMASI PEMBERSIHAN LEDGER*\n\nAnda akan menghapus **seluruh data transaksi** di database PostgreSQL dan mengembalikan saldo portofolio publik ke *$0*.\n\nApakah Anda yakin ingin melanjutkan tindakan permanen ini?`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🧹 Ya, Bersihkan ke $0', callback_data: 'admin_reset_confirm' },
            { text: '❌ Batalkan', callback_data: 'admin_reset_cancel' }
          ]
        ]
      }
    });
    return;
  }

  if (text === '/reset_confirm') {
    try {
      await db.query('DELETE FROM transactions;');
      await calculatePortfolio();
      const { exec } = require('child_process');
      exec('git add data/portfolio.json && git commit -m "chore: reset portfolio ledger to $0" && git push origin main', () => {});

      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `🧹 *Ledger Berhasil Direset ke $0*\nSemua transaksi telah dibersihkan secara permanen. Saldo portofolio kembali ke *$0* dan tersinkronisasi ke publik.`
      });
    } catch (err) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: `❌ Gagal reset: ${err.message}`
      });
    }
    return;
  }

  // 2. Command /portfolio
  if (text.startsWith('/portfolio') || text.startsWith('/status')) {
    try {
      const p = await calculatePortfolio();
      let holdingsSummary = p.holdings.length > 0
        ? p.holdings.map(h => `• *${h.name}:* ${h.unitsText} (~$${h.valueUsd.toLocaleString()} · ${h.allocationPct}%)`).join('\n')
        : '_Belum ada aset aktif di ledger (Saldo $0). Kirim screenshot Triv untuk menambah transaksi._';

      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `
📊 *RINGKASAN PORTOFOLIO ALMERE & CO*

💵 *Total Valuasi:*
• *$${p.totalValuationUsd.toLocaleString('en-US')} USD*
• *Rp ${p.totalValuationIdr.toLocaleString('id-ID')} IDR*
• _Kurs USD/IDR: Rp ${p.usdIdrRate.toLocaleString('id-ID')}_

📈 *Rincian Aset Terverifikasi:*
${holdingsSummary}

🏛️ *Total Transaksi Ledger:* ${p.transactionCount} transaksi
🕒 *Sinkronisasi:* Real-time
        `.trim()
      });
    } catch (err) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: `❌ Gagal menghitung portofolio: ${err.message}`
      });
    }
    return;
  }

  // 3. Command /transactions
  if (text.startsWith('/transactions')) {
    try {
      const res = await db.query(
        'SELECT * FROM transactions ORDER BY tx_timestamp DESC LIMIT 5'
      );
      if (res.rows.length === 0) {
        await callTelegramApi('sendMessage', {
          chat_id: chatId,
          text: 'Belum ada transaksi di ledger. Kirimkan screenshot Triv untuk mencatat transaksi pertama.'
        });
        return;
      }

      let txList = res.rows.map((t, idx) => {
        return `${idx + 1}. *[${t.type}]* ${t.quantity} ${t.asset} (Rp ${Number(t.amount_idr).toLocaleString('id-ID')}) · \`${t.reference_id}\``;
      }).join('\n');

      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `📜 *5 Transaksi Terakhir di Ledger:*\n\n${txList}`
      });
    } catch (err) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: `❌ Gagal mengambil transaksi: ${err.message}`
      });
    }
    return;
  }

  // 4. Command /upload_research
  if (text.startsWith('/upload_research')) {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `📚 *Cara Mempublikasikan Riset Baru*\n\n1. Buat file \`.json\` berisi data riset Anda.\n2. Pastikan format file sesuai (mendukung satu objek atau array objek).\n3. *Kirim (Upload) file \`.json\` tersebut ke chat ini.*\n\nSistem akan otomatis mendeteksi, menggabungkan data riset baru ke database publik, dan mempublikasikannya ke website Almere & Co!`
    });
    return;
  }

  // 5. Handle JSON Document for Research Upload
  if (msg.document && msg.document.file_name && msg.document.file_name.endsWith('.json')) {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: '📄 Mengunduh dan memvalidasi file research paper...'
    });

    try {
      const fileBuffer = await downloadTelegramFile(msg.document.file_id);
      const newPapers = JSON.parse(fileBuffer.toString('utf8'));

      const fs = require('fs');
      const path = require('path');
      const papersPath = path.join(__dirname, '..', 'data', 'research_papers.json');

      let existingPapers = [];
      if (fs.existsSync(papersPath)) {
        try {
          existingPapers = JSON.parse(fs.readFileSync(papersPath, 'utf8'));
          if (!Array.isArray(existingPapers)) existingPapers = [];
        } catch (e) {
          existingPapers = [];
        }
      }

      function slugifyText(text) {
        return String(text || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');
      }

      function formatDateIndo(dateStr) {
        if (!dateStr) {
          const now = new Date();
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
          return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
        }
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
          return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        }
        return String(dateStr);
      }

      function normalizeResearch(raw) {
        const title = (raw.title || 'Publikasi Riset Almere').trim();
        const slug = raw.slug || slugifyText(title) || `research-${Date.now()}`;
        const id = raw.id || slug;
        const category = (raw.category && raw.category.trim()) ? raw.category.trim() : 'Macro';
        const date = raw.date || formatDateIndo(raw.publication_date);
        const author = raw.author || raw.brand || 'Almere Research Team';

        // Abstract fallback
        let abstract = raw.abstract || '';
        if (!abstract && Array.isArray(raw.sections)) {
          const sSec = raw.sections.find(s =>
            s.heading && (
              s.heading.toLowerCase().includes('ringkasan') ||
              s.heading.toLowerCase().includes('abstract') ||
              s.heading.toLowerCase().includes('summary')
            )
          );
          if (sSec && typeof sSec.content === 'string') {
            abstract = sSec.content;
          } else if (raw.sections[0] && typeof raw.sections[0].content === 'string') {
            abstract = raw.sections[0].content;
          }
        }

        // Key takeaways fallback
        let keyTakeaways = raw.keyTakeaways;
        if (!Array.isArray(keyTakeaways) && Array.isArray(raw.sections)) {
          const fSec = raw.sections.find(s =>
            s.heading && (
              s.heading.toLowerCase().includes('temuan') ||
              s.heading.toLowerCase().includes('takeaway') ||
              s.heading.toLowerCase().includes('poin')
            )
          );
          if (fSec && Array.isArray(fSec.content)) {
            keyTakeaways = fSec.content.map(String);
          }
        }

        // Methodology fallback
        let methodology = raw.methodology || '';
        if (!methodology && Array.isArray(raw.sections)) {
          const mSec = raw.sections.find(s =>
            s.heading && (
              s.heading.toLowerCase().includes('metodologi') ||
              s.heading.toLowerCase().includes('sumber')
            )
          );
          if (mSec) {
            if (typeof mSec.content === 'string') {
              methodology = mSec.content;
            } else if (Array.isArray(mSec.content)) {
              methodology = mSec.content.map(item => item.name ? `${item.name} (${item.title || ''})` : String(item)).join('; ');
            }
          }
        }

        const disclaimer = raw.disclaimer || raw.disclosure || 'Dokumen ini merupakan riset independen Almere & Co berdasarkan sumber publik. Bukan nasihat keuangan atau rekomendasi untuk membeli, menjual, atau menahan sekuritas.';

        return {
          id,
          slug,
          title,
          subtitle: raw.subtitle || '',
          category,
          date,
          publication_date: raw.publication_date || '',
          timestamp: raw.timestamp || (raw.publication_date ? new Date(raw.publication_date).getTime() : Date.now()),
          readTime: raw.readTime || '8 min read',
          author,
          brand: raw.brand || 'Almere&Co',
          language: raw.language || 'id',
          status: 'Published',
          abstract,
          keyTakeaways: Array.isArray(keyTakeaways) && keyTakeaways.length > 0 ? keyTakeaways : [
            'Publikasi riset ini telah diverifikasi dan disetujui oleh tim tata kelola Almere & Co.',
            'Data dan analisis disusun berdasarkan metodologi objektif yang dapat ditinjau oleh publik.'
          ],
          sections: Array.isArray(raw.sections) ? raw.sections : [],
          methodology: methodology || 'Data internal dan riset independen Almere & Co.',
          disclaimer
        };
      }

      const rawItems = Array.isArray(newPapers) ? newPapers : [newPapers];
      const normalizedPapers = rawItems.map(normalizeResearch);

      // Upsert: replace if slug or title matches, otherwise prepend
      for (const p of normalizedPapers) {
        const existingIdx = existingPapers.findIndex(ep =>
          (ep.slug && ep.slug === p.slug) ||
          (ep.id && ep.id === p.id) ||
          (ep.title && ep.title.toLowerCase() === p.title.toLowerCase())
        );

        if (existingIdx !== -1) {
          existingPapers[existingIdx] = p;
        } else {
          existingPapers.unshift(p);
        }
      }

      fs.writeFileSync(papersPath, JSON.stringify(existingPapers, null, 2), 'utf8');

      const { exec } = require('child_process');
      exec('git add data/research_papers.json && git commit -m "docs: publish research paper via Sentinel" && git push origin main', (gitErr) => {
        if (gitErr) {
          console.warn('⚠️ Auto git push warning:', gitErr.message);
        }
      });

      const linksSummary = normalizedPapers
        .map(p => `• *${p.title}*\n  📂 Kategori: *${p.category}* · 📅 ${p.date}\n  🌐 https://almereandco.com/research.html#${p.slug}`)
        .join('\n\n');

      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `✅ *Publikasi Riset Berhasil!*\n\nData telah dinormalisasi dan diintegrasikan ke website:\n\n${linksSummary}\n\n_Catatan: Jika membuka di browser HP (Instagram/Safari/Chrome), muat ulang halaman bila cache masih tersimpan._`
      });
    } catch (err) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: `❌ Gagal memproses file riset: ${err.message}`
      });
    }
    return;
  }

  // 6. Handle Screenshot Photos
  if (msg.photo && msg.photo.length > 0) {
    // Pick the highest resolution photo
    const photo = msg.photo[msg.photo.length - 1];
    const notifyMsg = await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: '🔍 Sedang memindai screenshot Triv dengan AI OCR...'
    });

    try {
      const imageBuffer = await downloadTelegramFile(photo.file_id);
      const parsedData = await parseTransactionScreenshot(imageBuffer, 'image/jpeg');

      // Check if reference ID already exists in DB
      const existing = await db.query('SELECT id FROM transactions WHERE reference_id = $1', [parsedData.tx_id]);
      const isExisting = existing.rows.length > 0;

      // Generate a temporary session ID
      const pendingId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      pendingTransactions.set(pendingId, {
        parsedData,
        chatId
      });

      const cardText = formatTransactionCard(parsedData);
      const duplicateNotice = isExisting
        ? `⚠️ *Transaksi Terdeteksi di Ledger (${parsedData.tx_id})*\n_Data ini sudah tercatat sebelumnya. Anda dapat memperbarui / menimpa data di Ledger:_\n\n`
        : '';

      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: duplicateNotice + cardText,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isExisting ? '🔄 Perbarui di Ledger' : '✅ Konfirmasi & Masukkan Ledger',
                callback_data: `confirm_${pendingId}`
              },
              { text: '❌ Batalkan', callback_data: `cancel_${pendingId}` }
            ]
          ]
        }
      });
    } catch (err) {
      console.error('Error processing screenshot:', err);
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `❌ *Gagal memproses gambar:* ${err.message}\n\n💡 *Solusi Alternatif:*\nAnda dapat mencatat transaksi secara manual memakai format:\n\`/add <BUY|SELL|DEPOSIT> <JUMLAH> <ASET> <TOTAL_IDR>\`\n\n*Contoh:*\n\`/add BUY 1.25 HYPE 1800000\``
      });
    }
    return;
  }

  // 7. Fallback for any other text messages (ensures bot never stays silently dead)
  if (text) {
    if (text.startsWith('/')) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `❓ Perintah \`${text.split(/\s+/)[0]}\` tidak dikenali.\n\nKetik /help untuk melihat panduan & daftar perintah yang tersedia.`
      });
    } else {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: `🤖 *Halo! Sentinel Bot Aktif & Siap*\n\nSilakan kirimkan screenshot struk Triv untuk dicatat ke ledger, atau gunakan perintah berikut:\n• /portfolio - Cek nilai portofolio saat ini\n• /transactions - Riwayat transaksi\n• /add - Input transaksi manual\n• /ping - Tes respon & status bot\n• /help - Panduan lengkap`
      });
    }
    return;
  }
}

/**
 * Handles inline button callbacks
 */
async function handleCallbackQuery(cq) {
  const userId = cq.from?.id;
  const data = cq.data || '';
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;

  // Security Firewall for Callback Queries
  if (!isAuthorized(userId)) {
    console.warn(`⚠️ [Security Firewall] Unauthorized callback query blocked from ID: ${userId}`);
    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: cq.id,
      text: '⛔ Akses ditolak: Anda tidak memiliki wewenang untuk tindakan ini.',
      show_alert: true
    });
    return;
  }

  // Admin Ledger Reset Confirmation
  if (data === 'admin_reset_confirm') {
    try {
      await db.query('DELETE FROM transactions;');
      await calculatePortfolio();
      const { exec } = require('child_process');
      exec('git add data/portfolio.json && git commit -m "chore: reset portfolio ledger to $0" && git push origin main', (gitErr) => {
        if (gitErr) console.warn('Git sync warning on reset:', gitErr.message);
      });

      await callTelegramApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: '🧹 Ledger berhasil dibersihkan ke $0.'
      });

      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        text: `🧹 *Ledger Berhasil Direset ke $0*\nSemua transaksi telah dibersihkan secara permanen. Saldo portofolio kembali ke *$0* dan tersinkronisasi ke publik.`
      });
    } catch (err) {
      await callTelegramApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: `❌ Gagal reset: ${err.message}`,
        show_alert: true
      });
    }
    return;
  } else if (data === 'admin_reset_cancel') {
    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Reset dibatalkan.'
    });
    await callTelegramApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: '✅ Tindakan reset dibatalkan. Ledger transaksi tetap aman.'
    });
    return;
  }

  if (data.startsWith('confirm_')) {
    const pendingId = data.replace('confirm_', '');
    const item = pendingTransactions.get(pendingId);

    if (!item) {
      await callTelegramApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Sesi transaksi telah kedaluwarsa atau sudah diproses.',
        show_alert: true
      });
      return;
    }

    const tx = item.parsedData;

    try {
      // Parse ISO timestamp or fallback to now
      let txTime = new Date();
      if (tx.date) {
        const parsedTime = new Date(tx.date);
        if (!isNaN(parsedTime.getTime())) txTime = parsedTime;
      }

      // Upsert transaction into PostgreSQL
      await db.query(`
        INSERT INTO transactions (
          reference_id, type, asset, quantity, rate_idr, amount_idr, fee_idr,
          total_received, currency, tx_timestamp, status, source, raw_ocr
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (reference_id) DO UPDATE SET
          type = EXCLUDED.type,
          asset = EXCLUDED.asset,
          quantity = EXCLUDED.quantity,
          rate_idr = EXCLUDED.rate_idr,
          amount_idr = EXCLUDED.amount_idr,
          fee_idr = EXCLUDED.fee_idr,
          total_received = EXCLUDED.total_received,
          tx_timestamp = EXCLUDED.tx_timestamp,
          status = EXCLUDED.status,
          raw_ocr = EXCLUDED.raw_ocr,
          updated_at = NOW()
      `, [
        tx.tx_id,
        tx.type,
        tx.asset,
        tx.quantity || 0,
        tx.rate_idr || 0,
        tx.amount_idr || 0,
        tx.fee_idr || 0,
        tx.total_received || tx.quantity || 0,
        'IDR',
        txTime,
        'COMPLETED',
        'TRIV_SCREENSHOT',
        JSON.stringify(tx)
      ]);

      pendingTransactions.delete(pendingId);

      // Recalculate portfolio (also updates data/portfolio.json)
      const updated = await calculatePortfolio();

      // Trigger automatic background git sync for GitHub Pages
      const { exec } = require('child_process');
      exec('git add data/portfolio.json && git commit -m "chore: auto-sync portfolio ledger" && git push origin main', (gitErr) => {
        if (gitErr) {
          console.warn('⚠️ Auto git push warning:', gitErr.message);
        } else {
          console.log('🚀 Successfully pushed data/portfolio.json to GitHub Pages.');
        }
      });

      await callTelegramApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: '✅ Transaksi berhasil dicatat ke Ledger!'
      });

      const isSell = tx.type === 'SELL';
      const confirmHeadline = isSell ? `🔴 *PENJUALAN ${tx.asset} BERHASIL DIKONFIRMASI*` : '✅ *TRANSAKSI BERHASIL DIKONFIRMASI*';
      const sellNote = isSell
        ? `• Status Posisi: *Aset ${tx.asset} resmi ditutup (0 ${tx.asset} tersisa)*\n• Website Publik: *${tx.asset} telah dihapus dari Daftar Aset & Ticker Publik*\n• Dana Hasil Jual: *Telah masuk ke Saldo Kas Tunai*`
        : `• Transaksi: \`${tx.tx_id}\` (${tx.type} ${tx.quantity} ${tx.asset})\n• Status: *Tercatat permanen di Ledger*`;

      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        text: `
${confirmHeadline}

${sellNote}

📊 *Valuasi Portofolio Terbaru:*
• Total: *$${updated.totalValuationUsd.toLocaleString('en-US')} USD* (~Rp ${updated.totalValuationIdr.toLocaleString('id-ID')})
• Website publik telah tersinkronisasi otomatis.
        `.trim()
      });
    } catch (err) {
      console.error('Error saving transaction:', err);
      await callTelegramApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: `Gagal menyimpan: ${err.message}`,
        show_alert: true
      });
    }
  } else if (data.startsWith('cancel_')) {
    const pendingId = data.replace('cancel_', '');
    pendingTransactions.delete(pendingId);

    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Transaksi dibatalkan.'
    });

    await callTelegramApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: '❌ Transaksi telah dibatalkan dan tidak dicatat ke Ledger.'
    });
  }
}

/**
 * Starts Long Polling loop
 */
let isPolling = false;
let lastOffset = 0;

async function startTelegramBot() {
  if (isPolling) return;
  isPolling = true;
  console.log('🤖 Telegram Sentinel Bot polling started...');

  while (isPolling) {
    try {
      const res = await callTelegramApi('getUpdates', {
        offset: lastOffset + 1,
        timeout: 20
      }, 35000);

      // Handle polling responses
      if (!res.ok) {
        if (res.error_code === 408) {
          // Standard timeout when no new updates arrive, proceed immediately
          continue;
        }

        if (res.error_code === 409) {
          // Conflict: Previous connection is closing or another bot instance polled
          console.warn('⚠️ [Telegram Conflict 409] Koneksi getUpdates bentrok atau proses lain sedang polling. Menunggu 5 detik...');
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        if (res.error_code === 429) {
          // Rate limited
          const retrySec = res.parameters?.retry_after || 10;
          console.warn(`⚠️ [Telegram Rate Limit 429] Terlalu banyak request. Menunggu ${retrySec} detik...`);
          await new Promise(r => setTimeout(r, retrySec * 1000));
          continue;
        }

        // Network error, 502 Bad Gateway, or DNS glitch
        console.warn(`⚠️ [Telegram Polling ${res.error_code}]: ${res.description || 'Koneksi terputus'}. Menghubungkan ulang dalam 3 detik...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      // Process updates
      if (Array.isArray(res.result)) {
        for (const update of res.result) {
          lastOffset = update.update_id;
          try {
            if (update.message) {
              await handleMessage(update.message);
            } else if (update.callback_query) {
              await handleCallbackQuery(update.callback_query);
            }
          } catch (handlerErr) {
            console.error(`❌ [Telegram Handler Error] Update ${update.update_id}:`, handlerErr.message);
          }
        }
      }
    } catch (loopErr) {
      console.error('⚠️ [Telegram Polling Loop Error]:', loopErr.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

function stopTelegramBot() {
  isPolling = false;
}

module.exports = {
  startTelegramBot,
  stopTelegramBot
};
