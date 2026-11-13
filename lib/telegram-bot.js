// Eclipse Esports Stats — Telegram Bot Integration & Match Management
// Supports sending notifications, inline approvals, photo match submissions, and daily scrim reports.

const TELEGRAM_API_BASE = 'https://api.telegram.org';

const mediaGroupBuffer = new Map();

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

export function getSiteBaseUrl() {
  return (process.env.SITE_URL || 'https://eclipse-esports-stats.vercel.app').replace(/\/+$/, '');
}

export async function fetchLiveMetaLabData({ rank = 'glory', days = '7', siteUrl = getSiteBaseUrl() } = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const [metaRes, heroesRes] = await Promise.all([
      fetch(`${siteUrl}/api/mlbb-meta?rank=${encodeURIComponent(rank)}&days=${encodeURIComponent(days)}`, { signal: controller.signal }),
      fetch(`${siteUrl}/api/mlbb-heroes`, { signal: controller.signal })
    ]);
    clearTimeout(timeout);

    if (!metaRes.ok || !heroesRes.ok) return null;

    const metaData = (await metaRes.json().catch(() => ({}))).data;
    const heroes = (await heroesRes.json().catch(() => ({}))).data;
    if (!metaData?.eclipse || !Array.isArray(heroes)) return null;

    const heroMap = new Map(heroes.map(h => [h.id, h]));
    const scored = metaData.eclipse.map(row => {
      const h = heroMap.get(row.heroId) || {};
      return {
        ...row,
        name: h.name || `Hero ${row.heroId}`,
        roles: Array.isArray(h.roles) ? h.roles : [],
        lanes: Array.isArray(h.lanes) ? h.lanes : []
      };
    });

    const ssHeroes = scored.filter(h => h.tier === 'SS').sort((a, b) => b.eclipseScore - a.eclipseScore);
    const ssAndS = scored.filter(h => h.tier === 'SS' || h.tier === 'S');

    // Bans: Highest ban rate among SS & S tier
    const ssBans = ssAndS
      .slice()
      .sort((a, b) => b.banRate - a.banRate)
      .slice(0, 8)
      .map(h => `${h.name} (${Math.round((h.banRate || 0) * 100)}%)`)
      .join(', ');

    const filterLanes = (...keywords) => {
      return ssAndS
        .filter(h => h.lanes.some(l => keywords.some(k => String(l || '').toLowerCase().includes(k))))
        .slice(0, 6)
        .map(h => `${h.name}${h.tier === 'SS' ? ' (SS)' : ''}`)
        .join(', ');
    };

    const expPicks = filterLanes('exp') || 'Paquito (SS), Sun (SS), Masha (SS), Cici, Chou';
    const jgPicks = filterLanes('jungle') || 'Aulus (SS), Lukas (SS), Sun (SS), Nolan, Ling';
    const midPicks = filterLanes('mid') || 'Eudora (SS), Zhuxin, Valentina, Vexana, Xavier';
    const goldPicks = filterLanes('gold') || 'Obsidia (SS), Melissa, Miya, Claude, Bruno';
    const roamPicks = filterLanes('roam') || 'Marcel (SS), Carmilla (SS), Gloo (SS), Floryn (SS), Rafaela (SS)';

    const topBansShort = ssAndS.slice().sort((a, b) => b.banRate - a.banRate).slice(0, 4).map(h => h.name).join(', ');
    const topExpShort = expPicks.split(', ').slice(0, 2).map(s => s.replace(' (SS)', '')).join(', ');
    const topJgShort = jgPicks.split(', ').slice(0, 2).map(s => s.replace(' (SS)', '')).join(', ');
    const topMidShort = midPicks.split(', ').slice(0, 2).map(s => s.replace(' (SS)', '')).join(', ');
    const topGoldShort = goldPicks.split(', ').slice(0, 2).map(s => s.replace(' (SS)', '')).join(', ');
    const topRoamShort = roamPicks.split(', ').slice(0, 2).map(s => s.replace(' (SS)', '')).join(', ');

    const teamChatCopy = `BAN: ${topBansShort} | EXP: ${topExpShort} | JG: ${topJgShort} | MID: ${topMidShort} | GOLD: ${topGoldShort} | ROAM: ${topRoamShort}`;

    return {
      rank,
      ssHeroes,
      ssBans,
      expPicks,
      jgPicks,
      midPicks,
      goldPicks,
      roamPicks,
      teamChatCopy
    };
  } catch (_) {
    return null;
  }
}

