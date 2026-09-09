import { getValidAccessIdentity, isAuthConfigured } from './auth.js';
import { createSessionSecurity } from '../lib/session-security.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MAX_IMAGES = 2;
const MAX_IMAGE_DATA_LENGTH = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const OCR_PROVIDER_DEADLINE_MS = 65_000;
const OCR_MODEL_TIMEOUT_MS = 32_000;
const DEFAULT_OCR_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];
const OCR_MODELS = String(process.env.GEMINI_OCR_MODELS || DEFAULT_OCR_MODELS.join(','))
  .split(',')
  .map(model => model.trim())
  .filter(model => /^gemini-[a-z0-9.-]+$/.test(model))
  .slice(0, 3);
const OCR_RATE_WINDOW_MS = 60 * 60 * 1000;
const OCR_VIEWER_RATE_LIMIT = 12;
const OCR_ADMIN_RATE_LIMIT = 30;
const security = createSessionSecurity();
const MAX_ROSTER_PLAYERS = 50;
const MAX_HEROES = 300;
const MAX_MATCH_SECONDS = (120 * 60) + 59;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MATCH_RESULTS = new Set(['win', 'loss']);
const MATCH_TYPES = new Set(['ranked', 'scrim', 'tournament', 'casual']);
const ROLES = new Set(['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer']);
const MEDALS = new Set(['mvp', 'gold', 'silver', 'bronze', 'none']);

async function checkOcrRate(req, identity) {
  const limit = identity?.role === 'admin' ? OCR_ADMIN_RATE_LIMIT : OCR_VIEWER_RATE_LIMIT;
  return security.checkAction(req, identity, 'ocr', limit, OCR_RATE_WINDOW_MS);
}

function cleanText(value, maxLength = 120) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f<>\"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanId(value) {
  const id = cleanText(value, 100);
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : '';
}

function nullableNumber(value, { min = null, max = null, integer = false } = {}) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (integer && !Number.isInteger(parsed)) return null;
  if (min !== null && parsed < min) return null;
  if (max !== null && parsed > max) return null;
  return parsed;
}

function normalizeDuration(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return { duration: null, durationSeconds: null, durationFormatted: null, invalid: false };
  }
  let seconds = null;
  if (typeof value === 'number') {
    seconds = nullableNumber(value, { min: 1, max: MAX_MATCH_SECONDS, integer: true });
  } else {
    const match = String(value).trim().match(/^(\d{1,3}):([0-5]\d)$/);
    if (match) {
      seconds = nullableNumber((Number(match[1]) * 60) + Number(match[2]), {
        min: 1,
        max: MAX_MATCH_SECONDS,
        integer: true
      });
    }
  }
  const durationFormatted = seconds === null
    ? null
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return {
    duration: durationFormatted,
    durationSeconds: seconds,
    durationFormatted,
    invalid: seconds === null
  };
}

export function normalizePortraitBox(value) {
  const bounds = value?.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some(n => !Number.isFinite(n) || n < 0 || n > 1000)) return null;
  if (bounds[2] <= bounds[0] || bounds[3] <= bounds[1] || !Number.isInteger(value.imageIndex) || value.imageIndex < 0 || value.imageIndex > 1) return null;
  return { imageIndex: value.imageIndex, bounds: [...bounds] };
}

