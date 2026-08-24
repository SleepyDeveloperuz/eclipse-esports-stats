const GIST_ID = process.env.GIST_ID || "33fed4cb6b1caf42ba709cc73ddec290";
const GITHUB_TOKEN = process.env.GITHUB_SYNC_TOKEN;

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
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

    if (req.method === "POST") {
      if (!GITHUB_TOKEN) {
        return res.status(500).json({ error: "GITHUB_SYNC_TOKEN environment variable not set on server" });
      }

      const payload = req.body;
      if (!payload) {
        return res.status(400).json({ error: "Payload missing" });
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
        return res.status(updateRes.status).json({ error: "Failed to update gist", details: errText });
      }

      return res.status(200).json({ success: true, updatedAt: new Date().toISOString() });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("API Sync error:", error);
    return res.status(500).json({ error: error.message });
  }
}
