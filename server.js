import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();

// ✅ Allow CORS (សម្រាប់ Frontend HTML)
app.use(cors({
  origin: ["http://127.0.0.1:5500", "http://localhost:5500", "https://my-tts-frontend.com"],
  methods: ["GET", "POST"],
}));

app.use(express.json());

// ✅ Load Azure Speech Key
const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION || "eastasia";
const ENDPOINT = process.env.AZURE_SPEECH_ENDPOINT || `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

app.post("/api/tts", async (req, res) => {
  if (!AZURE_KEY || !REGION) {
    console.error("❌ Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION");
    return res.status(500).json({ error: "Server configuration error." });
  }

  try {
    const { text, voice } = req.body;

    if (!text || !voice) {
      console.warn("Missing text or voice:", req.body);
      return res.status(400).json({ error: "Missing text or voice." });
    }

    if (!/^[a-z]{2}-[A-Z]{2}-\w+Neural$/.test(voice)) {
      console.warn("Invalid voice format:", voice);
      return res.status(400).json({ error: "Invalid voice format." });
    }

    const langCode = voice.substring(0, 5);
    const ssml = `
      <speak version='1.0' xml:lang='${langCode}' xmlns='http://www.w3.org/2001/10/synthesis'>
        <voice name='${voice}'>${text}</voice>
      </speak>`;

    // ✅ Log only AZURE_KEY (partial)
    console.log("🟦 Azure Config:", { REGION, AZURE_KEY: AZURE_KEY?.slice(0, 6) + "..." });

    const audioRes = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "AzureSpeechServer",
      },
      body: ssml,
    });

    if (!audioRes.ok) {
      const errorText = await audioRes.text();
      console.error(`❌ Azure Error ${audioRes.status}: ${errorText}`);
      return res.status(audioRes.status).json({
        error: `Azure TTS failed (${audioRes.status})`,
        details: errorText.substring(0, 250),
      });
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    console.error("💥 Internal Server Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

app.get("/", (req, res) => res.send("✅ Azure Speech Server Running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
