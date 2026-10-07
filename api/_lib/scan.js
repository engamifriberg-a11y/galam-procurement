// הגרעין של מודול הניתוח, משותף לנתיב ה-API ולמשימת הרקע היומית.
import { readFile } from 'node:fs/promises';
import { hasDb, kvGet, kvSet } from './db.js';
import { fetchNews, digest } from './news.js';
import { analyse } from './analysis.js';
import { catalog as catalogSeries } from './market.js';

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

/* מפתח שהוזן מהממשק גובר על משתני הסביבה, כי הוא ההחלטה המפורשת האחרונה
   של המשתמש. Gemini מועדף כשהוא קיים, כי יש לו חיפוש Google מובנה. */
export async function aiConfig() {
  let saved = null;
  if (hasDb()) { try { saved = await kvGet('settings:ai'); } catch { /* ממשיכים לסביבה */ } }
  if (saved?.geminiKey) return { prov: 'gemini', key: saved.geminiKey, model: saved.geminiModel || 'gemini-2.5-flash', search: true, source: 'ממשק' };
  if (process.env.ANTHROPIC_API_KEY) return { prov: 'anthropic', key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', search: true, source: 'סביבה' };
  if (process.env.GEMINI_API_KEY) return { prov: 'gemini', key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', search: true, source: 'סביבה' };
  if (process.env.NVIDIA_API_KEY) return { prov: 'nvidia', key: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_MODEL || 'openai/gpt-oss-20b', search: false, source: 'סביבה' };
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

/* גוגל נמצאת במעבר בין שני סוגי מפתחות: הישן AIza נשלח בפרמטר key בכתובת,
   והחדש AQ. הוא מפתח הזדהות שנשלח בכותרת. אנחנו מנסים את השיטה שמתאימה
   לפורמט, ואם היא נדחית מנסים את השנייה — כך שני הסוגים עובדים. */
export async function geminiFetch(model, body, key, signal) {
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const attempts = key.startsWith('AQ.')
    ? [['bearer', { authorization: `Bearer ${key}` }], ['header', { 'x-goog-api-key': key }], ['query', null]]
    : [['query', null], ['header', { 'x-goog-api-key': key }], ['bearer', { authorization: `Bearer ${key}` }]];

  let last = null;
  for (const [mode, extra] of attempts) {
    const url = mode === 'query' ? `${base}?key=${encodeURIComponent(key)}` : base;
    const r = await fetch(url, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', ...(extra || {}) },
      body: JSON.stringify(body)
    });
    if (r.ok) return { r, mode };
    last = { status: r.status, text: (await r.text()).slice(0, 220), mode };
    if (r.status !== 400 && r.status !== 401 && r.status !== 403) break;  // לא בעיית הזדהות
  }
  const err = new Error(`gemini ${last.status} (${last.mode}): ${last.text}`);
  err.detail = last;
  throw err;
}

export async function callGemini(prompt, cfg = {}) {
  const model = cfg.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const key = cfg.key || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('אין מפתח Gemini');
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  if (cfg.search !== false) body.tools = [{ google_search: {} }];

  const { r } = await withTimeout(52000, 'Gemini', signal => geminiFetch(model, body, key, signal));
  const d = await r.json();
  const out = (d.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join('\n');
  if (!out) throw new Error(`Gemini החזיר תוכן ריק. סיבת סיום: ${d.candidates?.[0]?.finishReason || 'לא ידועה'}`);
  return out;
}


// NVIDIA NIM — תואם OpenAI
export async function callNvidia(prompt, override, opts = {}) {
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
        { role: 'system', content: opts.plain
            ? 'אתה מנהל רכש בכיר. אתה כותב עברית תמציתית ומקצועית, בלי כותרות ובלי רשימות. אתה משתמש אך ורק במספרים שנמסרו לך ולעולם לא ממציא נתון.'
            : 'אתה אנליסט רכש. החזר JSON תקין בלבד, בלי הסברים ובלי גדרות קוד. אל תמציא עובדות או מקורות.' },
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
  const cfg = await aiConfig();
  if (!cfg) throw new Error('no_ai_key');
  const prov = cfg.prov;
  const items = await chemicals();
  let prompt, grounding = null, newsIndex = null;

  if (task === 'trend') {
    prompt = trendPrompt(items);
  } else if (!cfg.search) {
    // ספק בלי חיפוש מובנה — חייב עוגן כותרות
    const news = await fetchNews({ perQuery: 5, limit: 18 });
    if (!news.items.length) throw new Error('no_news: לא התקבלו כותרות. בלי עוגן אמיתי המודל לא מורץ.');
    grounding = { source: 'Google News RSS', items: news.items.length, queries: news.queries, failed: news.failed };
    newsIndex = news.items;
    prompt = riskPromptGrounded(items, news.items);
  } else {
    prompt = riskPromptSearch(items);
  }

  const text = prov === 'anthropic' ? await callAnthropic(prompt)
    : prov === 'gemini' ? await callGemini(prompt, cfg)
    : await callNvidia(prompt, cfg.model);

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

  const payload = { task, provider: prov, model: cfg.model, source: cfg.source, grounding, at: new Date().toISOString(), data };
  if (hasDb()) { try { await kvSet(`ai:${task}`, payload); } catch { /* לא קריטי */ } }
  return payload;
}


/* ================= שכבת ה-AI של שאר הלשוניות =================
   כאן המודל לא מביא נתונים ולא מחפש. הוא מקבל את המספרים שהמערכת כבר
   חישבה ומנסח מהם קריאה לקניין. זה השימוש הבטוח: ניסוח, לא המצאה. */

const GROUPS = {
  paper:   { he: 'נייר ועיסת נייר', groups: ['paper'] },
  energy:  { he: 'אנרגיה ופלסטיקים', groups: ['energy', 'plastic'] },
  fx:      { he: 'שערי מטבע', groups: ['fx'] },
  freight: { he: 'הובלה', groups: ['freight'] }
};

const fmtPct = v => v == null || !Number.isFinite(v) ? 'אין נתון' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';

export async function briefGroup(key) {
  const cfg = GROUPS[key];
  if (!cfg) throw new Error('unknown group');
  const { series } = await analyse('d90');
  const list = series.filter(s => cfg.groups.includes(s.group));
  const withData = list.filter(s => s.last != null);

  if (!withData.length) {
    return { group: key, he: cfg.he, empty: true,
      text: `אין עדיין נתונים בקבוצת ${cfg.he}. הזן ערכים לאינדקסים המנוהלים ותתקבל כאן קריאה.` };
  }

  const table = withData.map(s =>
    `${s.he}: ${s.last}${s.unit} | חודש ${fmtPct(s.chg?.d30)} | רבעון ${fmtPct(s.chg?.d90)} | שנה ${fmtPct(s.chg?.d365)} | תנודתיות ${s.vol90 == null ? 'אין' : s.vol90.toFixed(0) + '%'}`
  ).join('\n');

  const missing = list.filter(s => s.last == null).map(s => s.he);

  const prompt = `אתה מנהל רכש בכיר בחברת גלעם, יצרנית מרכיבי מזון בישראל. לפניך נתוני שוק מדודים בקבוצת ${cfg.he}:

${table}
${missing.length ? `\nסדרות בלי נתון: ${missing.join(', ')}` : ''}

כתוב לקניין קריאה קצרה בעברית, בשלושה חלקים, בלי כותרות ובלי רשימות:
משפט אחד על מה זז הכי הרבה ולאיזה כיוון. משפט אחד על המשמעות לעלויות הרכש של גלעם. משפט אחד על מה לעשות או על מה לעקוב השבוע.

חוקים: השתמש אך ורק במספרים שלמעלה. אל תוסיף מחירים, תחזיות מספריות או אירועים שאינם כאן. עד 60 מילים בסך הכל. החזר טקסט בלבד, בלי JSON.`;

  const text = await callByProvider(prompt);
  return { group: key, he: cfg.he, text: text.trim(), basedOn: withData.length, missing: missing.length, at: new Date().toISOString() };
}

export async function pitchItem(key, window = 'd90') {
  const { rows } = await analyse(window);
  const row = rows.find(r => (r.item.item || String(r.item.n)) === String(key));
  if (!row) throw new Error('unknown item');
  const { item, exp, paid, rec, fr } = row;

  const drivers = exp.parts.map(p => `${p.he} (משקל ${(p.w * 100).toFixed(0)}%): ${fmtPct(p.chg)}`).join('; ');
  const prompt = `אתה מנהל רכש בכיר בגלעם. הכן לקניין נימוק לשיחה מול הספק.

פריט: ${item.he || item.en} (${item.en})
כמות שנתית: ${item.tons} טון | ספקים חלופיים: ${item.sup} | מקור: ${item.origin} | מטבע: ${item.cur}
אופן הובלה: ${fr ? fr.he : 'לא מוגדר'}, שינוי ברכיב ההובלה: ${fmtPct(fr?.chg)}
מנועי העלות: ${drivers}
שינוי משוקלל במנועי העלות: ${fmtPct(exp.pct)}
${paid ? `מחיר אחרון ששולם: ${paid.price} ${paid.cur} ל${paid.unit}, קודם: ${paid.prev ?? 'לא הוזן'}` : 'מחיר אחרון: לא הוזן במערכת'}
${rec.gap == null ? '' : `פער בין מה ששולם למה שהשוק מצדיק: ${rec.gap.toFixed(1)} נקודות`}
מסקנת המערכת: ${rec.he}. ${rec.why}
עוצמת מיקוח: ${rec.lev} מתוך 100.

כתוב בעברית שני משפטים בלבד: הטיעון שהקניין יאמר לספק, ואחריו נקודת התורפה הצפויה בתשובת הספק וכיצד להתמודד איתה. השתמש רק במספרים שלמעלה. בלי פתיח, בלי כותרות, בלי רשימות. עד 55 מילים.`;

  const text = await callByProvider(prompt);
  return { key: String(key), item: item.he || item.en, rec: rec.code, text: text.trim(), at: new Date().toISOString() };
}

// טקסט חופשי, לא JSON — הודעת המערכת חייבת להשתנות בהתאם
export async function callByProvider(prompt, { plain = true, search } = {}) {
  const cfg = await aiConfig();
  if (!cfg) throw new Error('no_ai_key');
  if (cfg.prov === 'anthropic') return callAnthropic(prompt);
  if (cfg.prov === 'gemini') return callGemini(prompt, { ...cfg, search });
  return callNvidia(prompt, cfg.model, { plain });
}


/* ================= הצעת ערכים לאינדקסים מנוהלים =================
   זה מה ש"עדכון חי בלחיצת כפתור" באמת אומר לסדרות שאין להן API.
   המודל מחפש את הערך המפורסם, מחזיר אותו עם מקור, והמערכת רק *מציעה*
   אותו בשדה ההזנה. אדם מאשר לפני שהוא נכנס לסדרה. אין כתיבה אוטומטית. */
export async function quoteGroup(groupKey) {
  const cfg = await aiConfig();
  if (!cfg) throw new Error('no_ai_key');
  if (!cfg.search) throw new Error('no_search: הספק הנוכחי אינו יודע לחפש ברשת. יש להזין מפתח Gemini.');

  const defs = await catalogSeries();
  const wanted = (GROUPS[groupKey]?.groups || [groupKey]);
  const list = defs.filter(d => wanted.includes(d.group) && d.provider === 'managed');
  if (!list.length) throw new Error('אין אינדקסים מנוהלים בקבוצה הזו');

  const prompt = `חפש ברשת את הערך המפורסם העדכני ביותר לכל אחד מהמדדים הבאים:

${list.map(d => `- ${d.id} | ${d.he} | יחידה: ${d.unit}${d.note ? ` | ${d.note}` : ''}`).join('\n')}

החזר אך ורק JSON:
{"quotes":[{"id":"מזהה הסדרה בדיוק כפי שנמסר","value":מספר,"asOf":"YYYY-MM-DD","source":"שם המקור","url":"כתובת","confidence":"low|medium|high"}]}

חוקים מחייבים:
1. אל תנחש. אם לא מצאת ערך מפורסם למדד — אל תכלול אותו כלל ברשימה.
2. value חייב להיות המספר ביחידה שצוינה. אל תמיר יחידות.
3. url חייבת להיות כתובת אמיתית שראית בחיפוש.
4. confidence נמוך אם הערך ישן מחודש או אם המקור משני.
בלי טקסט מחוץ ל-JSON.`;

  const text = await callGemini(prompt, { ...cfg, search: true });
  const data = extractJson(text);
  const byId = new Map(list.map(d => [d.id, d]));
  const quotes = (Array.isArray(data.quotes) ? data.quotes : [])
    .filter(q => byId.has(q.id) && Number.isFinite(Number(q.value)) && q.url)
    .map(q => ({ ...q, value: Number(q.value), he: byId.get(q.id).he, unit: byId.get(q.id).unit }));

  return { group: groupKey, asked: list.length, quotes, provider: cfg.prov, model: cfg.model, at: new Date().toISOString() };
}
