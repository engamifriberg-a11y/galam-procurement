// GET /api/ai?task=risk     → סריקת משברים וחוסרים צפויים בכימיקלים של גלעם
// GET /api/ai?task=trend    → פרשנות מגמה קצרה לכל כימיקל
// GET /api/ai?force=1       → עוקף מטמון (12 שעות)
// GET /api/ai?models=1      → בדיקת חיבור: רשימת המודלים הזמינים אצל הספק
//
// שלושה ספקים נתמכים, לפי סדר עדיפות: Anthropic, Gemini, NVIDIA NIM.
// לשניים הראשונים יש חיפוש ברשת מובנה. ל-NVIDIA אין, ולכן כשהוא הספק הפעיל
// אנחנו מזינים לו מראש כותרות חדשות אמיתיות (api/_lib/news.js) והוא מצטט
// לפי מספר הפריט בלבד. מודל שפה בלי עוגן כזה ימציא משברים.
import { readFile } from 'node:fs/promises';
import { hasDb, kvGet, kvSet } from './_lib/db.js';
import { fetchNews, digest } from './_lib/news.js';

const TTL_MS = 12 * 3600 * 1000;
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';

// פונקציה חסרת-זמן תחזיר 504 של הפלטפורמה בלי הסבר. עדיף להיכשל מפורשות.
async function withTimeout(ms, label, fn) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fn(ctl.signal); }
  catch (e) {
    if (e.name === 'AbortError') throw new Error(`${label}: חריגת זמן אחרי ${ms / 1000} שניות`);
    throw e;
  } finally { clearTimeout(t); }
}

function provider() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.NVIDIA_API_KEY) return 'nvidia';
  return null;
}

async function chemicals() {
  return JSON.parse(await readFile(new URL('../assets/data/chemicals.json', import.meta.url), 'utf8')).items;
}

const JSON_SHAPE = `{"asOf":"YYYY-MM-DD","overall":"calm|watch|strained","summary":"שתיים עד שלוש שורות בעברית","alerts":[{"chemical":"שם הכימיקל","severity":"low|medium|high","horizon":"0-3m|3-6m|6-12m","israelImpact":"יש|מוגבל|אין","headline":"כותרת קצרה בעברית","detail":"שתיים עד ארבע שורות בעברית","action":"המלצה אופרטיבית לקניין בעברית","refs":[מספרי פריטים מהרשימה]}]}`;

function riskPromptGrounded(items, news) {
  return `אתה אנליסט סיכוני שרשרת אספקה של חברת גלעם, יצרנית מרכיבי מזון בישראל.

להלן כותרות חדשות אמיתיות מ-60 הימים האחרונים, ממוספרות:

${digest(news)}

הכימיקלים שגלעם רוכשת:
${items.map(i => `- ${i.en} (${i.he}), מקור: ${i.origin}, ${i.tons} טון בשנה`).join('\n')}

משימתך: לקבוע אילו מהכותרות לעיל מצביעות על סיכון למחסור או לקפיצת מחיר באספקת הכימיקלים האלה לישראל ב-3 עד 6 החודשים הקרובים. שקול סגירות מפעלים, כוח עליון, מכסים ומגבלות יצוא, סנקציות, הפרעות שיט בים סוף ובסואץ, מחסור במעלה הזרם, עלויות אנרגיה באירופה ובסין, ומגבלות נמלים בישראל.

כללים מחייבים:
1. בסס כל התרעה אך ורק על הכותרות שלמעלה. אל תוסיף אירועים שאינם ברשימה.
2. בשדה refs ציין את מספרי הכותרות שעליהן ההתרעה מבוססת. התרעה בלי refs אסורה.
3. אם כותרת אינה רלוונטית לכימיקלים של גלעם או לאספקה לישראל — התעלם ממנה.
4. אם אין בכותרות אירוע מהותי, החזר alerts ריק ו-summary שאומר במפורש שלא מזוהה מחסור צפוי בישראל. זו תשובה לגיטימית ואף רצויה.
5. אל תמציא מספרים, אחוזים או תאריכים שאינם בכותרות.

החזר אך ורק JSON תקין במבנה: ${JSON_SHAPE}
בלי טקסט מחוץ ל-JSON.`;
}

function riskPromptSearch(items) {
  return `אתה אנליסט סיכוני שרשרת אספקה של חברת גלעם, יצרנית מרכיבי מזון בישראל.

חפש ברשת אירועים מ-60 הימים האחרונים שעלולים לגרום למחסור או לקפיצת מחיר באספקת הכימיקלים הבאים לישראל ב-3 עד 6 החודשים הקרובים:
${items.map(i => `- ${i.en} (${i.he}), מקור: ${i.origin}, ${i.tons} טון בשנה`).join('\n')}

התייחס לסגירות מפעלים, כוח עליון, מכסים ומגבלות יצוא, סנקציות, הפרעות שיט בים סוף ובסואץ, מחסור במעלה הזרם, עלויות אנרגיה, ומגבלות נמלים בישראל.

אל תמציא התרעות. אם אין מחסור צפוי בישראל, החזר alerts ריק ואמור זאת במפורש ב-summary.
החזר אך ורק JSON תקין: ${JSON_SHAPE.replace('"refs":[מספרי פריטים מהרשימה]', '"sources":["כתובת"]')}
בלי טקסט מחוץ ל-JSON.`;
}

