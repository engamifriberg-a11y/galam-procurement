// GET    /api/spend            → מערך נתוני הרכש, דחוס ב-gzip
// GET    /api/spend?meta=1     → רק הכותרת: מתי עודכן, כמה שורות, איזו תקופה
// GET    /api/spend?track=1    → מעקב ההזדמנויות והיעדים שהוזנו ידנית
// PUT    /api/spend            → החלפת מערך הנתונים מקובץ שנותח בדפדפן
// PUT    /api/spend?track=opps → עדכון שורת מעקב אחת  { id, patch }
// POST   /api/spend?ai=1       → יועץ הרכש. מקבל שאלה וחבילת עובדות מחושבת ומחזיר תשובה
// DELETE /api/spend?track=1    → ניקוי המעקב
//
// למה הנתונים יושבים ב-Neon ולא בקובץ בתיקיית assets: מערך ההזמנות הוא
// ספר הרכש המלא של גלעם — שמות ספקים, מחירים ומחזורים. הריפו הזה ציבורי,
// וקובץ שנכנס אליו נגיש לכל אדם גם אם האתר עצמו מוגן בסיסמה. ב-Neon הוא
// נשאר מאחורי אותה שכבת הרשאות כמו שאר ה-API.
//
// התגובה נדחסת כאן ולא נשענת על הדחיסה האוטומטית, כי גוף התשובה הלא דחוס
// שוקל כ-3.5MB — מעל מה שפונקציה בודדת אמורה להחזיר. דחוס הוא כ-650KB.
import { gzipSync, gunzipSync } from 'node:zlib';
import { hasDb, kvGet, kvSet } from './_lib/db.js';
import { callByProvider } from './_lib/scan.js';

const DATA = 'spend:dataset';
const OPPS = 'spend:opps';
const TARGETS = 'spend:targets';

const STATUSES = ['זוהתה', 'בבדיקה', 'במשא ומתן', 'אושרה', 'מומשה', 'נדחתה'];
const TRACK_FIELDS = ['owner', 'status', 'note', 'approved', 'realized'];

function metaOf(ds) {
  if (!ds?.meta) return null;
  const d = ds.dims || {};
  return {
    rows: ds.meta.rows,
    builtAt: ds.meta.builtAt,
    sourceFile: ds.meta.sourceFile,
    epoch: ds.meta.epoch,
    minDate: ds.meta.minDate,
    maxDate: ds.meta.maxDate,
    suppliers: d.sup?.length ?? 0,
    items: d.item?.length ?? 0,
    orders: d.po?.length ?? 0
  };
}

/* תשובה דחוסה. הדפדפן פורס אותה בעצמו לפי הכותרת. */
function sendGz(res, obj) {
  const buf = gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'), { level: 6 });
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-encoding', 'gzip');
  res.setHeader('content-length', String(buf.length));
  return res.end(buf);
}

function cleanPatch(body) {
  const out = {};
  for (const f of TRACK_FIELDS) {
    if (body[f] === undefined) continue;
    if (f === 'status' && !STATUSES.includes(String(body[f]))) continue;
    if (f === 'approved' || f === 'realized') {
      const n = Number(body[f]);
      out[f] = Number.isFinite(n) ? n : 0;
    } else {
      out[f] = String(body[f]).slice(0, 600);
    }
  }
  return out;
}

/* בדיקת שפיות על מערך שהועלה. עדיף להחזיר שגיאה ברורה מלהחליף
   את הנתונים הקיימים בזבל ולגלות את זה רק במסכים. */
function validate(ds) {
  if (!ds || typeof ds !== 'object') return 'גוף הבקשה אינו אובייקט';
  if (!ds.meta || !ds.dims || !ds.rows) return 'חסרים meta, dims או rows';
  const n = ds.meta.rows;
  if (!Number.isInteger(n) || n < 1) return 'meta.rows אינו מספר שורות תקין';
  for (const k of ['s', 'i', 'p', 'd', 'q', 'up', 'a', 'oq']) {
    if (!Array.isArray(ds.rows[k])) return `חסרה עמודת ${k}`;
    if (ds.rows[k].length !== n) return `אורך העמודה ${k} אינו ${n}`;
  }
  for (const k of ['sup', 'item', 'po']) {
    if (!Array.isArray(ds.dims[k]) || !ds.dims[k].length) return `חסר מילון ${k}`;
  }
  return null;
}

