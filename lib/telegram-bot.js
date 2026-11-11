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

export function getDefaultGroupId() {
  const raw = process.env.TELEGRAM_GROUP_ID || '';
  if (!raw) return '';
  // Normalize supergroup format if needed: -3648509145 -> -1003648509145
  if (/^-\d{9,10}$/.test(raw) && !raw.startsWith('-100')) {
    return `-100${raw.slice(1)}`;
  }
  return raw;
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

export async function deleteTelegramMessage({
  token = getBotToken(),
  chatId = getDefaultChatId(),
  messageId = null
} = {}) {
  if (!token || !chatId || !messageId) return { ok: false };
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function setBotCommands({ token = getBotToken() } = {}) {
  if (!token) return { ok: false };
  const commands = [
    { command: 'start', description: 'Asosiy menyu va yo‘riqnoma' },
    { command: 'scrims', description: 'Bugungi scrimlar va kun MVPsi' },
    { command: 'meta', description: 'MLBB Meta Lab (Ban va Pick nusxa olish)' },
    { command: 'stats', description: 'Eclipse jamoa statistikasi' },
    { command: 'roster', description: 'Jamoa tarkibi va o‘yinchilar' },
    { command: 'help', description: 'Match skrinshotini yuborish' }
  ];
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands })
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

export function getMainReplyKeyboard() {
  return {
    keyboard: [
      [{ text: '📸 Match yuborish' }, { text: '📊 Bugungi scrimlar' }],
      [{ text: '🧬 Meta Lab (Nusxa olish)' }, { text: '🏆 Jamoa statistikasi' }],
      [{ text: '👥 O‘yinchilar tarkibi' }, { text: '❓ Qo‘llanma' }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

export function formatPhotoUploadInstructions() {
  return [
    `📸 <b>MATCH SKRINSHOTINI YUBORISH QO‘LLANMASI</b>`,
    ``,
    `1. Mobile Legends o‘yini tugagach, <b>Scoreboard</b> yoki <b>Data (Damage)</b> sahifasini to‘liq skrinshot qiling.`,
    `2. Shunchaki o‘sha rasmni ushbu botga <b>rasm (photo)</b> ko‘rinishida tashlang.`,
    `3. AI tizimi darhol rasm ichidagi KDA, damage, medallar va Maniac/Savage highlightlarini o‘qiydi.`,
    `4. Ariza kapitan navbatiga tushadi va tasdiqlangach, statistikaga kiritiladi.`,
    ``,
    `⚠️ <b>Muhim eslatma:</b>`,
    `<i>Skrinshotlarni guruhga emas, faqat botning shaxsiy lichkasiga yuboring!</i>`,
    ``,
    `👇 <b>Hoziroq skrinshotni shu chatga tashlashingiz mumkin:</b>`
  ].join('\n');
}

export function formatMetaLabSummary() {
  return [
    `🧬 <b>ECLIPSE ESPORTS // MLBB META LAB (S-TIER)</b>`,
    `📅 Versiya: <b>Hozirgi Patch</b> · Daraja: <b>Mythic+</b>`,
    ``,
    `🚫 <b>USTUVOR BAN TAVSIYALARI:</b>`,
    `<code>Zhuxin, Fanny, Suyou, Nolan, Hayabusa, Mathilda</code>`,
    `<i>(Nusxa olish uchun yuqoridagi qahramonlar ustiga bosing)</i>`,
    ``,
    `👑 <b>S-TIER ROLLAR BO‘YICHA (PICKS):</b>`,
    `• 🛡 <b>EXP Laner:</b>`,
    `  <code>Cici, Edith, Terizla, Yu Zhong, Chou, Arlott</code>`,
    `• 🗡 <b>Jungler:</b>`,
    `  <code>Suyou, Ling, Roger, Alpha, Hayabusa, Nolan</code>`,
    `• 🔮 <b>Mid Laner:</b>`,
    `  <code>Zhuxin, Vexana, Valentina, Xavier, Novaria</code>`,
    `• 🏹 <b>Gold Laner:</b>`,
    `  <code>Claude, Moskov, Harith, Bruno, Roger</code>`,
    `• 🛡 <b>Roamer:</b>`,
    `  <code>Tigreal, Mathilda, Minotaur, Hylos, Gatotkaca</code>`,
    ``,
    `📋 <b>KOMANDA CHATI UCHUN NUSXA (BIRDAK):</b>`,
    `<code>BAN: Zhuxin, Fanny, Suyou, Nolan | EXP: Cici, Chou | JG: Ling, Suyou | MID: Zhuxin, Valentina | GOLD: Claude, Harith | ROAM: Tigreal, Mathilda</code>`,
    ``,
    `🌐 Web ilova: <i>https://eclipse-esports-stats.vercel.app/meta-lab.html</i>`
  ].join('\n');
}

export function formatTeamOverallStats(matches = []) {
  const total = Array.isArray(matches) ? matches.length : 0;
  if (!total) {
    return [
      `🏆 <b>ECLIPSE ESPORTS // JAMOA STATISTIKASI</b>`,
      ``,
      `Bazada hali saqlangan matchlar mavjud emas.`,
      `O‘yin skrinshotlarini botga yuborib birinchi matchlarni kiritishingiz mumkin!`
    ].join('\n');
  }

  let wins = 0;
  let scrims = 0;
  let ranked = 0;
  const heroesUsed = {};

  matches.forEach(m => {
    const isWin = m.result === 'win' || m.result === 'G‘alaba' || m.isWin === true;
    if (isWin) wins++;
    if (m.matchType === 'scrim' || m.type === 'scrim') scrims++;
    else ranked++;

    const participants = m.playerStats || m.participants || [];
    participants.forEach(p => {
      const hero = p.heroUsed || p.heroName || p.hero;
      if (hero) heroesUsed[hero] = (heroesUsed[hero] || 0) + 1;
    });
  });

  const winRate = ((wins / total) * 100).toFixed(1);
  const topHeroes = Object.entries(heroesUsed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([h, c], i) => `${i + 1}. <b>${h}</b> — ${c} ta o‘yin`)
    .join('\n');

  return [
    `🏆 <b>ECLIPSE ESPORTS // JAMOA UMUMIY STATISTIKASI</b>`,
    ``,
    `⚔️ Jami O‘yinlar: <b>${total} ta</b> (${wins}W – ${total - wins}L)`,
    `📈 Umumiy Win Rate: <b>${winRate}%</b>`,
    `🎯 Formatlar: <b>${scrims}</b> Scrimlar · <b>${ranked}</b> Ranked o‘yinlar`,
    ``,
    topHeroes ? `🔥 <b>ENG KO‘P O‘YNATILGAN QAHRAMONLAR:</b>\n${topHeroes}\n` : '',
    `🌐 Batafsil analitika: <i>https://eclipse-esports-stats.vercel.app/</i>`
  ].filter(Boolean).join('\n');
}

export function formatRosterSummary(players = []) {
  const defaultRoster = [
    { name: 'Leader / Kapitan', role: 'Captain & EXP Laner', isCaptain: true },
    { name: 'Shadow', role: 'Jungler / Assassin' },
    { name: 'Heavenlyyy', role: 'Mid Laner / Mage' },
    { name: 'Sniper', role: 'Gold Laner / Marksman' },
    { name: 'Guardian', role: 'Roamer / Tank' }
  ];

  const list = (Array.isArray(players) && players.length) ? players : defaultRoster;

  const rendered = list.map((p, i) => {
    const name = p.name || p.playerName || 'O‘yinchi';
    const role = p.role || p.primaryRole || 'Flex';
    const isCap = p.isCaptain || p.role?.toLowerCase()?.includes('captain') || i === 0;
    return `• ${isCap ? '👑 ' : '👤 '}<b>${name}</b> — <i>${role}</i>`;
  }).join('\n');

  return [
    `👥 <b>ECLIPSE ESPORTS // RASMIY TARKIB (ROSTER)</b>`,
    ``,
    rendered,
    ``,
    `💡 <i>Tarkib va qahramonlar hovuzi bo‘yicha batafsil Command Room’da.</i>`
  ].join('\n');
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
  getMatches = null,
  getPlayers = null
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
        // Broadcast announcement to the team group if configured
        const groupId = getDefaultGroupId();
        if (groupId && String(groupId) !== String(chatId)) {
          sendTelegramMessage({
            chatId: groupId,
            text: `🎉 <b>YANGI MATCH STATISTIKAGA TASDIQLANDI!</b>\n\nKapitan tomonidan match <code>#${subId}</code> tasdiqlandi va Eclipse bazasiga kiritildi.\n\n📊 Bugungi natijalarni ko‘rish uchun: /scrims`
          }).catch(() => {});
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
  const chatType = msg.chat?.type || 'private';
  const isGroup = chatType === 'group' || chatType === 'supergroup';
  const text = (msg.text || '').trim();
  const normText = text.toLowerCase();

  // GROUP RESTRICTION: Block match screenshot uploads in group
  if (isGroup && Array.isArray(msg.photo) && msg.photo.length > 0) {
    if (msg.message_id) {
      await deleteTelegramMessage({ chatId, messageId: msg.message_id }).catch(() => {});
    }
    const senderName = msg.from
      ? (msg.from.username ? `@${msg.from.username}` : `${msg.from.first_name || ''}`.trim())
      : 'O‘yinchi';
    await sendTelegramMessage({
      chatId,
      text: [
        `⚠️ <b>${senderName}, guruhga match skrinshotini tashlash taqiqlangan!</b>`,
        ``,
        `Guruh toza turishi va arizangiz Eclipse statistikasiga avtomatik kiritilishi uchun, iltimos, skrinshotni to‘g‘ridan-to‘g‘ri botning shaxsiy lichkasiga yuboring:`,
        `👉 @EclipseEsportsStatsBot`,
        ``,
        `<i>(Lichkaga kirib "📸 Match yuborish" tugmasini bosing va rasmni tashlang).</i>`
      ].join('\n')
    });
    return { ok: true, blockedInGroup: true };
  }

  // Match photo upload guide
  if (normText === '📸 match yuborish' || normText.startsWith('/upload')) {
    const guide = formatPhotoUploadInstructions();
    await sendTelegramMessage({
      chatId,
      text: guide,
      replyMarkup: isGroup ? null : getMainReplyKeyboard()
    });
    return { ok: true, command: 'upload_guide' };
  }

  // Scrims & Today's Summary
  if (normText === '📊 bugungi scrimlar' || normText.startsWith('/scrims') || normText.startsWith('/today') || normText.startsWith('/summary')) {
    let matches = [];
    if (typeof getMatches === 'function') {
      try { matches = await getMatches(); } catch (_) { matches = []; }
    }
    const summary = formatDailyScrimSummary(matches);
    await sendTelegramMessage({
      chatId,
      text: summary,
      replyMarkup: isGroup ? null : getMainReplyKeyboard()
    });
    return { ok: true, command: normText.startsWith('/summary') ? 'summary' : 'scrims' };
  }

  // MLBB Meta Lab (Copyable)
  if (normText === '🧬 meta lab (nusxa olish)' || normText === 'meta lab' || normText.startsWith('/meta') || normText.startsWith('/metalab')) {
    const meta = formatMetaLabSummary();
    const inline = {
      inline_keyboard: [
        [{ text: '🌐 Saytdagi Meta Lab ni ochish', url: 'https://eclipse-esports-stats.vercel.app/meta-lab.html' }]
      ]
    };
    await sendTelegramMessage({
      chatId,
      text: meta,
      replyMarkup: inline
    });
    return { ok: true, command: 'meta' };
  }

  // Overall Team Stats
  if (normText === '🏆 jamoa statistikasi' || normText === 'jamoa statistikasi' || normText.startsWith('/stats')) {
    let matches = [];
    if (typeof getMatches === 'function') {
      try { matches = await getMatches(); } catch (_) { matches = []; }
    }
    const stats = formatTeamOverallStats(matches);
    await sendTelegramMessage({
      chatId,
      text: stats,
      replyMarkup: isGroup ? null : getMainReplyKeyboard()
    });
    return { ok: true, command: 'stats' };
  }

  // Roster
  if (normText === '👥 o‘yinchilar tarkibi' || normText === 'o‘yinchilar tarkibi' || normText.startsWith('/roster') || normText.startsWith('/players')) {
    let players = [];
    if (typeof getPlayers === 'function') {
      try { players = await getPlayers(); } catch (_) { players = []; }
    }
    const roster = formatRosterSummary(players);
    await sendTelegramMessage({
      chatId,
      text: roster,
      replyMarkup: isGroup ? null : getMainReplyKeyboard()
    });
    return { ok: true, command: 'roster' };
  }

  // Help & Start
  if (normText === '❓ qo‘llanma' || normText === 'qo‘llanma' || text.startsWith('/start') || text.startsWith('/help')) {
    if (isGroup) {
      const groupWelcome = [
        `👋 <b>Eclipse Esports jamoasi guruhiga xush kelibsiz!</b>`,
        ``,
        `Guruhda quyidagi buyruqlar orqali statistikani ko‘rishingiz mumkin:`,
        `• <b>/scrims</b> — Bugungi o‘yinlar va kun MVPsi`,
        `• <b>/meta</b> — MLBB Meta Lab (Banning & Picking tavsiyalari)`,
        `• <b>/stats</b> — Jamoaning umumiy g‘alaba statistikasi`,
        `• <b>/roster</b> — Jamoa a’zolari va rollari`,
        ``,
        `⚠️ <b>Eslatma:</b> Guruhga match skrinshotlarini tashlash mumkin emas. Match yuborish uchun botning o‘ziga kiring: @EclipseEsportsStatsBot`
      ].join('\n');
      await sendTelegramMessage({ chatId, text: groupWelcome });
      return { ok: true, command: 'group_welcome' };
    }

    const welcome = [
      `👋 <b>Assalomu alaykum, Eclipse Esports Botiga xush kelibsiz!</b>`,
      ``,
      `Bu bot orqali jamoa matchlarini boshqarish va tahlil qilish juda oson:`,
      ``,
      `📸 <b>Match yuborish:</b> Pastdagi "📸 Match yuborish" tugmasini bosing yoki o‘yindan keyingi Scoreboard rasmini to‘g‘ridan-to‘g‘ri shu yerga tashlang!`,
      `🧬 <b>Meta Lab:</b> Eng kuchli qahramonlar va banlar ro‘yxatini bitta bosishda nusxalab oling.`,
      `📊 <b>Scrimlar & Statistika:</b> Kunlik va umumiy jamoa natijalarini kuzatib boring.`,
      ``,
      `<i>Quyidagi qulay menyu tugmalaridan birini tanlang:</i>`
    ].join('\n');
    await sendTelegramMessage({
      chatId,
      text: welcome,
      replyMarkup: getMainReplyKeyboard()
    });
    return { ok: true, command: 'start' };
  }

  // 3. Handle Photo Match Submission (Only in Private Chat)
  if (!isGroup && Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];
    const fileId = largestPhoto.file_id;
    const fileUrl = await getTelegramFileUrl(fileId);

    if (fileUrl && typeof createSubmissionFromPhoto === 'function') {
      try {
        await sendTelegramMessage({
          chatId,
          text: `⏳ Skrinshot qabul qilindi. AI tahlil qilmoqda…`,
          replyMarkup: getMainReplyKeyboard()
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

          // Send confirmation to the player
          await sendTelegramMessage({
            chatId,
            text: notification,
            replyMarkup
          });

          // Also notify captain directly if submitter is different from captain
          const captainChatId = getDefaultChatId();
          if (captainChatId && String(captainChatId) !== String(chatId)) {
            await sendTelegramMessage({
              chatId: captainChatId,
              text: `🔔 <b>YANGI MATCH ARIZASI!</b>\n\n${notification}`,
              replyMarkup
            });
          }

          return { ok: true, submissionCreated: true, id: created.submission.id };
        }
      } catch (err) {
        await sendTelegramMessage({
          chatId,
          text: `⚠️ Skrinshotni o‘qishda xatolik yuz berdi: ${err.message}`,
          replyMarkup: getMainReplyKeyboard()
        });
        return { ok: false, error: err.message };
      }
    } else {
      await sendTelegramMessage({
        chatId,
        text: `📸 Skrinshot qabul qilindi (Fayl ID: <code>${fileId}</code>). Tizimga yuborilmoqda.`,
        replyMarkup: getMainReplyKeyboard()
      });
      return { ok: true, photoReceived: true };
    }
  }

  // Default fallback in private chat: show instructions with keyboard
  if (!isGroup) {
    await sendTelegramMessage({
      chatId,
      text: `Tushunarsiz buyruq. Pastdagi tugmalardan birini tanlang yoki match skrinshotini rasm sifatida yuboring:`,
      replyMarkup: getMainReplyKeyboard()
    });
  }

  return { ok: true, unhandled: true };
}
