import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

import { openStore, dailyCsv } from './storage.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = resolve(process.env.DATA_DIR || './data');
if (process.env.RENDER && (!DATA_DIR.startsWith('/var/data/') && DATA_DIR !== '/var/data')) {
 throw new Error('Attach a persistent disk at /var/data and set DATA_DIR=/var/data/weather before starting on Render.');
}
if (process.env.RENDER && !existsSync('/var/data')) throw new Error('Persistent disk /var/data is not mounted.');
if (!process.env.INGEST_TOKEN) throw new Error('Set INGEST_TOKEN to the value supplied in .env.example.');
const store = openStore(DATA_DIR);

app.use(cors());
app.use(express.json({ limit: "20kb" }));

// Weather storage remains available even if Gemini is unavailable.
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY}) : null;
const device = req => String(req.query.device || 'srnhs-weather-1');
const dateOK = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '');
app.get('/health', (req,res)=>res.json({ok:true,storage:'sqlite',dataDir:DATA_DIR}));
app.post('/api/readings', (req,res)=>{
 if(req.get('X-Device-Token') !== process.env.INGEST_TOKEN)return res.status(401).json({error:'Invalid device token'});
 try{const inserted=store.put(req.body||{});res.status(200).json({saved:true,duplicate:!inserted});}
 catch(error){console.error('Storage:',error.message);res.status(/Invalid|Missing|RTC/.test(error.message)?400:503).json({saved:false,error:'Reading was not saved'});}
});
app.get('/api/dates',(req,res)=>res.json({dates:store.dates(device(req))}));
app.get('/api/readings',(req,res)=>{
 if(!dateOK(req.query.date))return res.status(400).json({error:'Use date=YYYY-MM-DD'});
 res.json({readings:store.rows(device(req),req.query.date)});
});
app.get('/api/readings.csv',(req,res)=>{
 if(!dateOK(req.query.date))return res.status(400).json({error:'Use date=YYYY-MM-DD'});
 const rows=store.rows(device(req),req.query.date);
 res.set('Content-Type','text/csv; charset=utf-8');
 res.set('Content-Disposition',`attachment; filename="WeatherSense_${req.query.date}.csv"`);
 res.set('Cache-Control','no-store');res.send(dailyCsv(rows));
});

app.get("/", (req, res) => {
    res.send("ArduSchool Gemini Advisory Backend is running.");
});

app.post("/api/advisory", async (req, res) => {

    try {
        if(!ai)return res.status(503).json({error:'Gemini API key is not configured; weather storage is still active.'});

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
