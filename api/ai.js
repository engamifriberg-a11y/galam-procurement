// GET /api/ai?task=risk     → סריקה גיאופוליטית: משברים וחוסרים צפויים בכימיקלים של גלעם
// GET /api/ai?task=trend    → פרשנות מגמה קצרה לכל כימיקל
// GET /api/ai?...&force=1   → עוקף את המטמון (12 שעות)
//
// הפלט כאן הוא הערכת AI מבוססת חיפוש ברשת, לא ציטוט שוק. הממשק מסמן אותו בנפרד.
import { readFile } from 'node:fs/promises';
import { hasDb, kvGet, kvSet } from './_lib/db.js';

const TTL_MS = 12 * 3600 * 1000;

async function chemicals() {
  return JSON.parse(await readFile(new URL('../assets/data/chemicals.json', import.meta.url), 'utf8')).items;
}

const PROMPTS = {
  risk: items => `אתה אנליסט סיכוני שרשרת אספקה של חברת גלעם, יצרנית מרכיבי מזון בישראל.

סרוק מקורות חדשותיים ותעשייתיים עדכניים מ-60 הימים האחרונים ואתר אירועים שעלולים לגרום למחסור או לקפיצת מחיר באספקת הכימיקלים הבאים לישראל ב-3 עד 6 החודשים הקרובים:
${items.map(i => `- ${i.en} (${i.he}), מקור: ${i.origin}, ${i.tons} טון בשנה`).join('\n')}

התייחס במפורש ל: סגירות ותקלות במפעלים, מכסים ומגבלות יצוא, סנקציות, מלחמות והפרעות שיט (ים סוף, תעלת סואץ, הורמוז), מחסור בחומרי גלם במעלה הזרם, מגבלות אנרגיה באירופה ובסין, ומגבלות נמלים וספנות לישראל בפרט.

החזר אך ורק JSON תקין במבנה:
{"asOf":"YYYY-MM-DD","overall":"calm|watch|strained","summary":"שתיים עד שלוש שורות בעברית","alerts":[{"chemical":"שם הכימיקל","severity":"low|medium|high","horizon":"0-3m|3-6m|6-12m","israelImpact":"יש|מוגבל|אין","headline":"כותרת קצרה בעברית","detail":"שתיים עד ארבע שורות בעברית","action":"המלצה אופרטיבית לקניין בעברית","sources":["כתובת"]}]}

אם אין מחסור צפוי בישראל לכימיקל מסוים, אל תמציא התרעה. אם אין בכלל אירועים מהותיים, החזר alerts ריק ו-summary שאומר במפורש שלא מזוהה מחסור צפוי בישראל. אל תחזיר טקסט מחוץ ל-JSON.`,

  trend: items => `אתה אנליסט רכש כימיקלים. עבור כל פריט ברשימה, חפש ברשת את מגמת המחיר העדכנית בשוק העולמי ב-90 הימים האחרונים.

${items.map(i => `- ${i.en} (${i.he})`).join('\n')}

החזר אך ורק JSON תקין: {"asOf":"YYYY-MM-DD","trends":[{"en":"שם באנגלית בדיוק כפי שנמסר","direction":"up|down|flat","magnitude":"מספר באחוזים או null","note":"שורה אחת בעברית","sources":["כתובת"]}]}

אל תמציא מספרים. אם לא מצאת נתון, החזר magnitude null ותאר את המגמה במילים. אל תחזיר טקסט מחוץ ל-JSON.`
};

async function callAnthropic(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 6000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12 }],
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

async function callGemini(prompt) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] })
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return (data.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join('\n');
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('no JSON in model output');
  return JSON.parse(raw.slice(start, end + 1));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const task = req.query.task === 'trend' ? 'trend' : 'risk';
  const provider = process.env.ANTHROPIC_API_KEY ? 'anthropic' : (process.env.GEMINI_API_KEY ? 'gemini' : null);
  const cacheKey = `ai:${task}`;

  if (!req.query.force && hasDb()) {
    try {
      const cached = await kvGet(cacheKey);
      if (cached && Date.now() - new Date(cached.at).getTime() < TTL_MS) {
        return res.status(200).json({ ...cached, cached: true });
      }
    } catch { /* מטמון לא זמין, ממשיכים */ }
  }

  if (!provider) {
    return res.status(503).json({
      error: 'no_ai_key',
      message: 'לא הוגדר מפתח AI. יש להוסיף ANTHROPIC_API_KEY או GEMINI_API_KEY במשתני הסביבה של הפרויקט ב-Vercel.',
      task
    });
  }

  try {
    const prompt = PROMPTS[task](await chemicals());
    const text = provider === 'anthropic' ? await callAnthropic(prompt) : await callGemini(prompt);
    const payload = { task, provider, at: new Date().toISOString(), data: extractJson(text) };
    if (hasDb()) { try { await kvSet(cacheKey, payload); } catch { /* לא קריטי */ } }
    return res.status(200).json(payload);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'ai_failed', message: String(e.message || e), task, provider });
  }
}
