// שמירת הגישה לאתר: שם משתמש, סיסמה ועוגיית התחברות חתומה.
//
// המודול הזה נטען גם ב-middleware שרץ ב-Edge וגם ב-api/login שרץ ב-Node,
// ולכן הוא לא מייבא כלום ונשען רק על Web Crypto שקיים בשני הצדדים.
//
// שם המשתמש והסיסמה לא נמצאים בקוד. הם מוגדרים כמשתני סביבה ב-Vercel
// (AUTH_USER, AUTH_PASS), כי המאגר ציבורי. העוגייה חתומה ב-HMAC-SHA256
// עם AUTH_SECRET, כך שאי אפשר לייצר אותה בלי המפתח שבשרת.

export const COOKIE = 'gp_session';
export const TTL_SEC = 30 * 24 * 3600;      // חודש, ואז צריך להתחבר שוב

const enc = new TextEncoder();

/* ---------- הגדרות השרת ---------- */
export function authConfigured() {
  return Boolean(process.env.AUTH_USER && process.env.AUTH_PASS);
}

// אם לא הוגדר סוד נפרד, הוא נגזר מהסיסמה. תופעת לוואי מבורכת:
// החלפת סיסמה מנתקת מיד את כל מי שמחובר.
function secretText() {
  return process.env.AUTH_SECRET || `pw:${process.env.AUTH_PASS || ''}`;
}

/* ---------- base64url ---------- */
const b64u = bytes => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = s => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - t.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function hmac(data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secretText()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// השוואה בזמן קבוע, כדי שלא יהיה אפשר לנחש תו-תו לפי זמן התגובה
function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---------- אסימון ההתחברות ---------- */
export async function sign(user, ttl = TTL_SEC) {
  const body = b64u(enc.encode(JSON.stringify({ u: String(user), exp: Math.floor(Date.now() / 1000) + ttl })));
  return `${body}.${b64u(await hmac(body))}`;
}

// מחזיר את תוכן האסימון אם החתימה תקפה ולא פג תוקפו, אחרת null
export async function verify(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const dot = token.lastIndexOf('.');
    if (dot < 1) return null;
    const body = token.slice(0, dot);
    if (!sameBytes(unb64u(token.slice(dot + 1)), await hmac(body))) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (!data || typeof data.exp !== 'number' || data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/* ---------- בדיקת שם משתמש וסיסמה ---------- */
export async function credsOk(user, pass) {
  if (!authConfigured()) return false;
  const norm = v => String(v ?? '').trim().toLowerCase();
  // שם המשתמש מושווה בלי תלות באותיות גדולות, הסיסמה בדיוק כפי שהוזנה
  const [u, eu, p, ep] = await Promise.all([
    hmac('u:' + norm(user)), hmac('u:' + norm(process.env.AUTH_USER)),
    hmac('p:' + String(pass ?? '')), hmac('p:' + String(process.env.AUTH_PASS))
  ]);
  return sameBytes(u, eu) && sameBytes(p, ep);
}

/* ---------- עוגיות ---------- */
export function readCookie(header, name = COOKIE) {
  if (!header) return '';
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch { return part.slice(eq + 1).trim(); }
  }
  return '';
}

export const setCookieHeader = (token, ttl = TTL_SEC) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttl}`;

export const clearCookieHeader = () =>
  `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/* ---------- מה פתוח בלי התחברות ---------- */
// רק מה שמסך ההתחברות עצמו צריך
const OPEN = new Set(['/login', '/login.html', '/api/login', '/favicon.ico', '/robots.txt',
  '/assets/img/galam-logo.png']);

export const isOpen = pathname => OPEN.has(pathname);
