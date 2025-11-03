import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

const allowedOrigins = [
  "https://trabekprey.com",         // 🌐 Website ផ្លូវការ
  "https://your-frontend.netlify.app", // ប្រសិនបើអ្នកមាន version ផ្សេង
  "http://localhost:5500"           // សម្រាប់សាកល្បងនៅ local
];

dotenv.config();
const app = express();

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
)
app.use(express.json());

// ✅ Use correct env variable names
const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION || "eastasia";
const ENDPOINT =
  process.env.AZURE_SPEECH_ENDPOINT ||
  `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

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

    // ✅ Detect language from voice (example: km-KH)
    const langCode = voice.substring(0, 5);

    // ✅ Generate SSML for Azure Speech
    const ssml = `
      <speak version='1.0' xml:lang='${langCode}' xmlns='http://www.w3.org/2001/10/synthesis'>
        <voice name='${voice}'>${text}</voice>
      </speak>`;

    console.log(`🗣️ Sending request to Azure...`);

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

    // ✅ Convert result to buffer
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    console.error("💥 Internal Server Error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// Health check
app.get("/", (req, res) => res.send("✅ Azure Speech Server Running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
