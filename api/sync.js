import crypto from 'crypto';

const GIST_ID = process.env.GIST_ID || "33fed4cb6b1caf42ba709cc73ddec290";
const GITHUB_TOKEN = process.env.GITHUB_SYNC_TOKEN;
const SESSION_SECRET = process.env.SESSION_SECRET || "eclipse_esports_secure_hmac_secret_key_2026_998877";

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [timestamp, signature] = parts;

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(timestamp)
    .digest('hex');

  if (signature !== expectedSignature) return false;

  // Check token age (7 days)
  const tokenTime = parseInt(timestamp, 10);
  if (isNaN(tokenTime)) return false;
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - tokenTime > maxAge) return false;

  return true;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // 1. PUBLIC READ: Anyone can fetch team match stats
    if (req.method === "GET") {
      const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "EclipseEsports-App"
        }
      });
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch gist" });
      }
      const gist = await response.json();
      const file = gist.files && gist.files["eclipse_data.json"];
      if (!file || !file.content) {
        return res.status(404).json({ error: "No data found" });
      }
      const data = JSON.parse(file.content);
      return res.status(200).json(data);
    }

    // 2. PROTECTED WRITE: Only verified Admin with HMAC token can write/modify data!
    if (req.method === "POST") {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();

      if (!verifyToken(token)) {
        return res.status(401).json({
          error: "Ruxsat berilmadi! Ushbu amal faqat jamoa Admini (Murabbiy) uchun ruxsat etilgan."
        });
      }

      if (!GITHUB_TOKEN) {
        return res.status(500).json({ error: "Server configuratsiyasi to'liq emas (GITHUB_SYNC_TOKEN)." });
      }

      const payload = req.body;
      if (!payload) {
        return res.status(400).json({ error: "Ma'lumot mavjud emas" });
      }

      const content = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);

      const updateRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        method: "PATCH",
        headers: {
          "Authorization": `token ${GITHUB_TOKEN}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "EclipseEsports-App"
        },
        body: JSON.stringify({
          files: {
            "eclipse_data.json": {
              content: content
            }
          }
        })
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        return res.status(updateRes.status).json({ error: "Baza yangilanishida xatolik", details: errText });
      }

      return res.status(200).json({ success: true, updatedAt: new Date().toISOString() });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("API Sync error:", error);
    return res.status(500).json({ error: error.message });
  }
}