const trendPrompt = items => `אתה אנליסט רכש כימיקלים. עבור כל פריט, תאר את מגמת המחיר בשוק העולמי ב-90 הימים האחרונים.

${items.map(i => `- ${i.en} (${i.he})`).join('\n')}

אל תמציא מספרים. אם אינך יודע נתון מדויק, החזר magnitude null ותאר את המגמה במילים.
החזר אך ורק JSON: {"asOf":"YYYY-MM-DD","trends":[{"en":"שם באנגלית בדיוק כפי שנמסר","direction":"up|down|flat","magnitude":null,"note":"שורה אחת בעברית","confidence":"low|medium|high"}]}`;

/* ---------- ספקים ---------- */
async function callAnthropic(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 6000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12 }],
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

async function callGemini(prompt) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] })
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return (d.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join('\n');
}

// NVIDIA NIM — תואם OpenAI
async function callNvidia(prompt) {
  const model = process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct';
  const r = await withTimeout(38000, 'NVIDIA', signal => fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: 'אתה אנליסט רכש. אתה מחזיר JSON תקין בלבד, בלי הסברים ובלי גדרות קוד. אינך ממציא עובדות, מספרים או מקורות.' },
        { role: 'user', content: prompt }
      ]
    })
  }));
  if (!r.ok) throw new Error(`nvidia ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

async function nvidiaModels() {
  const r = await fetch(`${NVIDIA_BASE}/models`, { headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}` } });
  if (!r.ok) throw new Error(`nvidia ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return (d.data || []).map(m => m.id);
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('המודל לא החזיר JSON: ' + text.slice(0, 200));
  return JSON.parse(raw.slice(start, end + 1));
}

/* ---------- handler ---------- */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const prov = provider();

  if (req.query.models) {
    if (prov !== 'nvidia') return res.status(400).json({ error: 'models listing is NVIDIA-only', provider: prov });
    try { return res.status(200).json({ provider: 'nvidia', models: await nvidiaModels() }); }
    catch (e) { return res.status(502).json({ error: String(e.message) }); }
  }

  // אבחון: מבודד איזה שלב נכשל, בלי לנחש
  if (req.query.step === 'news') {
    try {
      const t0 = Date.now();
      const news = await fetchNews();
      return res.status(200).json({ step: 'news', ms: Date.now() - t0, items: news.items.length, failed: news.failed, sample: news.items.slice(0, 5) });
    } catch (e) { return res.status(502).json({ step: 'news', error: String(e.message) }); }
  }
  if (req.query.step === 'ping') {
    try {
      const t0 = Date.now();
      const out = await callNvidia('החזר בדיוק את ה-JSON הזה ותו לא: {"ok":true}');
      return res.status(200).json({ step: 'ping', ms: Date.now() - t0, model: process.env.NVIDIA_MODEL, raw: out.slice(0, 400) });
    } catch (e) { return res.status(502).json({ step: 'ping', error: String(e.message), model: process.env.NVIDIA_MODEL }); }
  }

  const task = req.query.task === 'trend' ? 'trend' : 'risk';
  const cacheKey = `ai:${task}`;

  if (!req.query.force && hasDb()) {
    try {
      const c = await kvGet(cacheKey);
      if (c && Date.now() - new Date(c.at).getTime() < TTL_MS) return res.status(200).json({ ...c, cached: true });
    } catch { /* ממשיכים בלי מטמון */ }
  }

  if (!prov) {
    return res.status(503).json({ error: 'no_ai_key', task,
      message: 'לא הוגדר מפתח AI. יש להוסיף NVIDIA_API_KEY, ANTHROPIC_API_KEY או GEMINI_API_KEY במשתני הסביבה ב-Vercel.' });
  }

  try {
    const items = await chemicals();
    let prompt, grounding = null;

    if (task === 'trend') {
      prompt = trendPrompt(items);
    } else if (prov === 'nvidia') {
      const news = await fetchNews({ perQuery: 6, limit: 55 });
      if (!news.items.length) {
        return res.status(502).json({ error: 'no_news', task, provider: prov,
          message: 'לא התקבלו כותרות חדשות. בלי עוגן אמיתי המערכת לא מריצה את המודל, כדי שלא יומצאו משברים.',
          failed: news.failed });
      }
      grounding = { source: 'Google News RSS', items: news.items.length, queries: news.queries, failed: news.failed };
      prompt = riskPromptGrounded(items, news.items);
      var newsIndex = news.items;
    } else {
      prompt = riskPromptSearch(items);
    }

    const text = prov === 'anthropic' ? await callAnthropic(prompt)
      : prov === 'gemini' ? await callGemini(prompt)
      : await callNvidia(prompt);

    const data = extractJson(text);

    // המרת הפניות למספרי כותרות לקישורים אמיתיים, ופסילת התרעה בלי עוגן
    if (task === 'risk' && newsIndex) {
      const byI = new Map(newsIndex.map(n => [n.i, n]));
      data.alerts = (Array.isArray(data.alerts) ? data.alerts : []).map(a => {
        const refs = (Array.isArray(a.refs) ? a.refs : []).map(Number).filter(n => byI.has(n));
        return { ...a, refs, sources: refs.map(n => byI.get(n).url), refTitles: refs.map(n => `${byI.get(n).source}: ${byI.get(n).title}`) };
      }).filter(a => a.refs.length);
    }

    const payload = { task, provider: prov, model: prov === 'nvidia' ? (process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct') : undefined, grounding, at: new Date().toISOString(), data };
    if (hasDb()) { try { await kvSet(cacheKey, payload); } catch { /* לא קריטי */ } }
    return res.status(200).json(payload);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'ai_failed', message: String(e.message || e), task, provider: prov });
  }
}
