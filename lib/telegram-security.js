import { createHash, timingSafeEqual } from 'node:crypto';

export function telegramSecretMatches(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string' || !expected.trim() || !received) return false;
  return timingSafeEqual(createHash('sha256').update(received).digest(), createHash('sha256').update(expected).digest());
}

function telegramId(value, { user = false } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') return '';
  const text = String(value);
  if (!(user ? /^[1-9]\d*$/ : /^-?[1-9]\d*$/).test(text) || !Number.isSafeInteger(Number(text))) return '';
  return text;
}

export function getTelegramCaptainId(env = process.env) {
  // A positive private chat ID is a legacy user identity. Group destinations
  // never grant captain permissions to their members.
  return telegramId(String(env.TELEGRAM_CAPTAIN_USER_ID || env.TELEGRAM_CHAT_ID || '').trim(), { user: true });
}

export function getTelegramGroupId(env = process.env) {
  const raw = String(env.TELEGRAM_GROUP_ID || '').trim();
  const normalized = /^-\d{9,10}$/.test(raw) && !raw.startsWith('-100') ? `-100${raw.slice(1)}` : raw;
  return normalized.startsWith('-') ? telegramId(normalized) : '';
}

export function telegramUpdateAccess(update, env = process.env) {
  const denied = { allowed: false, captain: false };
  if (!update || typeof update !== 'object' || Array.isArray(update) || (update.message && update.callback_query)) return denied;
  const callback = update.callback_query;
  const message = callback ? callback.message : update.message;
  const actor = callback ? callback.from : message?.from;
  const userId = telegramId(actor?.id, { user: true });
  const chatId = telegramId(message?.chat?.id);
  if (!userId || !chatId || actor?.is_bot === true || message?.sender_chat) return denied;
  const captain = Boolean(getTelegramCaptainId(env) && userId === getTelegramCaptainId(env));
  const allowedUsers = new Set(String(env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map(id => telegramId(id.trim(), { user: true })).filter(Boolean));
  const chatType = message.chat.type;
  const privateAccess = chatType === 'private' && chatId === userId && (captain || allowedUsers.has(userId));
  // A command delivered by Telegram in the configured team group can be read
  // by that group's human members. This does not authorize private uploads.
  const groupAccess = ['group', 'supergroup'].includes(chatType) && chatId === getTelegramGroupId(env);
  if (!privateAccess && !groupAccess) return denied;
  if (callback && (typeof callback.data !== 'string' || (callback.data.startsWith('sub_') && !captain))) return denied;
  return { allowed: true, captain, userId, chatId };
}