export async function fetchLiveMatches({ siteUrl = getSiteBaseUrl(), token = getBotToken() } = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const headers = token ? { 'x-telegram-bot-token': token } : {};
    const res = await fetch(`${siteUrl}/api/sync?collection=matches`, {
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.matches) ? data.matches : [];
  } catch (_) {
    return [];
  }
}

export async function fetchLiveRoster({ siteUrl = getSiteBaseUrl(), token = getBotToken() } = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const headers = token ? { 'x-telegram-bot-token': token } : {};
    const res = await fetch(`${siteUrl}/api/sync?collection=roster`, {
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.players) ? data.players : [];
  } catch (_) {
    return [];
  }
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
  const matchType = (draft.matchType || draft.type || 'scrim').toUpperCase();
  const duration = draft.duration || draft.durationFormatted || '—';
  const submitterName = submission.submitter?.name || 'O‘yinchi';
  const id = submission.id || 'Noma’lum';

  let playersList = '';
  const participants = draft.playerStats || draft.participants || [];
  const realNameMap = {
    'heavenly as always': 'Husniddin',
    'Shadow as always': 'Sanjar',
    "no one's hero": "Ulug'bek",
    'Lyza the heroine': 'Shohruh',
    '- Kenia': 'Otabek',
    'LEADER': "Nabixo'ja"
  };

  if (Array.isArray(participants) && participants.length) {
    playersList = participants
      .slice(0, 5)
      .map(p => {
        const kda = p.kills !== undefined && p.deaths !== undefined && p.assists !== undefined
          ? ` (${p.kills}/${p.deaths}/${p.assists})`
          : '';
        const hero = p.heroUsed || p.heroName || p.hero || 'MLBB Hero';
        const medal = (p.medal === 'mvp' || p.medal === 'supreme_mvp') ? ' 🎖 [MVP]'
          : p.medal === 'supreme' ? ' 🔮 [Supreme]'
          : p.medal === 'gold' ? ' 🥇 [Gold]'
          : '';
        const multikill = p.savage ? ' ⚡ [SAVAGE]' : p.maniac ? ' 💥 [MANIAC]' : '';
        const rawName = p.playerName || p.name || 'O‘yinchi';
        const real = p.realName || realNameMap[rawName] || '';
        const isCap = rawName.toLowerCase().includes('heavenly') || real === 'Husniddin';
        const nameDisplay = real ? `${rawName} (${real})` : rawName;
        return `  • ${isCap ? '👑 ' : '👤 '}<b>${nameDisplay}</b> — ${hero}${kda}${medal}${multikill}`;
      })
      .join('\n');
  }

  const squadType = participants.length === 5 ? 'Team 5 (To‘liq tarkib)' : participants.length === 3 ? 'Trio (3 a’zo)' : `${participants.length} a’zo`;
  const opponent = draft.opponent || submission.opponent || '';
  const score = (draft.teamKills !== undefined && draft.enemyKills !== undefined && draft.teamKills !== null)
    ? ` · Hisob: <b>${draft.teamKills}:${draft.enemyKills}</b>`
    : '';
  const mathNote = draft.mathVerified === true
    ? `\n🔢 <b>Matematik tekshiruv:</b> ✅ 100% tasdiqlangan (${draft.teamKills} kill to‘liq mos)`
    : '';

  return [
    `⚡ <b>ECLIPSE ESPORTS // YANGI MATCH SUBMISSION</b>`,
    `ID: <code>${id}</code>`,
    ``,
    opponent ? `⚔️ <b>Eclipse vs ${opponent}</b>` : '',
    `${resultEmoji} <b>Natija:</b> ${resultText}${score}${mathNote}`,
    `📅 <b>Sana:</b> ${date} · ⏱ <b>Davomiylik:</b> ${duration}`,
    `🎮 <b>Turi:</b> ${matchType} · <b>Tarkib:</b> ${squadType}`,
    `👤 <b>Yuboruvchi:</b> ${submitterName}`,
    playersList ? `\n👥 <b>O‘yinchilar ko‘rsatkichlari:</b>\n${playersList}` : '',
    ``,
    `Quyidagi tugmalar orqali matchni tasdiqlang yoki rad eting:`
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
      [{ text: '🎯 Raqiblar razvedkasi' }, { text: '🃏 Qahramonlar hovuzi' }],
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
    `1. Mobile Legends o‘yini tugagach, <b>Scoreboard</b> oynasini to‘liq skrinshot qiling.`,
    `2. Shunchaki o‘sha rasmni ushbu botga <b>rasm (photo)</b> ko‘rinishida tashlang.`,
    `3. AI tizimi rasm ichidagi K/D/A, qahramonlar, o‘yin vaqti va natijani avtomatik o‘qiydi.`,
    `4. Ariza kapitan tasdiqlashiga yuboriladi va tasdiqlangach, jamoa statistikasiga qo‘shiladi.`,
    ``,
    `💡 <b>Foydali maslahatlar:</b>`,
    `• Rasm yuborayotganda izohga <code>#ranked</code>, <code>#scrim</code> yoki <code>#turnir</code> deb yozsangiz, match turi avtomatik belgilanadi (sukut bo‘yicha: Scrim).`,
    `• Rasm tiniq, o‘yinchi nomlari va medallar aniq ko‘ringan bo‘lishi kerak.`,
    ``,
    `⚠️ <b>Muhim eslatma:</b>`,
    `<i>Skrinshotlarni umumiy guruhga emas, faqat botning o‘ziga (shu chatga) yuboring!</i>`,
    ``,
    `👇 <b>Hoziroq skrinshotni shu chatga tashlashingiz mumkin:</b>`
  ].join('\n');
}

