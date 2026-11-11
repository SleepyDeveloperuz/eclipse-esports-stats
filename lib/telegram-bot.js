// Eclipse Esports Stats — Telegram Bot Integration & Match Management
// Supports sending notifications, inline approvals, photo match submissions, and daily scrim reports.

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

export function getDefaultChatId() {
  return process.env.TELEGRAM_CHAT_ID || '';
}

export function getWebhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET || '';
}

export async function sendTelegramMessage({
  token = getBotToken(),
  chatId = getDefaultChatId(),
  text = '',
  replyMarkup = null,
  parseMode = 'HTML'
} = {}) {
  if (!token || !chatId || !text) return { ok: false, error: 'Token, chatId va matn kerak' };

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: parseMode
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function answerCallbackQuery({
  token = getBotToken(),
  callbackQueryId = '',
  text = '',
  showAlert = false
} = {}) {
  if (!token || !callbackQueryId) return { ok: false };
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert
      })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function editMessageText({
  token = getBotToken(),
  chatId = getDefaultChatId(),
  messageId = null,
  text = '',
  replyMarkup = null,
  parseMode = 'HTML'
} = {}) {
  if (!token || !chatId || !messageId || !text) return { ok: false };

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: parseMode
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function getTelegramFileUrl(fileId, token = getBotToken()) {
  if (!token || !fileId) return null;
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.result?.file_path) {
      return `${TELEGRAM_API_BASE}/file/bot${token}/${data.result.file_path}`;
    }
    return null;
  } catch (_) {
    return null;
  }
}

export function formatSubmissionTelegramMessage(submission) {
  if (!submission) return 'Yangi submission haqida ma’lumot topilmadi.';

  const draft = submission.review?.correctedDraft || submission.draft || {};
  const isWin = draft.result === 'win' || draft.result === 'G‘alaba';
  const resultEmoji = isWin ? '🏆' : '💀';
  const resultText = isWin ? 'G‘ALABA (WIN)' : 'MAG‘LUBIYAT (LOSS)';
  const date = draft.date || 'Bugun';
  const matchType = (draft.type || 'ranked').toUpperCase();
  const duration = draft.duration || draft.durationFormatted || '—';
  const submitterName = submission.submitter?.name || 'O‘yinchi';
  const id = submission.id || 'Noma’lum';

  let playersList = '';
  const participants = draft.participants || draft.playerStats || [];
  if (Array.isArray(participants) && participants.length) {
    playersList = participants
      .slice(0, 5)
      .map(p => {
        const kda = p.kills !== undefined && p.deaths !== undefined && p.assists !== undefined
          ? ` (${p.kills}/${p.deaths}/${p.assists})`
          : '';
        return `  • <b>${p.playerName || p.name || 'O‘yinchi'}</b> — ${p.heroName || p.hero || 'MLBB Hero'}${kda}`;
      })
      .join('\n');
  }

  return [
    `⚡ <b>ECLIPSE ESPORTS // YANGI MATCH SUBMISSION</b>`,
    `ID: <code>${id}</code>`,
    ``,
    `${resultEmoji} <b>Natija:</b> ${resultText}`,
    `📅 <b>Sana:</b> ${date} · ⏱ <b>Davomiylik:</b> ${duration}`,
    `🎮 <b>Turi:</b> ${matchType}`,
    `👤 <b>Yuboruvchi:</b> ${submitterName}`,
    playersList ? `\n👥 <b>Qatnashchilar:</b>\n${playersList}` : '',
    ``,
    `Quyidagi tugmalar orqali matchni statistikaga tasdiqlang yoki rad eting:`
  ].filter(Boolean).join('\n');
}

export function getSubmissionInlineKeyboard(submissionId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Tasdiqlash', callback_data: `sub_approve:${submissionId}` },
        { text: '❌ Rad etish', callback_data: `sub_reject:${submissionId}` }
      ]
    ]
  };
}

