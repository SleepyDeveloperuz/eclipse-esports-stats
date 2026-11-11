// Eclipse Esports Stats — Telegram Webhook Handler (Vercel Serverless Function)
import {
  isTelegramConfigured,
  getWebhookSecret,
  getDefaultChatId,
  sendTelegramMessage,
  formatDailyScrimSummary,
  handleTelegramWebhook
} from '../lib/telegram-bot.js';
import {
  readBundle,
  approveSubmission,
  rejectSubmission,
  createSubmission
} from './submissions.js';
import { verifyToken } from './auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'Eclipse Telegram Bot Webhook',
      configured: isTelegramConfigured()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat POST so‘rovlari qabul qilinadi' });
  }

  // Handle direct admin action: send daily scrim summary to Telegram chat
  if (req.body?.action === 'send_daily_summary') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!verifyToken(token)) {
      return res.status(403).json({ error: 'Faqat admin / kapitan hisobot yuborishi mumkin' });
    }
    const bundle = await readBundle();
    const matches = bundle.officialData?.matches || [];
    const text = formatDailyScrimSummary(matches, req.body.date);
    const chatId = req.body.chatId || getDefaultChatId();
    if (!chatId) {
      return res.status(400).json({ error: 'Telegram chat ID sozlanmagan' });
    }
    const sent = await sendTelegramMessage({
      chatId,
      text,
      parseMode: 'HTML'
    });
    return res.status(200).json({ ok: sent.ok, result: sent });
  }

  // Verify Webhook Secret Token if configured
  const expectedSecret = getWebhookSecret();
  if (expectedSecret) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Noto‘g‘ri webhook maxfiy kaliti' });
    }
  }

  try {
    const update = req.body;
    if (!update || typeof update !== 'object') {
      return res.status(400).json({ error: 'Update topilmadi' });
    }

    const result = await handleTelegramWebhook(update, {
      approveSubmission,
      rejectSubmission,
      getMatches: async () => {
        const bundle = await readBundle();
        return bundle.officialData?.matches || [];
      },
      createSubmissionFromPhoto: async ({ fileUrl, caption, sender }) => {
        // Build mock request for createSubmission with OCR / manual fallback
        const submitterName = sender ? `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || sender.username || 'Telegram User' : 'Telegram Bot';
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

    return res.status(200).json(result);
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(500).json({ error: err.message || 'Telegram xatosi' });
  }
}