export function formatMetaLabSummary(customData = null) {
  const ssBans = customData?.ssBans || 'Hirara (87%), Masha (75%), Marcel (72%), Obsidia (61%), Belerick (58%), Lukas (52%), Aulus (52%), Eudora (41%)';
  const expPicks = customData?.expPicks || 'Masha (SS), Aulus (SS), Lukas (SS), Sun (SS), Gloo (SS), Cici';
  const jgPicks = customData?.jgPicks || 'Aulus (SS), Lukas (SS), Sun (SS), Saber, Nolan, Hirara';
  const midPicks = customData?.midPicks || 'Eudora (SS), Valir, Zhuxin, Valentina, Vexana, Xavier';
  const goldPicks = customData?.goldPicks || 'Obsidia (SS), Melissa, Miya, Claude, Moskov, Bruno';
  const roamPicks = customData?.roamPicks || 'Marcel (SS), Carmilla (SS), Gloo (SS), Floryn (SS), Rafaela (SS), Estes (SS)';
  const teamChatCopy = customData?.teamChatCopy || 'BAN: Hirara, Masha, Marcel, Obsidia | EXP: Masha, Aulus | JG: Aulus, Lukas | MID: Eudora, Valir | GOLD: Obsidia, Melissa | ROAM: Marcel, Carmilla';

  return [
    `🧬 <b>ECLIPSE ESPORTS // META LAB (MYTHICAL GLORY+)</b>`,
    `📊 Daraja: <b>Mythical Glory+</b> · Manba: <b>Meta Lab Rasmiy Bahosi</b>`,
    `🔥 <b>SS-TIER QOIDASI:</b> <i>Must Ban yoki 1st Priority Pick (Score ≥ 70)</i>`,
    ``,
    `🚫 <b>MUST BAN (MYTHICAL GLORY+ SS):</b>`,
    `<code>${ssBans}</code>`,
    `<i>(Nusxa olish uchun yuqoridagi qahramonlar ustiga bosing)</i>`,
    ``,
    `👑 <b>1ST PRIORITY PICKS (ROLLAR BO‘YICHA SS/S-TIER):</b>`,
    `• 🛡 <b>EXP Laner:</b>`,
    `  <code>${expPicks}</code>`,
    `• 🗡 <b>Jungler:</b>`,
    `  <code>${jgPicks}</code>`,
    `• 🔮 <b>Mid Laner:</b>`,
    `  <code>${midPicks}</code>`,
    `• 🏹 <b>Gold Laner:</b>`,
    `  <code>${goldPicks}</code>`,
    `• 🛡 <b>Roamer:</b>`,
    `  <code>${roamPicks}</code>`,
    ``,
    `📋 <b>KOMANDA CHATI UCHUN NUSXA (BIRDAK):</b>`,
    `<code>${teamChatCopy}</code>`,
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
    { name: 'heavenly as always', role: 'Captain & Roamer', isCaptain: true },
    { name: 'Shadow as always', role: 'Gold Laner / Jungler' },
    { name: "no one's hero", role: 'Roamer / Gold Laner' },
    { name: 'Lyza the heroine', role: 'EXP Laner' },
    { name: '- Kenia', role: 'Jungler' },
    { name: 'LEADER', role: 'Mid Laner' }
  ];

  const list = (Array.isArray(players) && players.length) ? players : defaultRoster;

  const realNameMap = {
    'heavenly as always': 'Husniddin',
    'Shadow as always': 'Sanjar',
    "no one's hero": "Ulug'bek",
    'Lyza the heroine': 'Shohruh',
    '- Kenia': 'Otabek',
    'LEADER': "Nabixo'ja"
  };

  const rendered = list.map((p, i) => {
    const name = p.name || p.playerName || 'O‘yinchi';
    const real = p.realName || realNameMap[name] || '';
    const role = p.role || p.primaryRole || 'Flex';
    const isCap = p.captain || p.isCaptain || p.role?.toLowerCase()?.includes('captain') || String(name).toLowerCase().includes('heavenly') || i === 0;
    const displayName = real ? `<b>${name}</b> (${real})` : `<b>${name}</b>`;
    return `• ${isCap ? '👑 ' : '👤 '}${displayName} — <i>${role}</i>`;
  }).join('\n');

  return [
    `👥 <b>ECLIPSE ESPORTS // RASMIY TARKIB (ROSTER)</b>`,
    ``,
    rendered,
    ``,
    `💡 <i>Tarkib va qahramonlar hovuzi bo‘yicha batafsil Command Room’da.</i>`
  ].join('\n');
}

