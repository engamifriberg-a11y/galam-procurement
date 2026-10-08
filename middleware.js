// שומר הסף של האתר. רץ לפני כל בקשה — גם דפים, גם קבצי assets וגם ה-API —
// ומעביר הלאה רק מי שמחזיק עוגיית התחברות חתומה.
//
// הכל נבדק כאן ולא בדפדפן, כך שאי אפשר לעקוף בכיבוי JavaScript או בפנייה
// ישירה ל-/api/suppliers. אם שם המשתמש והסיסמה לא מוגדרים בשרת, האתר
// ממשיך לעבוד כמו קודם — כדי ששגיאת הגדרה לא תנעל אותך בחוץ.
import { readCookie, verify, isOpen, authConfigured } from './api/_lib/auth.js';

// המשך לטיפול הרגיל בבקשה. זה מה ש-next() של Vercel עושה מתחת לפני השטח.
const pass = () => new Response(null, { status: 200, headers: { 'x-middleware-next': '1' } });

const deny = () => new Response(JSON.stringify({ error: 'unauthorized', login: '/login' }), {
  status: 401,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

// משימות ה-cron היומיות של Vercel מגיעות עם Bearer של CRON_SECRET.
// אם לא הוגדר סוד — הן ממשיכות לעבוד כמו עד היום, כדי שהנתונים לא יקפאו.
function cronOk(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  if ((request.headers.get('authorization') || '') === `Bearer ${secret}`) return true;
  return /vercel-cron/i.test(request.headers.get('user-agent') || '');
}

export default async function middleware(request) {
  if (!authConfigured()) return pass();

  const url = new URL(request.url);
  const path = url.pathname;

  if (isOpen(path)) return pass();
  if (path.startsWith('/api/cron/') && cronOk(request)) return pass();

  if (await verify(readCookie(request.headers.get('cookie')))) return pass();

  if (path.startsWith('/api/')) return deny();

  const to = new URL('/login', url);
  if (path !== '/') to.searchParams.set('next', path + url.search);
  return new Response(null, {
    status: 302,
    headers: { location: to.toString(), 'cache-control': 'no-store' }
  });
}
