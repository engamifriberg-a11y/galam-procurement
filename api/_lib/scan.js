// הגרעין של מודול הניתוח, משותף לנתיב ה-API ולמשימת הרקע היומית.
import { readFile } from 'node:fs/promises';
import { hasDb, kvGet, kvSet } from './db.js';
import { fetchNews, digest } from './news.js';

export async function chemicals() {
  return JSON.parse(await readFile(new URL('../../assets/data/chemicals.json', import.meta.url), 'utf8')).items;
}

const TTL_MS = 12 * 3600 * 1000;
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
export let lastCallMs = null, lastUsage = null;
export const callStats = () => ({ lastCallMs, lastUsage });

// פונקציה חסרת-זמן תחזיר 504 של הפלטפורמה בלי הסבר. עדיף להיכשל מפורשות.
export async function withTimeout(ms, label, fn) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fn(ctl.signal); }
  catch (e) {
    if (e.name === 'AbortError') throw new Error(`${label}: חריגת זמן אחרי ${ms / 1000} שניות`);
    throw e;
  } finally { clearTimeout(t); }
}

export function provider() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.NVIDIA_API_KEY) return 'nvidia';
  return null;
}

const JSON_SHAPE = `{"asOf":"YYYY-MM-DD","overall":"calm|watch|strained","summary":"שתיים עד שלוש שורות בעברית","alerts":[{"chemical":"שם הכימיקל","severity":"low|medium|high","horizon":"0-3m|3-6m|6-12m","israelImpact":"יש|מוגבל|אין","headline":"כותרת קצרה בעברית","detail":"שתיים עד ארבע שורות בעברית","action":"המלצה אופרטיבית לקניין בעברית","refs":[מספרי פריטים מהרשימה]}]}`;

export function riskPromptGrounded(items, news) {
  return `כותרות חדשות אמיתיות, ממוספרות:

${digest(news)}

כימיקלים שגלעם רוכשת בישראל:
${items.map(i => i.en).join(', ')}

החזר JSON קומפקטי בלבד. לכל היותר 4 התרעות, רק כאלה שבאמת מאיימות על אספקה לישראל ב-6 החודשים הקרובים.
כל התרעה חייבת שדה ref עם מספר כותרת מהרשימה. בלי ref — אל תכלול אותה.
note ו-act: עד 12 מילים כל אחד, בעברית. בלי טקסט מחוץ ל-JSON.

{"overall":"calm|watch|strained","alerts":[{"ref":0,"chem":"שם הכימיקל","sev":"low|medium|high","hz":"0-3m|3-6m|6-12m","il":"יש|מוגבל|אין","note":"","act":""}]}

אם אין איום אמיתי: {"overall":"calm","alerts":[]}`;
}

export function riskPromptSearch(items) {
  return `אתה אנליסט סיכוני שרשרת אספקה של חברת גלעם, יצרנית מרכיבי מזון בישראל.

חפש ברשת אירועים מ-60 הימים האחרונים שעלולים לגרום למחסור או לקפיצת מחיר באספקת הכימיקלים הבאים לישראל ב-3 עד 6 החודשים הקרובים:
${items.map(i => `- ${i.en} (${i.he}), מקור: ${i.origin}, ${i.tons} טון בשנה`).join('\n')}

התייחס לסגירות מפעלים, כוח עליון, מכסים ומגבלות יצוא, סנקציות, הפרעות שיט בים סוף ובסואץ, מחסור במעלה הזרם, עלויות אנרגיה, ומגבלות נמלים בישראל.

אל תמציא התרעות. אם אין מחסור צפוי בישראל, החזר alerts ריק ואמור זאת במפורש ב-summary.
החזר אך ורק JSON תקין: ${JSON_SHAPE.replace('"refs":[מספרי פריטים מהרשימה]', '"sources":["כתובת"]')}
בלי טקסט מחוץ ל-JSON.`;
}

export const trendPrompt = items => `אתה אנליסט רכש כימיקלים. עבור כל פריט, תאר את מגמת המחיר בשוק העולמי ב-90 הימים האחרונים.

${items.map(i => `- ${i.en} (${i.he})`).join('\n')}

אל תמציא מספרים. אם אינך יודע נתון מדויק, החזר magnitude null ותאר את המגמה במילים.
החזר אך ורק JSON: {"asOf":"YYYY-MM-DD","trends":[{"en":"שם באנגלית בדיוק כפי שנמסר","direction":"up|down|flat","magnitude":null,"note":"שורה אחת בעברית","confidence":"low|medium|high"}]}`;

