import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "20kb" }));

if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is not set.");
    console.error("Create a .env file and add:");
    console.error("GEMINI_API_KEY=YOUR_GEMINI_API_KEY");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.get("/", (req, res) => {
    res.send("ArduSchool Gemini Advisory Backend is running.");
});

app.post("/api/advisory", async (req, res) => {

    try {

        const d = req.body || {};

        const prompt = `
You are the Gemini AI School Advisory for ArduSchool WeatherSense.

Your job is to analyze the CURRENT school weather sensor readings below and produce one concise school safety advisory.

IMPORTANT RULES:
- Use ONLY the supplied sensor data.
- Do not invent weather measurements or forecasts.
- Consider both current conditions and the model probabilities.
- Prioritize student and school safety.
- Mention the most important risk first.
- Give practical school actions such as hydration, shade, indoor activities, covered walkways, or monitoring outdoor activities when appropriate.
- Do not diagnose medical conditions.
- Do not tell the school to suspend classes unless the supplied data clearly indicates a severe condition; instead recommend monitoring and appropriate safety precautions.
- Return ONLY the advisory text.
- Keep it to 1 short paragraph, preferably 35-70 words.
- Do not use Markdown, bullet points, labels, or quotation marks.

CURRENT ARDUSCHOOL DATA:
Temperature: ${Number(d.temperature).toFixed(1)} °C
Humidity: ${Number(d.humidity).toFixed(1)} %
Pressure: ${Number(d.pressure).toFixed(1)} hPa
Heat Index: ${Number(d.heatIndex).toFixed(1)} °C
Current Rainfall: ${Number(d.currentRainfall).toFixed(2)} mm
Rainfall This Minute: ${Number(d.rainfallMinute).toFixed(2)} mm
Rainfall This Hour: ${Number(d.rainfallHour).toFixed(2)} mm
Rainfall Today: ${Number(d.rainfallDay).toFixed(2)} mm
Rain Status: ${d.rainStatus || "Unknown"}
Heat Status: ${d.heatStatus || "Unknown"}
Rain Probability (next 30 minutes): ${Number(d.rainProbability).toFixed(1)} %
Heat Probability (next 30 minutes): ${Number(d.heatProbability).toFixed(1)} %
Temperature Change (30 minutes): ${Number(d.deltaTemperature30min).toFixed(2)} °C
Humidity Change (30 minutes): ${Number(d.deltaHumidity30min).toFixed(2)} %
`;

        const interaction =
            await ai.interactions.create({
                model: "gemini-3.8-flash",
                input: prompt
            });

        const advisory =
            String(interaction.output_text || "").trim();

        if (!advisory) {
            throw new Error("Gemini returned an empty advisory.");
        }

        res.json({
            advisory
        });

    } catch (error) {

        console.error("Gemini advisory error:", error);

        res.status(500).json({
            error: "Gemini advisory request failed."
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("----------------------------------------");
    console.log("ArduSchool Gemini Backend");
    console.log(`Listening on port ${PORT}`);
    console.log("----------------------------------------");
});
