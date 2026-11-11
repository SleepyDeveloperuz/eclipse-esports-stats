// Eclipse Esports Stats — Local Telegram Bot Runner (Long-polling mode for local dev/testing)
import { existsSync } from 'node:fs';
import {
  isTelegramConfigured,
  getBotToken,
  handleTelegramWebhook,
  sendTelegramMessage,
  setBotCommands
} from '../lib/telegram-bot.js';
import {
  readBundle,
  approveSubmission,
  rejectSubmission,
  createSubmission
} from '../api/submissions.js';

// Load .env.local if present
if (existsSync('.env.local')) {
  try {
    process.loadEnvFile('.env.local');
  } catch (err) {
    console.warn('⚠️ .env.local yuklashda xatolik:', err.message);
  }
}

if (!isTelegramConfigured()) {
  console.error('❌ Xatolik: TELEGRAM_BOT_TOKEN topilmadi.');
  console.error('Iltimos, .env.local fayliga TELEGRAM_BOT_TOKEN=<token> ni kiriting.');
  process.exit(1);
}

const token = getBotToken();
const TELEGRAM_API_BASE = 'https://api.telegram.org';

async function getMe() {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getMe`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.description || 'Telegram bot tokeni yaroqsiz yoki tarmoq xatosi.');
  }
  return data.result;
}

async function startPolling() {
  let me;
  try {
    me = await getMe();
    await setBotCommands();
    console.log(`\n======================================================`);
    console.log(`🤖 ECLIPSE ESPORTS TELEGRAM BOT ISHGA TUSHDI!`);
    console.log(`Bot nomi: ${me.first_name}`);
    console.log(`Bot username: @${me.username}`);
    console.log(`Buyruqlar menyusi: O‘rnatildi [Menu]`);
    console.log(`Holati: Xabarlar va skrinshotlarni qabul qilishga tayyor...`);
    console.log(`To‘xtatish uchun: Ctrl + C`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('❌ Botga ulanishda xatolik:', err.message);
    process.exit(1);
  }

  let offset = 0;
  let running = true;

  process.on('SIGINT', () => {
    console.log('\n🛑 Telegram bot to‘xtatildi.');
    running = false;
    process.exit(0);
  });

  while (running) {
    try {
      const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getUpdates?offset=${offset}&timeout=25`);
      const data = await res.json().catch(() => ({}));

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          try {
            await handleTelegramWebhook(update, {
              approveSubmission,
              rejectSubmission,
              getMatches: async () => {
                try {
                  const bundle = await readBundle();
                  return bundle.officialData?.matches || [];
                } catch {
                  return [];
                }
              },
              getPlayers: async () => {
                try {
                  const bundle = await readBundle();
                  return bundle.officialData?.players || [];
                } catch {
                  return [];
                }
              },
              createSubmissionFromPhoto: async ({ fileUrl, caption, sender }) => {
                const submitterName = sender
                  ? `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || sender.username || 'Telegram User'
                  : 'Telegram Bot';
                const simulatedReq = {
                  body: {
                    submitter: {
                      name: submitterName,
                      telegramId: sender?.id
                    },
                    draft: {
                      source: 'telegram',
                      date: new Date().toISOString().slice(0, 10),
                      type: 'scrim',
                      result: 'win',
                      note: caption || 'Telegram orqali yuborilgan skrinshot',
                      photoUrl: fileUrl,
                      participants: []
                    }
                  }
                };
                const identity = { role: 'admin', user: 'telegram_bot' };
                const submission = await createSubmission(simulatedReq, identity);
                return { submission };
              }
            });
          } catch (handlerErr) {
            console.error('Update ishlashda xatolik:', handlerErr.message);
          }
        }
      } else if (!data.ok) {
        console.error('getUpdates xatosi:', data.description);
        await new Promise(r => setTimeout(r, 4000));
      }
    } catch (networkErr) {
      if (running) {
        console.warn('Tarmoq uzilishi yoki kutish vaqti tugadi, qayta ulanmoqda...', networkErr.message);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
}

startPolling();
