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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error_code: 408, description: 'Request timeout' };
    }
    throw err;
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
• /reset - Bersihkan seluruh transaksi (reset saldo ke $0)
• /help - Bantuan & tata cara verifikasi
      `.trim()
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

  // 4. Handle Screenshot Photos
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
        text: `❌ Gagal memproses gambar: ${err.message}\nPastikan gambar memuat struk/detail transaksi Triv yang jelas.`
      });
    }
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
        timeout: 10
      }, 20000);

      if (res.ok && Array.isArray(res.result)) {
        for (const update of res.result) {
          lastOffset = update.update_id;
          if (update.message) {
            await handleMessage(update.message);
          } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (err) {
      console.error('Telegram polling error:', err.message);
      await new Promise(r => setTimeout(r, 4000));
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