export function formatScoutingSummary(teams = [], query = '') {
  const defaultScoutTeams = [
    {
      name: 'Team Falcon',
      tag: 'FLC',
      tier: 'S',
      region: 'Uzbekistan / Central Asia',
      signaturePicks: ['Fanny (75% WR - 1-bosqichda ban shart)', 'Chou', 'Beatrix'],
      priorityBans: ['Fanny', 'Mathilda'],
      counterNotes: '1. Fanny olinsa: darhol Khufra yoki Moskov javobi.\n2. 5-daqiqadagi 1-Turtle uchun 4 kishi yig‘ilish.\n3. Late Game (16+ daqiqa) positioning ustida ustunmiz.',
      h2h: { wins: 3, losses: 1 }
    },
    {
      name: 'Alpha Esports',
      tag: 'ALPHA',
      tier: 'A',
      region: 'Uzbekistan',
      signaturePicks: ['Ling (Devorlar orqali tezkor invayt)', 'Angela', 'Claude'],
      priorityBans: ['Ling', 'Diggie'],
      counterNotes: '1. Ling tanlansa: Baxia jungler yoki Ruby tanlab, 1-daqiqada ko‘k buffini bosish.\n2. Claude 2 ta item yig‘masdan 12-daqiqagacha tezkor push.',
      h2h: { wins: 2, losses: 2 }
    }
  ];

  const list = (Array.isArray(teams) && teams.length) ? teams : defaultScoutTeams;
  const qClean = String(query || '').toLowerCase().trim();
  const filtered = qClean
    ? list.filter(t => (t.name || '').toLowerCase().includes(qClean) || (t.tag || '').toLowerCase().includes(qClean))
    : list;

  if (!filtered.length) {
    return [
      `🎯 <b>ECLIPSE ESPORTS // RAQIBLAR RAZVEDKASI (SCOUTING)</b>`,
      ``,
      `“${query}” bo‘yicha hech qanday raqib jamoa topilmadi.`,
      `Barcha raqiblarni ko‘rish uchun <b>/scout</b> deb yozing.`
    ].join('\n');
  }

  const cards = filtered.map(t => {
    const name = t.name || 'Raqib Jamoa';
    const tag = t.tag ? ` [${t.tag}]` : '';
    const tier = t.tier ? ` · ${t.tier}-Tier` : '';
    const h2h = t.h2h ? ` (${t.h2h.wins || 0}W – ${t.h2h.losses || 0}L)` : '';
    const sigs = (Array.isArray(t.signaturePicks) ? t.signaturePicks : [])
      .map(p => typeof p === 'string' ? p : (p.heroName ? `${p.heroName}${p.note ? ` (${p.note})` : ''}` : ''))
      .filter(Boolean).join(', ') || 'Ma’lumot kiritilmagan';
    const bans = (Array.isArray(t.priorityBans) ? t.priorityBans : [])
      .map(b => typeof b === 'string' ? b : (b.heroName || ''))
      .filter(Boolean).join(', ') || 'Yo‘q';
    const notes = t.counterNotes || 'Taktik reja kiritilmagan';

    return [
      `🛡️ <b>${name}${tag}</b>${tier}${h2h}`,
      `  • 🌟 <b>Signature Picks:</b> <i>${sigs}</i>`,
      `  • 🚫 <b>Majburiy 1-Banlar:</b> <code>${bans}</code>`,
      `  • ♟️ <b>Counter Taktika:</b>\n<i>${notes}</i>`
    ].join('\n');
  }).join('\n\n');

  return [
    `🎯 <b>ECLIPSE ESPORTS // RAQIBLAR RAZVEDKASI (SCOUTING & COUNTER)</b>`,
    ``,
    cards,
    ``,
    `💡 <i>Yangi raqib kiritish yoki tahrirlash saytdagi Raqiblar bo‘limida.</i>`
  ].join('\n');
}