/* ---------- ספקים ---------- */
export async function callAnthropic(prompt) {
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

export async function callGemini(prompt) {
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
export async function callNvidia(prompt, override) {
  const model = override || process.env.NVIDIA_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct';
  const t0 = Date.now();
  const r = await withTimeout(52000, 'NVIDIA', signal => fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 1800,
      // gpt-oss חושף בקרת מאמץ חשיבה רשמית. מתג ה-chat_template_kwargs שניסיתי
      // קודם אינו נתמך כאן והוא זה שגרם לקריאה להיתקע.
      ...(model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
      messages: [
        // "detailed thinking off" מכבה את שרשרת החשיבה במשפחת Nemotron.
        // בלעדיה המודל מייצר אלפי טוקני הגיון וחורג ממגבלת הזמן של הפונקציה.
        { role: 'system', content: 'אתה אנליסט רכש. החזר JSON תקין בלבד, בלי הסברים ובלי גדרות קוד. אל תמציא עובדות או מקורות.' },
        { role: 'user', content: prompt }
      ]
    })
  }));
  if (!r.ok) throw new Error(`nvidia ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const d = await r.json();
  lastCallMs = Date.now() - t0;
  lastUsage = d.usage || null;
  const msg = d.choices?.[0]?.message || {};
  // מודלי חשיבה עלולים להחזיר את הפלט תחת reasoning_content ולהשאיר content ריק
  const out = msg.content || msg.reasoning_content || '';
  if (!out) {
    throw new Error(`המודל החזיר תוכן ריק. שדות: ${Object.keys(msg).join(',') || 'אין'} · סיבת סיום: ${d.choices?.[0]?.finish_reason || 'לא ידועה'}`);
  }
  return out;
}

// אבחון: מחזיר את מבנה התשובה הגולמי כדי לראות לאן המודל כותב
export async function nvidiaRaw(prompt, override) {
  const model = override || process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b';
  const r = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
  });
  const body = await r.json().catch(() => ({}));
  const msg = body.choices?.[0]?.message || {};
  return { status: r.status, finish: body.choices?.[0]?.finish_reason, keys: Object.keys(msg),
    contentLen: (msg.content || '').length, reasoningLen: (msg.reasoning_content || '').length,
    content: (msg.content || '').slice(0, 300), reasoning: (msg.reasoning_content || '').slice(0, 300), usage: body.usage };
}

export async function nvidiaModels() {
  const r = await fetch(`${NVIDIA_BASE}/models`, { headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}` } });
  if (!r.ok) throw new Error(`nvidia ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return (d.data || []).map(m => m.id);
}

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('המודל לא החזיר JSON: ' + text.slice(0, 200));
  const body = raw.slice(start);

  try { return JSON.parse(body.slice(0, body.lastIndexOf('}') + 1)); } catch { /* ננסה לשחזר */ }

  // פלט שנקטע באמצע: חותכים לאובייקט השלם האחרון בתוך alerts וסוגרים את המבנה
  const lastComplete = body.lastIndexOf('},');
  if (lastComplete > 0) {
    const candidate = body.slice(0, lastComplete + 1) + ']}';
    try { const o = JSON.parse(candidate); o._truncated = true; return o; } catch { /* נמשיך */ }
  }
  const openArr = body.indexOf('"alerts"');
  if (openArr > 0) {
    const candidate = body.slice(0, openArr) + '"alerts":[]}';
    try { const o = JSON.parse(candidate.replace(/,\s*"alerts":\[\]\}$/, ',"alerts":[]}')); o._truncated = true; return o; } catch { /* נמשיך */ }
  }
  throw new Error('JSON לא תקין מהמודל (' + text.length + ' תווים): ' + text.slice(-160));
}


/* מריץ משימה שלמה ומחזיר payload מוכן לשמירה במטמון. משמש גם את משימת הרקע. */
export async function runTask(task) {
  const prov = provider();
  if (!prov) throw new Error('no_ai_key');
  const items = await chemicals();
  let prompt, grounding = null, newsIndex = null;

  if (task === 'trend') {
    prompt = trendPrompt(items);
  } else if (prov === 'nvidia') {
    const news = await fetchNews({ perQuery: 5, limit: 18 });
    if (!news.items.length) throw new Error('no_news: לא התקבלו כותרות. בלי עוגן אמיתי המודל לא מורץ.');
    grounding = { source: 'Google News RSS', items: news.items.length, queries: news.queries, failed: news.failed };
    newsIndex = news.items;
    prompt = riskPromptGrounded(items, news.items);
  } else {
    prompt = riskPromptSearch(items);
  }

  const text = prov === 'anthropic' ? await callAnthropic(prompt)
    : prov === 'gemini' ? await callGemini(prompt)
    : await callNvidia(prompt);

  const data = extractJson(text);

  if (task === 'risk' && newsIndex) {
    const byI = new Map(newsIndex.map(n => [n.i, n]));
    data.alerts = (Array.isArray(data.alerts) ? data.alerts : [])
      .map(a => {
        const refs = [a.ref, ...(Array.isArray(a.refs) ? a.refs : [])].map(Number).filter(n => byI.has(n));
        if (!refs.length) return null;            // התרעה בלי עוגן אמיתי נפסלת
        const n = byI.get(refs[0]);
        return {
          chemical: a.chem || a.chemical || '—',
          severity: a.sev || a.severity || 'low',
          horizon: a.hz || a.horizon || '3-6m',
          israelImpact: a.il || a.israelImpact || 'מוגבל',
          headline: n.title,
          detail: a.note || a.detail || '',
          action: a.act || a.action || '',
          refs,
          sources: refs.map(i => byI.get(i).url),
          refTitles: refs.map(i => `${byI.get(i).source}: ${byI.get(i).title}`)
        };
      })
      .filter(Boolean);

    const sev = data.alerts.filter(a => a.severity === 'high').length;
    data.asOf = new Date().toISOString().slice(0, 10);
    data.summary = data.alerts.length
      ? `נמצאו ${data.alerts.length} אירועים רלוונטיים לאספקה לישראל${sev ? `, מהם ${sev} בחומרה גבוהה` : ''}. כל אירוע מקושר לכותרת שעליה הוא מבוסס.`
      : 'לא זוהה בכותרות האחרונות אירוע שצפוי לגרום למחסור בכימיקלים של גלעם בישראל.';
  }

  const payload = { task, provider: prov, model: prov === 'nvidia' ? (process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b') : undefined, grounding, at: new Date().toISOString(), data };
  if (hasDb()) { try { await kvSet(`ai:${task}`, payload); } catch { /* לא קריטי */ } }
  return payload;
}
