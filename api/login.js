// POST /api/login            { user, pass }  → עוגיית התחברות
// POST /api/login            { logout: true } → ניתוק
// GET  /api/login?logout=1                    → ניתוק וחזרה למסך ההתחברות
// GET  /api/login                             → האם מוגדרת הגנה, ומי מחובר
//
// ניסיונות כושלים נספרים לפי כתובת IP ונחסמים לרבע שעה, כדי שלא יהיה
// אפשר לנחש סיסמה בלופ. אם אין מסד נתונים, החסימה פשוט לא פעילה.
import { credsOk, sign, verify, readCookie, setCookieHeader, clearCookieHeader, authConfigured } from './_lib/auth.js';

const KEY = 'auth:attempts';
const MAX = 8;                     // ניסיונות
const WINDOW = 15 * 60 * 1000;     // בחלון של רבע שעה

const ipOf = req => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown')
  .split(',')[0].trim() || 'unknown';

// המסד נטען רק כשצריך. ההתחברות חייבת לעבוד גם אם שכבת הנתונים לא זמינה,
// שאחרת תקלה במסד נועלת את האתר.
async function store() {
  if (!(process.env.DATABASE_URL || process.env.POSTGRES_URL)) return null;
  try { return await import('./_lib/db.js'); } catch { return null; }
}

async function attempts() {
  const db = await store();
  if (!db) return null;
  try { return (await db.kvGet(KEY)) || {}; } catch { return null; }
}

// מחזיר כמה שניות להמתין, או 0 אם מותר לנסות
async function blockedFor(ip) {
  const all = await attempts();
  const rec = all?.[ip];
  if (!rec || rec.n < MAX) return 0;
  const left = rec.at + WINDOW - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

async function record(ip, ok) {
  const db = await store();
  const all = db ? await attempts() : null;
  if (!all) return;
  // ניקוי רשומות שפג זמנן, כדי שהמפתח לא יתפח
  for (const [k, v] of Object.entries(all)) if (!v?.at || v.at + WINDOW < Date.now()) delete all[k];
  if (ok) delete all[ip];
  else {
    const rec = all[ip] && all[ip].at + WINDOW > Date.now() ? all[ip] : { n: 0, at: Date.now() };
    all[ip] = { n: rec.n + 1, at: Date.now() };
  }
  try { await db.kvSet(KEY, all); } catch { /* חסימה היא שכבה נוספת, לא תנאי לכניסה */ }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    if (req.query?.logout) {
      res.setHeader('Set-Cookie', clearCookieHeader());
      res.writeHead(302, { Location: '/login' });
      return res.end();
    }
    const who = await verify(readCookie(req.headers.cookie));
    return res.status(200).json({ protected: authConfigured(), user: who?.u || null });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});

  if (body.logout) {
    res.setHeader('Set-Cookie', clearCookieHeader());
    return res.status(200).json({ ok: true, loggedOut: true });
  }

  if (!authConfigured()) {
    return res.status(503).json({ error: 'not configured', message: 'לא הוגדרו שם משתמש וסיסמה בשרת.' });
  }

  const ip = ipOf(req);
  const wait = await blockedFor(ip);
  if (wait) {
    return res.status(429).json({ error: 'too many attempts', retryAfter: wait,
      message: `יותר מדי ניסיונות. נסה שוב בעוד ${Math.ceil(wait / 60)} דקות.` });
  }

  const ok = await credsOk(body.user, body.pass);
  await record(ip, ok);
  if (!ok) {
    // השהיה קצרה, כך שניחוש בלופ איטי גם בלי מסד נתונים
    await new Promise(r => setTimeout(r, 450));
    return res.status(401).json({ error: 'bad credentials', message: 'שם משתמש או סיסמה שגויים.' });
  }

  res.setHeader('Set-Cookie', setCookieHeader(await sign(String(body.user).trim())));
  return res.status(200).json({ ok: true, user: String(body.user).trim() });
}

function safeJson(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