/* ---------- יועץ הרכש ---------- */
const ADVISOR_RULES = `אתה אנליסט רכש בכיר בחברת גלעם (מזון ופודטק), עונה למנהל הרכש בעברית.

חוקים מחייבים:
1. ענה אך ורק מתוך חבילת העובדות שמצורפת למטה. היא חושבה מנתוני ההזמנות האמיתיים.
2. אל תמציא מספר, שם ספק או מק"ט. אם הנתון אינו בחבילה — אמור במפורש שהוא לא מחושב במערכת, והצע באיזו לשונית אפשר למצוא אותו.
3. ציין בתחילת התשובה על איזו תקופה ואיזה סינון אתה עונה, לפי שדה scope.
4. מספרים בשקלים עם מפרידי אלפים. סכום גדול אפשר לקצר (1.2 מ' ₪).
5. יותר משלוש שורות נתונים — הצג טבלת markdown. אחרת פסקה קצרה.
6. סיים בשורת "פעולה מומלצת" קונקרטית, עם שם ספק או מק"ט אמיתי מהחבילה.
7. אל תמליץ על השוואת מחירים במק"ט שמסומן כלא בר-השוואה או כקוד מרכז עלות.
8. קצר וענייני. בלי פתיחות מנומסות ובלי לחזור על השאלה.`;

async function advise(body) {
  const q = String(body.question || '').trim().slice(0, 2000);
  if (!q) throw Object.assign(new Error('לא נשלחה שאלה'), { code: 400 });
  const facts = body.facts && typeof body.facts === 'object' ? body.facts : null;
  if (!facts) throw Object.assign(new Error('לא נשלחה חבילת עובדות'), { code: 400 });

  const packed = JSON.stringify(facts);
  if (packed.length > 180000) throw Object.assign(new Error('חבילת העובדות גדולה מדי'), { code: 413 });

  const prompt = `${ADVISOR_RULES}

===== חבילת העובדות (מחושבת מנתוני ההזמנות, לא להמציא מעבר לה) =====
${packed}
===== סוף חבילת העובדות =====

שאלת מנהל הרכש: ${q}`;

  const { text, cfg, fallbackFrom } = await callByProvider(prompt, { plain: true, search: false });
  return { answer: text, provider: cfg.prov, model: cfg.model, fallbackFrom };
}

/* הדפדפן שולח את המערך דחוס כדי לא להתקרב לתקרת גוף הבקשה. */
function readBody(req) {
  if (req.headers['x-spend-gzip']) {
    const raw = Buffer.isBuffer(req.body) ? req.body
      : typeof req.body === 'string' ? Buffer.from(req.body, 'binary')
      : Buffer.from(req.body || []);
    return JSON.parse(gunzipSync(raw).toString('utf8'));
  }
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    /* ---------- קריאה ---------- */
    if (req.method === 'GET') {
      if (!hasDb()) return res.status(200).json({ empty: true, reason: 'no database' });
      if (req.query.track) {
        const [opps, targets] = await Promise.all([kvGet(OPPS), kvGet(TARGETS)]);
        return res.status(200).json({ opps: opps || {}, targets: targets || {} });
      }
      const ds = await kvGet(DATA);
      if (!ds) return res.status(200).json({ empty: true });
      if (req.query.meta) return res.status(200).json({ empty: false, meta: metaOf(ds) });
      return sendGz(res, ds);
    }

    /* ---------- יועץ ---------- */
    if (req.method === 'POST' && req.query.ai) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      try {
        return res.status(200).json(await advise(body));
      } catch (e) {
        const code = e.code || (String(e.message).includes('no_ai_key') ? 503 : 502);
        return res.status(code).json({ error: String(e.message || e) });
      }
    }

    if (!hasDb()) return res.status(503).json({ error: 'no database' });
    const body = readBody(req);

    /* ---------- כתיבה ---------- */
    if (req.method === 'PUT' && req.query.track) {
      const key = req.query.track === 'targets' ? TARGETS : OPPS;
      const id = String(body.id || '').slice(0, 120);
      if (!id) return res.status(400).json({ error: 'missing id' });
      const all = (await kvGet(key)) || {};
      all[id] = { ...(all[id] || {}), ...cleanPatch(body.patch || body), updatedAt: new Date().toISOString() };
      await kvSet(key, all);
      return res.status(200).json({ ok: true, id, row: all[id] });
    }

    if (req.method === 'PUT') {
      const bad = validate(body);
      if (bad) return res.status(400).json({ error: bad });
      await kvSet(DATA, body);
      return res.status(200).json({ ok: true, meta: metaOf(body) });
    }

    if (req.method === 'DELETE' && req.query.track) {
      await kvSet(req.query.track === 'targets' ? TARGETS : OPPS, {});
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
