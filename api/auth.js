import crypto from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "XolvaQant";
const SESSION_SECRET = process.env.SESSION_SECRET || "eclipse_esports_secure_hmac_secret_key_2026_998877";

function generateToken() {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(timestamp)
    .digest('hex');
  return `${timestamp}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [timestamp, signature] = parts;

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(timestamp)
    .digest('hex');

  if (signature !== expectedSignature) return false;

  // Check expiration (7 days)
  const tokenTime = parseInt(timestamp, 10);
  if (isNaN(tokenTime)) return false;
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - tokenTime > maxAge) return false;

  return true;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method === "POST") {
      const { password } = req.body || {};

      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: "Parol kiritilmadi" });
      }

      // Timing safe comparison to prevent timing attacks
      const inputBuffer = Buffer.from(password);
      const targetBuffer = Buffer.from(ADMIN_PASSWORD);

      let isValid = false;
      if (inputBuffer.length === targetBuffer.length) {
        isValid = crypto.timingSafeEqual(inputBuffer, targetBuffer);
      }

      if (!isValid) {
        // Small delay to prevent brute-force speed
        await new Promise(r => setTimeout(r, 400));
        return res.status(401).json({ error: "Noto'g'ri parol! Qaytadan urinib ko'ring." });
      }

      const token = generateToken();
      return res.status(200).json({
        success: true,
        token: token,
        message: "Admin muvaffaqiyatli tasdiqlandi!"
      });
    }

    if (req.method === "GET") {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();

      if (verifyToken(token)) {
        return res.status(200).json({ valid: true });
      } else {
        return res.status(401).json({ valid: false, error: "Yaroqsiz yoki muddati o'tgan token" });
      }
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Auth API error:", error);
    return res.status(500).json({ error: error.message });
  }
}