export async function notifySubmissionCreated(submission, options = {}) {
  if (!isTelegramConfigured()) return { ok: false, skipped: true, reason: 'TELEGRAM_BOT_TOKEN sozlanmagan' };

  const text = formatSubmissionTelegramMessage(submission);
  const replyMarkup = getSubmissionInlineKeyboard(submission.id);

  return sendTelegramMessage({
    chatId: options.chatId || getDefaultChatId(),
    token: options.token || getBotToken(),
    text,
    replyMarkup
  });
}

export function formatDailyScrimSummary(matches = [], date = null) {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const dayMatches = matches.filter(m => (m.date || '').slice(0, 10) === targetDate);

  if (!dayMatches.length) {
    return [
      `📊 <b>ECLIPSE ESPORTS // KUNLIK SCRIM HISOBOTI</b>`,
      `📅 Sana: <b>${targetDate}</b>`,
      ``,
      `Ushbu kunda hali birorta ham match qayd etilmagan.`
    ].join('\n');
  }

  const total = dayMatches.length;
  let wins = 0;
  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;
  const playerStatsMap = {};

  // Timing segments: Early (<12m), Mid (12-18m), Late (>18m)
  const timing = {
    early: { total: 0, wins: 0 },
    mid: { total: 0, wins: 0 },
    late: { total: 0, wins: 0 }
  };

  dayMatches.forEach(m => {
    const isWin = m.result === 'win' || m.result === 'G‘alaba' || m.isWin === true;
    if (isWin) wins++;

    const durSec = Number(m.durationSeconds) || (m.duration ? parseDuration(m.duration) : 900);
    if (durSec < 720) {
      timing.early.total++;
      if (isWin) timing.early.wins++;
    } else if (durSec <= 1080) {
      timing.mid.total++;
      if (isWin) timing.mid.wins++;
    } else {
      timing.late.total++;
      if (isWin) timing.late.wins++;
    }

    const participants = m.playerStats || m.participants || [];
    participants.forEach(p => {
      const name = p.playerName || p.name;
      if (!name) return;
      if (!playerStatsMap[name]) {
        playerStatsMap[name] = { name, kills: 0, deaths: 0, assists: 0, matches: 0, mvpCount: 0 };
      }
      const st = playerStatsMap[name];
      st.kills += Number(p.kills) || 0;
      st.deaths += Number(p.deaths) || 0;
      st.assists += Number(p.assists) || 0;
      st.matches++;
      if (p.medal === 'mvp' || p.isMvp) st.mvpCount++;

      totalKills += Number(p.kills) || 0;
      totalDeaths += Number(p.deaths) || 0;
      totalAssists += Number(p.assists) || 0;
    });
  });

  const winRate = ((wins / total) * 100).toFixed(0);

  // Find day MVP
  let mvpPlayer = null;
  let bestScore = -1;
  Object.values(playerStatsMap).forEach(p => {
    const kda = p.deaths === 0 ? (p.kills + p.assists) : (p.kills + p.assists) / p.deaths;
    const score = (kda * 10) + (p.mvpCount * 25) + (p.matches * 5);
    if (score > bestScore) {
      bestScore = score;
      mvpPlayer = { ...p, kda: kda.toFixed(1) };
    }
  });

  // Coaching verdict
  let coachNote = '';
  if (timing.late.total > 0 && (timing.late.wins / timing.late.total) < 0.5) {
    coachNote = '16+ daqiqadan oshgan uzun o‘yinlarda qiyinchilik sezildi. Lord atrofidagi positioning va teamfight timinglariga ko‘proq urg‘u berish tavsiya etiladi.';
  } else if (timing.early.total > 0 && (timing.early.wins / timing.early.total) >= 0.75) {
    coachNote = 'Erta o‘yin (Early game) va Turtle nazorati a’lo darajada o‘tdi. Ushbu tajovuzkor Snowball strategiyasini saqlab qolish kerak.';
  } else {
    coachNote = 'Barqaror o‘yin namoyish etildi. Xatolar kam va jamoaviy sinergiya o‘smoqda.';
  }

  const earlyWr = timing.early.total ? `${Math.round((timing.early.wins / timing.early.total) * 100)}%` : '—';
  const midWr = timing.mid.total ? `${Math.round((timing.mid.wins / timing.mid.total) * 100)}%` : '—';
  const lateWr = timing.late.total ? `${Math.round((timing.late.wins / timing.late.total) * 100)}%` : '—';

  return [
    `📊 <b>ECLIPSE ESPORTS // KUNLIK SCRIM HISOBOTI</b>`,
    `📅 Sana: <b>${targetDate}</b>`,
    `⚔️ Jami Matchlar: <b>${total} ta</b> (${wins}W – ${total - wins}L) · <b>${winRate}% WR</b>`,
    ``,
    mvpPlayer ? `🏆 <b>KUNNING MVP O‘YINCHISI:</b>\n⭐️ <b>${mvpPlayer.name}</b> — KDA: <b>${mvpPlayer.kda}</b> (${mvpPlayer.kills}/${mvpPlayer.deaths}/${mvpPlayer.assists}) · ${mvpPlayer.matches} match\n` : '',
    `⏱ <b>O‘YIN DINAMIKASI (DAVOMIYLIK):</b>`,
    `• Early Game (<12m): <b>${timing.early.total} ta</b> (${earlyWr} WR)`,
    `• Mid Game (12-18m): <b>${timing.mid.total} ta</b> (${midWr} WR)`,
    `• Late Game (>18m): <b>${timing.late.total} ta</b> (${lateWr} WR) ${timing.late.total && (timing.late.wins / timing.late.total) < 0.5 ? '⚠️' : ''}`,
    ``,
    `💡 <b>MURABBIY XULOSASI (COACH NOTE):</b>`,
    `<i>${coachNote}</i>`,
    ``,
    `🌐 Batafsil: <i>Eclipse Esports Command Center</i>`
  ].filter(Boolean).join('\n');
}

