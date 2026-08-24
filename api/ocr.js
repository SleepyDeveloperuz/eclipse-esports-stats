const DEFAULT_GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { images, apiKey, rosterPlayers, heroList } = req.body || {};

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "Kamida 1 ta skrinshot (rasm) yuborilishi kerak." });
    }

    const keyToUse = apiKey || DEFAULT_GEMINI_API_KEY;
    if (!keyToUse) {
      return res.status(400).json({
        error: "Gemini API kaliti topilmadi. Iltimos, Settings bo'limiga bepul Gemini API kalitingizni kiriting (Google AI Studio: aistudio.google.com)."
      });
    }

    // Prepare image parts for Gemini API
    const imageParts = [];
    for (const img of images) {
      let base64Data = "";
      let mimeType = "image/jpeg";

      if (typeof img === "string") {
        if (img.startsWith("data:")) {
          const match = img.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            base64Data = match[2];
          } else {
            base64Data = img.replace(/^data:[^;]+;base64,/, "");
          }
        } else {
          base64Data = img;
        }
      } else if (img && img.data) {
        base64Data = img.data.replace(/^data:[^;]+;base64,/, "");
        mimeType = img.mimeType || "image/jpeg";
      }

      if (base64Data) {
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

    const playersHint = (rosterPlayers && Array.isArray(rosterPlayers))
      ? rosterPlayers.map(p => `- ID: "${p.id}", Name: "${p.name}", Role: "${p.role || ""}"`).join("\n")
      : "";

    const promptText = `You are an expert Mobile Legends: Bang Bang (MLBB) esports match data extractor.
Analyze the provided post-match screenshot(s) and extract accurate match details for our team (5 players).

Screenshots provided:
- Screenshot 1: Post-match scoreboard (Victory/Defeat, Duration, 5 Players with Hero portrait/name, IGN, K/D/A, Medal: MVP/Gold/Silver/Bronze/Chocolate, Score/Rating).
- Screenshot 2 (if present): Data/Damage screen (Hero Damage Dealt, Damage Taken/Received, Turret Damage, Teamfight Participation %, Gold).

Team Roster to match IGNs against:
${playersHint || "None provided. Use detected IGNs."}

Extraction Rules:
1. "result": either "win" (Victory) or "loss" (Defeat).
2. "duration": string "MM:SS" (e.g. "15:30") or duration in seconds.
3. "matchType": "ranked", "scrim", "tournament", or "casual" if visible; default "ranked".
4. "players": exactly 5 players for the friendly team (our team).
For each player:
- "matchedPlayerId": the ID of the matched player from the Team Roster if matched, otherwise null.
- "detectedName": the IGN as shown on the screen.
- "heroUsed": valid MLBB Hero Name (e.g. "Ling", "Suyou", "Zhuxin", "Ruby", "Angela", "Marcel", "Hirara", "Fanny", "Claude", etc.).
- "rolePlayed": inferred lane/role ("EXP Laner", "Jungler", "Mid Laner", "Gold Laner", "Roamer").
- "kills": integer kills.
- "deaths": integer deaths.
- "assists": integer assists.
- "inGameScore": float number battle score (e.g. 10.8, 7.2, 4.5).
- "medal": string one of: "mvp", "gold", "silver", "bronze", or "none". (Defeat MVP or Victory MVP should be "mvp").
- "savage": boolean true if Savage is indicated, else false.
- "maniac": boolean true if Maniac is indicated, else false.
- "damageDealt": integer hero damage dealt if visible (e.g. 84500), else 0.
- "damageReceived": integer damage taken if visible (e.g. 52300), else 0.
- "turretDamage": integer turret damage if visible (e.g. 6400), else 0.
- "teamfightParticipation": integer percentage (0-100) if visible (e.g. 78), else 0.
- "goldEarned": integer gold earned if visible (e.g. 11200), else 0.

OUTPUT FORMAT: Return strictly valid JSON with no markdown wrapping or text outside JSON:
{
  "result": "win" | "loss",
  "duration": "MM:SS",
  "matchType": "ranked" | "scrim" | "tournament" | "casual",
  "teamTurtles": 0,
  "teamLords": 0,
  "teamTurrets": 0,
  "notes": "",
  "players": [
    {
      "matchedPlayerId": "id-or-null",
      "detectedName": "IGN",
      "heroUsed": "HeroName",
      "rolePlayed": "EXP Laner" | "Jungler" | "Mid Laner" | "Gold Laner" | "Roamer",
      "kills": 0,
      "deaths": 0,
      "assists": 0,
      "inGameScore": 0.0,
      "medal": "mvp" | "gold" | "silver" | "bronze" | "none",
      "savage": false,
      "maniac": false,
      "damageDealt": 0,
      "damageReceived": 0,
      "turretDamage": 0,
      "teamfightParticipation": 0,
      "goldEarned": 0
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

    // Try Gemini 3.6-flash first, fallback to 3.7-flash and 3.5-flash
    const models = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let lastError = null;
    let geminiResponse = null;

    for (const modelName of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyToUse}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
          }
        );

        if (response.ok) {
          geminiResponse = await response.json();
          break;
        } else {
          const errText = await response.text();
          lastError = `Model ${modelName} error (${response.status}): ${errText}`;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    if (!geminiResponse) {
      return res.status(500).json({
        error: "Gemini AI bilan bog'lanishda xatolik yuz berdi: " + (lastError || "Noma'lum xatolik")
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
        throw new Error("JSON formatda javob olinmadi: " + textPart);
      }
    }

    return res.status(200).json({
      success: true,
      data: parsedData
    });
  } catch (error) {
    console.error("OCR API error:", error);
    return res.status(500).json({ error: error.message || "Server xatosi" });
  }
}