export function normaliseOcrPayload(parsedData, rosterPlayers = [], heroList = []) {
  const rosterMap = new Map((Array.isArray(rosterPlayers) ? rosterPlayers : [])
    .map(player => [cleanId(player?.id), cleanText(player?.name, 80)])
    .filter(([id, name]) => id && name));
  const canonicalHeroes = new Map((Array.isArray(heroList) ? heroList : [])
    .map(hero => {
      const name = cleanText(hero?.name, 80);
      return [name.toLocaleLowerCase('en-US'), name];
    })
    .filter(([key, name]) => key && name));
  const issues = [];
  const resultValue = String(parsedData?.result || '').trim().toLowerCase();
  const result = MATCH_RESULTS.has(resultValue) ? resultValue : null;
  if (!result) issues.push('unknown_result');

  const matchTypeValue = String(parsedData?.matchType || '').trim().toLowerCase();
  const matchType = MATCH_TYPES.has(matchTypeValue) ? matchTypeValue : null;
  if (!matchType) issues.push('unknown_match_type');

  const duration = normalizeDuration(parsedData?.duration);
  if (duration.invalid) issues.push('invalid_duration');

  const seenParticipants = new Set();
  const normalizedPlayers = [];
  (Array.isArray(parsedData?.players) ? parsedData.players : []).slice(0, 10).forEach(player => {
    const matchedPlayerId = rosterMap.has(cleanId(player?.matchedPlayerId))
      ? cleanId(player.matchedPlayerId)
      : null;
    const detectedName = cleanText(player?.detectedName, 80) || (matchedPlayerId ? rosterMap.get(matchedPlayerId) : '');
    const participantKey = matchedPlayerId || detectedName.toLocaleLowerCase('uz-UZ');
    if (!participantKey) {
      issues.push('unidentified_participant');
      return;
    }
    if (seenParticipants.has(participantKey)) {
      issues.push('duplicate_participant');
      return;
    }
    if (normalizedPlayers.length >= 5) {
      issues.push('too_many_participants');
      return;
    }
    seenParticipants.add(participantKey);

    const heroCandidate = cleanText(player?.heroUsed, 80);
    const canonicalHero = canonicalHeroes.get(heroCandidate.toLocaleLowerCase('en-US')) || null;
    const medalValue = String(player?.medal || '').toLowerCase();
    const rolePlayed = ROLES.has(player?.rolePlayed) ? player.rolePlayed : null;
    if (heroCandidate && !canonicalHero) issues.push('unrecognized_hero');
    if (player?.rolePlayed && !rolePlayed) issues.push('unknown_role');
    normalizedPlayers.push({
      matchedPlayerId,
      detectedName,
      heroUsed: canonicalHero || heroCandidate || null,
      heroRecognized: Boolean(canonicalHero) && player?.heroRecognized === true,
      heroCatalogMatch: Boolean(canonicalHero),
      heroId: canonicalHero ? nullableNumber(heroList.find(hero => hero.name?.toLocaleLowerCase('en-US') === canonicalHero.toLocaleLowerCase('en-US'))?.id, { min: 1, max: 10000, integer: true }) : null,
      heroReviewRequired: true,
      heroCandidates: (Array.isArray(player?.heroCandidates) ? player.heroCandidates : []).slice(0, 3).map(name => canonicalHeroes.get(cleanText(name, 80).toLocaleLowerCase('en-US'))).filter(Boolean),
      portraitBox: normalizePortraitBox(player?.portraitBox),
      rolePlayed,
      kills: nullableNumber(player?.kills, { min: 0, max: 200, integer: true }),
      deaths: nullableNumber(player?.deaths, { min: 0, max: 200, integer: true }),
      assists: nullableNumber(player?.assists, { min: 0, max: 500, integer: true }),
      inGameScore: nullableNumber(player?.inGameScore, { min: 0, max: 20 }),
      medal: MEDALS.has(medalValue) ? medalValue : 'none',
      savage: typeof player?.savage === 'boolean' ? player.savage : null,
      maniac: typeof player?.maniac === 'boolean' ? player.maniac : null,
      damageDealt: nullableNumber(player?.damageDealt, { min: 0, max: 10_000_000, integer: true }),
      damageReceived: nullableNumber(player?.damageReceived, { min: 0, max: 10_000_000, integer: true }),
      turretDamage: nullableNumber(player?.turretDamage, { min: 0, max: 10_000_000, integer: true }),
      teamfightParticipation: nullableNumber(player?.teamfightParticipation, { min: 0, max: 100, integer: true }),
      goldEarned: nullableNumber(player?.goldEarned, { min: 0, max: 1_000_000, integer: true })
    });
  });
  if (!normalizedPlayers.length) issues.push('missing_participants');

  const reviewIssues = [...new Set(issues)];
  return {
    result,
    matchType,
    duration: duration.duration,
    durationSeconds: duration.durationSeconds,
    durationFormatted: duration.durationFormatted,
    teamTurtles: nullableNumber(parsedData?.teamTurtles, { min: 0, max: 10, integer: true }),
    teamLords: nullableNumber(parsedData?.teamLords, { min: 0, max: 10, integer: true }),
    teamTurrets: nullableNumber(parsedData?.teamTurrets, { min: 0, max: 9, integer: true }),
    notes: cleanText(parsedData?.notes, 300),
    players: normalizedPlayers,
    dataSource: 'ocr',
    verificationStatus: 'needs_review',
    requiresReview: true,
    reviewIssues
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    if (!isAuthConfigured()) {
      return res.status(503).json({ error: "Admin xavfsizlik sozlamalari topilmadi." });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const identity = await getValidAccessIdentity(token);
    if (!identity) {
      return res.status(401).json({ error: "AI skaneridan foydalanish uchun jamoa yoki Admin paroli bilan kiring." });
    }
    if (identity.role === 'viewer' && req.body?.purpose !== 'practice_submission') {
      return res.status(403).json({
        code: 'OCR_SCOPE_FORBIDDEN',
        error: 'Kuzatuvchi AI skaneridan faqat Practice Lite match yuborishda foydalana oladi.'
      });
    }
    const rate = await checkOcrRate(req, identity);
    if (rate.limited) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      return res.status(429).json({
        code: 'OCR_RATE_LIMITED',
        retryable: true,
        error: "AI skaner limiti tugadi. Birozdan keyin qayta urinib ko‘ring."
      });
    }

    const { images, rosterPlayers, heroList } = req.body || {};

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "Kamida 1 ta skrinshot (rasm) yuborilishi kerak." });
    }

    if (images.length > MAX_IMAGES) {
      return res.status(400).json({ error: `Ko'pi bilan ${MAX_IMAGES} ta skrinshot yuborish mumkin.` });
    }

    if (!GEMINI_API_KEY) {
      return res.status(400).json({
        error: "AI skaner sozlanmagan. Vercel Environment Variables orqali GEMINI_API_KEY ni kiriting."
      });
    }

    // Prepare image parts for Gemini API
    const imageParts = [];
    for (const img of images) {
      let base64Data = "";
      let mimeType = "image/jpeg";

      if (typeof img === "string") {
        if (img.length > MAX_IMAGE_DATA_LENGTH) {
          return res.status(413).json({ error: "Skrinshot hajmi juda katta. Kichikroq rasm yuboring." });
        }
        if (img.startsWith("data:")) {
          const match = img.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1].toLowerCase();
            base64Data = match[2];
          } else {
            return res.status(400).json({ error: "Skrinshot formati noto‘g‘ri." });
          }
        } else {
          base64Data = img;
        }
      } else if (img && typeof img.data === 'string') {
        if (img.data.length > MAX_IMAGE_DATA_LENGTH) {
          return res.status(413).json({ error: "Skrinshot hajmi juda katta. Kichikroq rasm yuboring." });
        }
        const embedded = img.data.match(/^data:([^;]+);base64,(.+)$/);
        if (embedded) {
          mimeType = embedded[1].toLowerCase();
          base64Data = embedded[2];
        } else {
          base64Data = img.data;
          mimeType = String(img.mimeType || "image/jpeg").toLowerCase();
        }
      }

      if (base64Data) {
        base64Data = base64Data.replace(/\s+/g, '');
        if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
          return res.status(415).json({ error: "Faqat JPEG, PNG yoki WEBP skrinshot yuborish mumkin." });
        }
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
          return res.status(400).json({ error: "Skrinshot ma’lumoti buzilgan yoki noto‘g‘ri kodlangan." });
        }
        if (Buffer.from(base64Data, 'base64').byteLength > MAX_IMAGE_BYTES) {
          return res.status(413).json({ error: "Skrinshot hajmi juda katta. Kichikroq rasm yuboring." });
        }
        imageParts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        });
      }
    }

    if (imageParts.length === 0) {
      return res.status(400).json({ error: "Rasmlarni o'qishda xatolik yuz berdi." });
    }

    const seenRosterIds = new Set();
    const safeRoster = (Array.isArray(rosterPlayers) ? rosterPlayers : [])
      .slice(0, MAX_ROSTER_PLAYERS)
      .map(player => ({
        id: cleanId(player?.id),
        name: cleanText(player?.name, 80),
        role: ROLES.has(player?.role) ? player.role : ''
      }))
      .filter(player => {
        if (!player.id || !player.name || seenRosterIds.has(player.id)) return false;
        seenRosterIds.add(player.id);
        return true;
      });
    const seenHeroes = new Set();
    const safeHeroes = (Array.isArray(heroList) ? heroList : [])
      .slice(0, MAX_HEROES)
      .map(hero => ({ id: nullableNumber(hero?.id, { min: 1, max: 10000, integer: true }), name: cleanText(hero?.name, 80), role: cleanText(hero?.role, 40) }))
      .filter(hero => {
        const key = hero.name.toLocaleLowerCase('en-US');
        if (!key || seenHeroes.has(key)) return false;
        seenHeroes.add(key);
        return true;
      });
    const playersHint = safeRoster
      .map(player => `- ID: "${player.id}", Name: "${player.name}", Role: "${player.role}"`)
      .join("\n");
    const heroesHint = safeHeroes
      .map(hero => `- ${hero.name}${hero.role ? ` (${hero.role})` : ''}`)
      .join("\n");

    const promptText = `You are an expert Mobile Legends: Bang Bang (MLBB) esports match data extractor.
${req.body?.mode === 'hero_review' ? 'HERO PORTRAIT REVIEW ONLY: The image is a single cropped hero portrait, not a scoreboard. Return one player assigned to the sole supplied roster ID. Identify the portrait or return null. Provide up to 3 plausible heroCandidates using canonical names. Do NOT invent KDA or any other match statistic.' : ''}
For each player return portraitBox: {imageIndex: 0-based input image index, bounds: [top,left,bottom,right]} using normalized coordinates 0..1000 tightly around their HERO PORTRAIT, not their avatar or whole row. Omit the box if its location is unclear. Return heroCandidates as up to three plausible canonical names, or [] when there is no visual evidence. Names being in the catalog is NOT proof of correct recognition: inspect the portrait, account for skins, and never infer heroes from player IGN or main role.
Analyze the provided post-match screenshot(s) and extract accurate visible match details.
The app compares original hero icons against its portrait database locally. Prioritize accurate portraitBox coordinates; if the hero identity is uncertain, return null instead of guessing a hero name. Do not confuse the player's avatar with the original hero icon.
${req.body?.purpose === 'practice_submission' ? 'This is a short match submission: 1–5 players may belong to Eclipse. A normal scoreboard shows 5 friendly players. Match roster IDs carefully and leave guests unmatched; never infer Team 5 from the number of visible rows. The server derives the scope from confirmed roster participants.' : 'Match friendly players to the supplied Eclipse roster; other friendly players are guests.'}

Screenshots provided:
- Images may be scoreboard or Data/Damage screens in any order. Identify their content before extracting values. Never assume a missing scoreboard exists.

Team Roster to match IGNs against:
${playersHint || "None provided. Use detected IGNs."}

Verified MLBB hero list:
${heroesHint || "No verified list provided. Mark every detected hero as unrecognized."}

Extraction Rules:
1. "result": "win" (Victory) or "loss" (Defeat) only when clearly visible; otherwise null. Never guess a result.
2. "duration": exact string "MM:SS" (e.g. "15:30") or integer seconds only when clearly visible; otherwise null. Never invent a duration.
3. "matchType": "ranked", "scrim", "tournament", or "casual" only when visible; otherwise null.
4. "players": 1 to 5 visible players for the friendly team. Never invent a missing row.
For each player:
- "matchedPlayerId": only an exact ID from Team Roster when the IGN match is reliable, otherwise null. Never invent an ID.
- "detectedName": the IGN as shown on the screen.
- "heroUsed": exact canonical name from Verified MLBB hero list when it is confidently recognized. If it is not on the list, return the visible candidate text and set "heroRecognized" to false.
- "heroRecognized": true only when the actual portrait is clearly recognized AND heroUsed is from the verified list. Otherwise false, even for a valid hero name.
- "rolePlayed": inferred lane/role ("EXP Laner", "Jungler", "Mid Laner", "Gold Laner", "Roamer").
- "kills": integer kills.
- "deaths": integer deaths.
- "assists": integer assists.
- "inGameScore": float number battle score (e.g. 10.8, 7.2, 4.5).
- "medal": string one of: "mvp", "gold", "silver", "bronze", or "none". (Defeat MVP or Victory MVP should be "mvp").
- "savage": true only if explicitly shown, false only if absence is explicitly established, otherwise null. A missing badge is not proof of absence.
- "maniac": true only if explicitly shown, false only if absence is explicitly established, otherwise null. A missing badge is not proof of absence.
- "damageDealt": integer hero damage dealt if visible (e.g. 84500), else null.
- "damageReceived": integer damage taken if visible (e.g. 52300), else null.
- "turretDamage": integer turret damage if visible (e.g. 6400), else null.
- "teamfightParticipation": integer percentage (0-100) if visible (e.g. 78), else null.
- "goldEarned": integer gold earned if visible (e.g. 11200), else null.

OUTPUT FORMAT: Return strictly valid JSON with no markdown wrapping or text outside JSON:
{
  "result": "win" | "loss" | null,
  "duration": "MM:SS" | null,
  "matchType": "ranked" | "scrim" | "tournament" | "casual" | null,
  "teamTurtles": null,
  "teamLords": null,
  "teamTurrets": null,
  "notes": "",
  "players": [
    {
      "matchedPlayerId": "id-or-null",
      "detectedName": "IGN",
      "heroUsed": "HeroName",
      "heroRecognized": true,
      "rolePlayed": "EXP Laner" | "Jungler" | "Mid Laner" | "Gold Laner" | "Roamer",
      "kills": 0,
      "deaths": 0,
      "assists": 0,
      "inGameScore": 0.0,
      "medal": "mvp" | "gold" | "silver" | "bronze" | "none",
      "savage": false,
      "maniac": false,
      "damageDealt": null,
      "damageReceived": null,
      "turretDamage": null,
      "teamfightParticipation": null,
      "goldEarned": null
    }
  ]
}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            ...imageParts
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1
      }
    };

    // Use the low-latency multimodal model first. A stable older model is kept
    // as a compatibility fallback for projects without access to newer models.
    const models = OCR_MODELS.length ? OCR_MODELS : DEFAULT_OCR_MODELS;
    const attempts = [];
    let geminiResponse = null;
    const providerDeadline = Date.now() + OCR_PROVIDER_DEADLINE_MS;

    for (const modelName of models) {
      const remainingTime = providerDeadline - Date.now();
      if (remainingTime <= 0) break;
      const attemptStartedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(OCR_MODEL_TIMEOUT_MS, remainingTime)
      );
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          }
        );

        if (response.ok) {
          geminiResponse = await response.json();
          break;
        } else {
          // Do not echo provider payloads: they can include operational details.
          const failure = {
            model: modelName,
            status: response.status,
            durationMs: Date.now() - attemptStartedAt
          };
          attempts.push(failure);
          console.warn('OCR provider attempt failed:', failure);
        }
      } catch (err) {
        const failure = {
          model: modelName,
          status: err?.name === 'AbortError' ? 'timeout' : 'network_error',
          durationMs: Date.now() - attemptStartedAt
        };
        attempts.push(failure);
        console.warn('OCR provider attempt failed:', failure);
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!geminiResponse) {
      const hasTimeout = attempts.some(attempt => attempt.status === 'timeout');
      const isRateLimited = attempts.some(attempt => attempt.status === 429);
      const statusCode = hasTimeout ? 504 : (isRateLimited ? 503 : 502);
      console.error('OCR provider unavailable:', { attempts });
      return res.status(statusCode).json({
        code: hasTimeout
          ? 'OCR_PROVIDER_TIMEOUT'
          : (isRateLimited ? 'OCR_PROVIDER_BUSY' : 'OCR_PROVIDER_UNAVAILABLE'),
        retryable: true,
        error: hasTimeout
          ? "AI tahlili kutilganidan uzoq davom etdi. Shu rasmlar bilan yana bir marta urinib ko‘ring."
          : (isRateLimited
            ? "AI xizmati hozir band. Bir daqiqadan keyin qayta urinib ko‘ring."
            : "AI skaner bilan bog‘lanib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.")
      });
    }

    const candidate = geminiResponse.candidates && geminiResponse.candidates[0];
    const textPart = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;

    if (!textPart) {
      return res.status(500).json({ error: "AI javob qaytarmadi yoki skrinshotni tahlil qila olmadi." });
    }

    let parsedData = null;
    try {
      parsedData = JSON.parse(textPart);
    } catch (e) {
      // Try extracting json from text
      const jsonMatch = textPart.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI javobi JSON formatida emas");
      }
    }

    const normalizedData = normaliseOcrPayload(parsedData, safeRoster, safeHeroes);

    return res.status(200).json({
      success: true,
      data: normalizedData
    });
  } catch (error) {
    console.error("OCR API error:", error);
    return res.status(500).json({ error: "AI skaner serverida xatolik yuz berdi." });
  }
}
