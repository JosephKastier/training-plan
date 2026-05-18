require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `Du bist ein Assistent für einen Lauf-Trainingsplan. 
Deine Aufgabe:Parse natürliche Spracheingaben und gib strukturiertes JSON zurück.

Typen: easy (locker), tempo (Tempolauf), int (Intervalle), long (langer Lauf), race (Wettkampf)

Pace-Bereiche:
- easy: "5:30–6:00"
- tempo/mp: "5:10–5:20"  
- hm: "4:45–4:50"
- 10k: "4:30–4:35"
- vo2max/int: "4:15–4:25"

Antworte NUR mit validem JSON im Format:
{
  "action": "add" | "delete" | "update",
  "date": "YYYY-MM-DD",
  "day": "Mo|Di|Mi|Do|Fr|Sa|So",
  "text": "Beschreibung",
  "pace": "Pace-Bereich",
  "type": "easy|tempo|int|long|race",
  "km": number,
  "week": "W1-W22 (basierend auf Datum, W1 startet 21.04.2026)"
}

Wenn du das Datum nicht eindeutig bestimmen kannst, frag nach. Für Wettkämpfe setze immer type: "race".
Berechne die Woche basierend auf dem Datum (W1 = 21.04.–27.04.2026, W2 = 28.04.–04.05.2026, etc.).`;

async function parseInput(text) {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text }
      ],
      temperature: 0.1,
      max_tokens: 300
    });

    const content = response.choices[0]?.message?.content || '';
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: 'Could not parse response', raw: content };
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { parseInput };