function parseDuration(val) {
  if (typeof val === 'number') return val;
  const parts = String(val || '').split(':').map(Number);
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return 900;
}

export async function handleTelegramWebhook(update, {
  approveSubmission = null,
  rejectSubmission = null,
  createSubmissionFromPhoto = null,
  getMatches = null
} = {}) {
  if (!update || typeof update !== 'object') {
    return { ok: false, error: 'Noto‘g‘ri update ob’ekti' };
  }

  // 1. Handle Inline Button Callback Queries (Approve / Reject)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || '';
    const callbackQueryId = cb.id;
    const message = cb.message;
    const chatId = message?.chat?.id;
    const messageId = message?.message_id;

    if (data.startsWith('sub_approve:')) {
      const subId = data.replace('sub_approve:', '').trim();
      try {
        if (typeof approveSubmission === 'function') {
          await approveSubmission(subId);
        }
        await answerCallbackQuery({
          callbackQueryId,
          text: `✅ Match #${subId} muvaffaqiyatli tasdiqlandi!`
        });
        if (chatId && messageId) {
          const originalText = message.text || '';
          await editMessageText({
            chatId,
            messageId,
            text: `${originalText}\n\n<b>✅ TASDIQLANDI:</b> Ushbu match kapitan tomonidan tasdiqlandi va Eclipse statistikasiga kiritildi.`
          });
        }
        return { ok: true, action: 'approved', submissionId: subId };
      } catch (err) {
        await answerCallbackQuery({
          callbackQueryId,
          text: `Xatolik: ${err.message}`,
          showAlert: true
        });
        return { ok: false, error: err.message };
      }
    }

    if (data.startsWith('sub_reject:')) {
      const subId = data.replace('sub_reject:', '').trim();
      try {
        if (typeof rejectSubmission === 'function') {
          await rejectSubmission(subId, 'Telegram orqali rad etildi');
        }
        await answerCallbackQuery({
          callbackQueryId,
          text: `❌ Match #${subId} rad etildi!`
        });
        if (chatId && messageId) {
          const originalText = message.text || '';
          await editMessageText({
            chatId,
            messageId,
            text: `${originalText}\n\n<b>❌ RAD ETILDI:</b> Ushbu match bekor qilindi.`
          });
        }
        return { ok: true, action: 'rejected', submissionId: subId };
      } catch (err) {
        await answerCallbackQuery({
          callbackQueryId,
          text: `Xatolik: ${err.message}`,
          showAlert: true
        });
        return { ok: false, error: err.message };
      }
    }
  }

  // 2. Handle Text Commands & Messages
  const msg = update.message;
  if (!msg) return { ok: true, ignored: true };

  const chatId = msg.chat?.id;
  const text = (msg.text || '').trim();

  if (text.startsWith('/start') || text.startsWith('/help')) {
    const welcome = [
      `👋 <b>Assalomu alaykum, Eclipse Esports Botiga xush kelibsiz!</b>`,
      ``,
      `Bu bot orqali siz jamoa matchlarini to‘g‘ridan-to‘g‘ri Telegramdan boshqara olasiz:`,
      ``,
      `📸 <b>Match yuborish:</b> Shunchaki match skrinshotini (Scoreboard) ushbu botga rasm sifatida yuboring. AI uni o‘qiydi va arizani kapitan navbatiga qo‘yadi!`,
      `✅ <b>Bir tugma bilan tasdiqlash:</b> Yangi arizalar kelganda, Telegramdagi [Tasdiqlash] tugmasini bosish orqali matchni statistikaga kiritishingiz mumkin.`,
      `📊 <b>/scrims</b> yoki <b>/today</b> — Bugungi barcha scrimlar va MVP hisobotini olish.`,
      `📈 <b>/stats</b> — Jamoaning umumiy holati va oxirgi natijalar.`,
      ``,
      `<i>Eclipse Esports Analytics Center</i>`
    ].join('\n');
    await sendTelegramMessage({ chatId, text: welcome });
    return { ok: true, command: 'start' };
  }

  if (text.startsWith('/scrims') || text.startsWith('/today') || text.startsWith('/summary')) {
    let matches = [];
    if (typeof getMatches === 'function') {
      matches = await getMatches();
    }
    const summary = formatDailyScrimSummary(matches);
    await sendTelegramMessage({ chatId, text: summary });
    return { ok: true, command: text.startsWith('/summary') ? 'summary' : 'scrims' };
  }

  // 3. Handle Photo Match Submission (Match yuborish via Telegram)
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];
    const fileId = largestPhoto.file_id;
    const fileUrl = await getTelegramFileUrl(fileId);

    if (fileUrl && typeof createSubmissionFromPhoto === 'function') {
      try {
        await sendTelegramMessage({
          chatId,
          text: `⏳ Skrinshot qabul qilindi. AI tahlil qilmoqda…`
        });

        const created = await createSubmissionFromPhoto({
          fileUrl,
          fileId,
          caption: msg.caption || '',
          sender: msg.from
        });

        if (created?.submission) {
          const notification = formatSubmissionTelegramMessage(created.submission);
          const replyMarkup = getSubmissionInlineKeyboard(created.submission.id);
          await sendTelegramMessage({
            chatId,
            text: notification,
            replyMarkup
          });
          return { ok: true, submissionCreated: true, id: created.submission.id };
        }
      } catch (err) {
        await sendTelegramMessage({
          chatId,
          text: `⚠️ Skrinshotni o‘qishda xatolik yuz berdi: ${err.message}`
        });
        return { ok: false, error: err.message };
      }
    } else {
      await sendTelegramMessage({
        chatId,
        text: `📸 Skrinshot qabul qilindi (Fayl ID: <code>${fileId}</code>). Tizimga yuborilmoqda.`
      });
      return { ok: true, photoReceived: true };
    }
  }

  return { ok: true, unhandled: true };
}
