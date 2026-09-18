require('dotenv').config();
const db = require('../db/index.js');
const { parseTransactionScreenshot } = require('./parser.js');
const { calculatePortfolio } = require('./portfolio_engine.js');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// In-memory cache for pending unconfirmed transactions by callback ID
const pendingTransactions = new Map();

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
  const rateText = tx.rate_idr ? `Rp ${Math.round(tx.rate_idr).toLocaleString('id-ID')}` : '-';
  const amountText = tx.amount_idr ? `Rp ${Math.round(tx.amount_idr).toLocaleString('id-ID')}` : '-';
  const feeText = tx.fee_idr ? `Rp ${Math.round(tx.fee_idr).toLocaleString('id-ID')}` : 'Gratis';

  return `
${typeIcon} *DETEKSI TRANSAKSI TRIV*

• *Tipe Transaksi:* ${tx.type} (${tx.asset})
• *Aset:* ${tx.asset}
• *Jumlah Aset:* ${tx.quantity} ${tx.asset}
• *Total Nilai (IDR):* ${amountText}
• *Kurs / Rate:* ${rateText}
• *Fee / Biaya:* ${feeText}
• *Total Diterima:* ${tx.total_received} ${tx.asset}
• *ID Referensi:* \`${tx.tx_id}\`
• *Waktu:* ${tx.date || 'Sekarang'}
• *Status Triv:* ${tx.status || 'Completed'}

_Apakah data di atas sudah sesuai?_
`.trim();
}

/**
 * Handles incoming message
 */
async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const text = msg.text?.trim() || '';

  // 1. Command /start
  if (text.startsWith('/start')) {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      parse_mode: 'Markdown',
      text: `
🛡️ *Almere & Co — Sentinel Bot Aktif*
Sistem Pelacak Portofolio Transparan & Terverifikasi.

Silakan *kirim foto screenshot konfirmasi transaksi dari Triv* kapan saja. Sistem AI OCR kami akan membaca dan mengurai data transaksi secara otomatis.

*Perintah yang Tersedia:*
• /portfolio - Ringkasan valuasi dan alokasi aset saat ini
• /transactions - Daftar transaksi terakhir yang tercatat di Ledger
• /help - Bantuan & tata cara verifikasi
      `.trim()
    });
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
      if (existing.rows.length > 0) {
        await callTelegramApi('sendMessage', {
          chat_id: chatId,
          parse_mode: 'Markdown',
          text: `⚠️ *Transaksi Duplikat:* Transaksi dengan ID \`${parsedData.tx_id}\` sudah pernah dicatat sebelumnya di Ledger.`
        });
        return;
      }

      // Generate a temporary session ID
      const pendingId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      pendingTransactions.set(pendingId, {
        parsedData,
        chatId
      });

      const cardText = formatTransactionCard(parsedData);

      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'Markdown',
        text: cardText,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Konfirmasi & Masukkan Ledger', callback_data: `confirm_${pendingId}` },
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
  const data = cq.data || '';
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;

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

      // Insert transaction into PostgreSQL
      await db.query(`
        INSERT INTO transactions (
          reference_id, type, asset, quantity, rate_idr, amount_idr, fee_idr,
          total_received, currency, tx_timestamp, status, source, raw_ocr
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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

      // Recalculate portfolio
      const updated = await calculatePortfolio();

      await callTelegramApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: '✅ Transaksi berhasil dicatat ke Ledger!'
      });

      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        text: `
✅ *TRANSAKSI BERHASIL DIKONFIRMASI*

Transaksi \`${tx.tx_id}\` (${tx.type} ${tx.quantity} ${tx.asset}) telah dimasukkan secara permanen ke PostgreSQL Ledger.

📊 *Valuasi Portofolio Terbaru:*
• Total: *$${updated.totalValuationUsd.toLocaleString('en-US')} USD* (~Rp ${updated.totalValuationIdr.toLocaleString('id-ID')})
• Website publik telah diperbarui secara otomatis.
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