export function formatHeroPoolSummary(players = [], targetName = '') {
  const defaultRosterPool = [
    {
      name: 'heavenly as always',
      realName: 'Husniddin',
      role: 'Captain & Roamer',
      sTier: ['Mathilda', 'Khufra', 'Chou', 'Tigreal'],
      aTier: ['Grock', 'Minotaur', 'Ruby'],
      joker: ['Franco', 'Kaja', 'Diggie']
    },
    {
      name: 'Shadow as always',
      realName: 'Sanjar',
      role: 'Gold Laner / Jungler',
      sTier: ['Roger', 'Beatrix', 'Claude', 'Harith'],
      aTier: ['Brody', 'Moskov', 'Wanwan'],
      joker: ['Natan', 'Lesley', 'Irithel']
    },
    {
      name: "no one's hero",
      realName: "Ulug'bek",
      role: 'Roamer / Gold Laner',
      sTier: ['Grock', 'Khufra', 'Lolita'],
      aTier: ['Gatotkaca', 'Belerick', 'Atlas'],
      joker: ['Hylos', 'Carmilla', 'Edith']
    },
    {
      name: 'Lyza the heroine',
      realName: 'Shohruh',
      role: 'EXP Laner',
      sTier: ['Paquito', 'Arlott', 'Terizla', 'Ruby'],
      aTier: ['Yu Zhong', 'Benedetta', 'Cici'],
      joker: ['Dyrroth', 'Thamuz', 'Chou']
    },
    {
      name: '- Kenia',
      realName: 'Otabek',
      role: 'Jungler',
      sTier: ['Ling', 'Fanny', 'Nolan', 'Hayabusa'],
      aTier: ['Fredrinn', 'Baxia', 'Martis'],
      joker: ['Helcurt', 'Lancelot', 'Suyou']
    },
    {
      name: 'LEADER',
      realName: "Nabixo'ja",
      role: 'Mid Laner',
      sTier: ['Valentina', 'Pharsa', 'Novaria', 'Yve'],
      aTier: ['Vexana', 'Xavier', 'Luo Yi'],
      joker: ['Zhask', 'Kadita', 'Cecilion']
    }
  ];

  let list = defaultRosterPool;
  if (Array.isArray(players) && players.length) {
    list = players.map(p => {
      const def = defaultRosterPool.find(d => d.name === p.name || d.realName === p.realName) || {};
      const pool = Array.isArray(p.heroPool) ? p.heroPool : [];
      const s = pool.filter(h => h.status === 'comfort').map(h => h.heroName);
      const a = pool.filter(h => h.status === 'backup').map(h => h.heroName);
      const j = pool.filter(h => h.status === 'learning').map(h => h.heroName);
      return {
        name: p.name || def.name || 'O‘yinchi',
        realName: p.realName || def.realName || '',
        role: p.primaryRole || p.role || def.role || 'Flex',
        sTier: s.length ? s : def.sTier || [],
        aTier: a.length ? a : def.aTier || [],
        joker: j.length ? j : def.joker || []
      };
    });
  }

  const query = String(targetName || '').toLowerCase().trim();
  const filtered = query
    ? list.filter(p => p.name.toLowerCase().includes(query) || (p.realName && p.realName.toLowerCase().includes(query)))
    : list;

  if (!filtered.length) {
    return [
      `🃏 <b>ECLIPSE ESPORTS // QAHRAMONLAR HOVUZI (HERO POOL DEPTH)</b>`,
      ``,
      `“${targetName}” nomli o‘yinchi topilmadi.`,
      `Barcha tarkibni ko‘rish uchun <b>/pool</b> deb yozing.`
    ].join('\n');
  }

  const cards = filtered.map(p => {
    const sLen = p.sTier.length;
    const resilience = sLen >= 4
      ? '🛡️ Yuqori Ban Chidamliligi (3 ta ban berilsa ham qulay hero bor)'
      : sLen >= 2
        ? '⚔️ O‘rtacha Chidamlilik (A-Tier bilan to‘ldirilgan)'
        : '⚠️ Target Ban Xavfi!';

    return [
      `👤 <b>${p.name}${p.realName ? ` (${p.realName})` : ''}</b> — <i>${p.role}</i>`,
      `  • 🌟 <b>S-Tier (100% Turnir):</b> <code>${p.sTier.join(', ') || '—'}</code>`,
      `  • ⚔️ <b>A-Tier (Scrim sinov):</b> <code>${p.aTier.join(', ') || '—'}</code>`,
      `  • 🃏 <b>Pocket / Joker:</b> <i>${p.joker.join(', ') || '—'}</i>`,
      `  • 📊 <b>Status:</b> ${resilience}`
    ].join('\n');
  }).join('\n\n');

  return [
    `🃏 <b>ECLIPSE ESPORTS // QAHRAMONLAR CHUQURLIGI MATRITSASI</b>`,
    ``,
    cards,
    ``,
    `💡 <i>Raqib asosiy herolarni ban qilsa ham zaxirada nima qolishi darhol ko‘rinadi.</i>`
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
  getPlayers = null,
  getMetaLabData = null
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
    if (!Array.isArray(matches) || !matches.length) {
      matches = await fetchLiveMatches();
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
    let customMeta = null;
    if (typeof getMetaLabData === 'function') {
      try { customMeta = await getMetaLabData(); } catch (_) {}
    }
    if (!customMeta) {
      customMeta = await fetchLiveMetaLabData();
    }
    const meta = formatMetaLabSummary(customMeta);
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
    if (!Array.isArray(matches) || !matches.length) {
      matches = await fetchLiveMatches();
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
    if (!Array.isArray(players) || !players.length) {
      players = await fetchLiveRoster();
    }
    const roster = formatRosterSummary(players);
    await sendTelegramMessage({
      chatId,
      text: roster,
      replyMarkup: isGroup ? null : getMainReplyKeyboard()
    });
    return { ok: true, command: 'roster' };
  }

  // Scouting
  if (normText === '🎯 raqiblar razvedkasi' || normText === 'raqiblar razvedkasi' || normText.startsWith('/scout') || normText.startsWith('/scouting')) {
    const query = text.replace(/^\/(scout|scouting)/i, '').trim();
    let teams = [];
    if (typeof getScoutingTeams === 'function') {
      try { teams = await getScoutingTeams(); } catch (_) { teams = []; }
    }
    const scoutingText = formatScoutingSummary(teams, query);
    await sendTelegramMessage({
      chatId,
      text: scoutingText,
      replyMarkup: isGroup ? null : getMainReplyKeyboard()
    });
    return { ok: true, command: 'scout' };
  }

  // Hero Pool Depth
  if (normText === '🃏 qahramonlar hovuzi' || normText === 'qahramonlar hovuzi' || normText.startsWith('/pool') || normText.startsWith('/heropool')) {
    const targetName = text.replace(/^\/(pool|heropool)/i, '').trim();
    let players = [];
    if (typeof getPlayers === 'function') {
      try { players = await getPlayers(); } catch (_) { players = []; }
    }
    if (!Array.isArray(players) || !players.length) {
      players = await fetchLiveRoster();
    }
    const poolText = formatHeroPoolSummary(players, targetName);
    await sendTelegramMessage({
      chatId,
      text: poolText,
      replyMarkup: isGroup ? null : getMainReplyKeyboard()
    });
    return { ok: true, command: 'pool' };
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
        `• <b>/scout</b> — Raqib jamoalar razvedkasi va counter reja`,
        `• <b>/pool</b> — O‘yinchilarning S/A/Joker qahramonlar hovuzi`,
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

    // Support Album / MediaGroup uploads (Scoreboard + Damage sent together)
    if (fileUrl && msg.media_group_id && typeof createSubmissionFromPhoto === 'function') {
      const groupId = msg.media_group_id;
      let group = mediaGroupBuffer.get(groupId);
      if (!group) {
        group = {
          files: [],
          chatId,
          caption: msg.caption || '',
          sender: msg.from,
          timer: null
        };
        mediaGroupBuffer.set(groupId, group);
      }
      group.files.push(fileUrl);
      if (msg.caption) group.caption = msg.caption;

      const triggerGroupProcess = async () => {
        mediaGroupBuffer.delete(groupId);
        try {
          await sendTelegramMessage({
            chatId,
            text: `⏳ ${group.files.length} ta skrinshot qabul qilindi (Scoreboard + Damage). AI to‘liq tahlil qilmoqda…`,
            replyMarkup: getMainReplyKeyboard()
          });

          const created = await createSubmissionFromPhoto({
            fileUrl: group.files[0],
            fileUrls: group.files,
            fileId,
            caption: group.caption || '',
            sender: group.sender
          });

          if (created?.submission) {
            const notification = formatSubmissionTelegramMessage(created.submission);
            const replyMarkup = getSubmissionInlineKeyboard(created.submission.id);

            await sendTelegramMessage({
              chatId,
              text: notification,
              replyMarkup
            });

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
            text: `⚠️ Skrinshotlarni o‘qishda xatolik yuz berdi: ${err.message}`,
            replyMarkup: getMainReplyKeyboard()
          });
          return { ok: false, error: err.message };
        }
      };

      if (group.files.length >= 2) {
        if (group.timer) clearTimeout(group.timer);
        return await triggerGroupProcess();
      }

      return await new Promise(resolve => {
        if (group.timer) clearTimeout(group.timer);
        group.timer = setTimeout(async () => {
          resolve(await triggerGroupProcess());
        }, 1200);
      });
    }

    if (fileUrl && typeof createSubmissionFromPhoto === 'function') {
      try {
        await sendTelegramMessage({
          chatId,
          text: `⏳ Skrinshot qabul qilindi. AI tahlil qilmoqda…`,
          replyMarkup: getMainReplyKeyboard()
        });

        const created = await createSubmissionFromPhoto({
          fileUrl,
          fileUrls: [fileUrl],
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
