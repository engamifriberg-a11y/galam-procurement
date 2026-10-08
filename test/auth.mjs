// בדיקת שומר הסף של האתר, מקצה לקצה בלי דפדפן:
// חתימת האסימון, בדיקת שם משתמש וסיסמה, החלטות ה-middleware, ומסלול
// ההתחברות המלא — הסיסמה נכנסת ל-api/login, העוגייה שחוזרת ממנו נבדקת
// ב-middleware, וההחלטה אמורה להיות "להעביר הלאה".
//
// הרצה:  node test/auth.mjs
const fail = m => { console.error('✗ ' + m); process.exitCode = 1; };
const pass = m => console.log('✓ ' + m);
const is = (got, want, m) => String(got) === String(want) ? pass(m) : fail(`${m} — קיבלנו ${got} במקום ${want}`);

process.env.AUTH_USER = 'tester';
process.env.AUTH_PASS = 'test-password-!42';
process.env.AUTH_SECRET = 'unit-test-secret';
delete process.env.CRON_SECRET;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const auth = await import('../api/_lib/auth.js');
const middleware = (await import('../middleware.js')).default;

/* ---------- אסימון ההתחברות ---------- */
const token = await auth.sign('tester');
(await auth.verify(token))?.u === 'tester' ? pass('אסימון תקף מזוהה') : fail('אסימון תקף נדחה');
!(await auth.verify(token.slice(0, -2) + 'xy')) ? pass('חתימה מזויפת נדחית') : fail('חתימה מזויפת עברה');
!(await auth.verify('')) && !(await auth.verify('abc')) && !(await auth.verify(null))
  ? pass('אסימון ריק או פגום נדחה') : fail('אסימון פגום עבר');
!(await auth.verify(await auth.sign('tester', -10))) ? pass('אסימון שפג תוקפו נדחה') : fail('אסימון שפג תוקפו עבר');

// אסימון שנחתם במפתח אחר — למשל מישהו שמנחש את המבנה
process.env.AUTH_SECRET = 'other-secret';
const foreign = await auth.sign('tester');
process.env.AUTH_SECRET = 'unit-test-secret';
!(await auth.verify(foreign)) ? pass('אסימון שנחתם במפתח אחר נדחה') : fail('אסימון זר עבר');

/* ---------- שם משתמש וסיסמה ---------- */
(await auth.credsOk('tester', 'test-password-!42')) ? pass('הצירוף הנכון מאושר') : fail('הצירוף הנכון נדחה');
(await auth.credsOk('TesTer ', 'test-password-!42')) ? pass('שם משתמש ללא תלות באותיות ורווחים') : fail('שם משתמש תקין נדחה');
!(await auth.credsOk('tester', 'test-password-!41')) ? pass('סיסמה שגויה נדחית') : fail('סיסמה שגויה אושרה');
!(await auth.credsOk('tester', 'TEST-PASSWORD-!42')) ? pass('הסיסמה תלוית אותיות') : fail('הסיסמה לא תלוית אותיות');
!(await auth.credsOk('someone', 'test-password-!42')) ? pass('שם משתמש אחר נדחה') : fail('שם משתמש אחר אושר');
!(await auth.credsOk('', '')) ? pass('טופס ריק נדחה') : fail('טופס ריק אושר');

/* ---------- קריאת עוגייה ---------- */
is(auth.readCookie(`theme=dark; ${auth.COOKIE}=${token}; live=on`), token, 'העוגייה נקראת מתוך שורה עם עוד עוגיות');
is(auth.readCookie('gp_session_other=x'), '', 'שם דומה אינו נחשב להתאמה');
is(auth.readCookie(null), '', 'שורת עוגיות ריקה');
auth.setCookieHeader(token).includes('HttpOnly') && auth.setCookieHeader(token).includes('Secure')
  && auth.setCookieHeader(token).includes('SameSite=Lax')
  ? pass('העוגייה מוגנת: HttpOnly, Secure, SameSite') : fail('חסרות הגנות בעוגייה');

/* ---------- החלטות ה-middleware ---------- */
const req = (path, { cookie, headers = {} } = {}) => new Request('https://galam-procurement.vercel.app' + path, {
  headers: { ...(cookie ? { cookie } : {}), ...headers }
});
const passed = res => res.status === 200 && res.headers.get('x-middleware-next') === '1';

const cases = [
  ['/', {}, 'block'], ['/index.html', {}, 'block'],
  ['/assets/js/core/app.js', {}, 'block'],
  ['/assets/data/suppliers.json', {}, 'block'],
  ['/login', {}, 'open'], ['/login.html', {}, 'open'], ['/api/login', {}, 'open'],
  ['/assets/img/galam-logo.png', {}, 'open'],
  ['/api/market', {}, '401'], ['/api/suppliers', {}, '401'], ['/api/settings', {}, '401'],
  ['/', { cookie: `${auth.COOKIE}=${token}` }, 'open'],
  ['/api/market', { cookie: `${auth.COOKIE}=${token}` }, 'open'],
  ['/api/market', { cookie: `${auth.COOKIE}=${token}x` }, '401'],
  ['/api/market', { cookie: `${auth.COOKIE}=${foreign}` }, '401']
];
let bad = 0;
for (const [path, opt, want] of cases) {
  const res = await middleware(req(path, opt));
  const got = passed(res) ? 'open' : res.status === 401 ? '401' : res.status === 302 ? 'block' : `status ${res.status}`;
  if (got !== want) { fail(`${path} → ${got}, ציפינו ל-${want}`); bad++; }
}
if (!bad) pass(`כל ${cases.length} מסלולי הבדיקה מתנהגים כמצופה`);

// ההפניה שומרת את היעד המקורי, ורק נתיב פנימי
const red = await middleware(req('/?x=1#t'));
red.headers.get('location')?.endsWith('/login') ? pass('דף הבית מופנה למסך הכניסה') : fail('הפניה שגויה מדף הבית');
const red2 = await middleware(req('/some/page?a=1'));
is(new URL(red2.headers.get('location')).searchParams.get('next'), '/some/page?a=1', 'היעד המקורי נשמר להמשך');

/* ---------- cron ---------- */
passed(await middleware(req('/api/cron/snapshot'))) ? pass('cron ממשיך לעבוד כשאין CRON_SECRET') : fail('cron נחסם בלי סוד');
process.env.CRON_SECRET = 'cron-secret';
passed(await middleware(req('/api/cron/snapshot', { headers: { authorization: 'Bearer cron-secret' } })))
  ? pass('cron עם Bearer נכון עובר') : fail('cron עם Bearer נכון נחסם');
passed(await middleware(req('/api/cron/snapshot', { headers: { 'user-agent': 'vercel-cron/1.0' } })))
  ? pass('cron מזוהה גם לפי user-agent') : fail('cron לא זוהה לפי user-agent');
(await middleware(req('/api/cron/scan', { headers: { authorization: 'Bearer wrong' } }))).status === 401
  ? pass('cron עם סוד שגוי נחסם') : fail('cron עם סוד שגוי עבר');
delete process.env.CRON_SECRET;

/* ---------- כשההגנה לא מוגדרת, האתר פתוח כמו קודם ---------- */
const savedUser = process.env.AUTH_USER;
delete process.env.AUTH_USER;
passed(await middleware(req('/'))) ? pass('בלי הגדרת שם משתמש האתר ממשיך לעבוד') : fail('האתר ננעל בלי הגדרה');
process.env.AUTH_USER = savedUser;

/* ---------- מסלול מלא: api/login ואז middleware ---------- */
const login = (await import('../api/login.js')).default;
function fakeRes() {
  const r = { code: 0, headers: {}, body: null, ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; r.ended = true; return r; };
  r.writeHead = (c, h) => { r.code = c; Object.assign(r.headers, h); return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}
const okRes = fakeRes();
await login({ method: 'POST', headers: {}, query: {}, body: { user: 'tester', pass: 'test-password-!42' } }, okRes);
is(okRes.code, 200, 'התחברות עם הפרטים הנכונים מחזירה 200');
const cookieLine = okRes.headers['set-cookie'] || '';
const fresh = cookieLine.split(';')[0];
fresh.startsWith(auth.COOKIE + '=') ? pass('התקבלה עוגיית התחברות') : fail('לא התקבלה עוגייה');
passed(await middleware(req('/', { cookie: fresh }))) ? pass('העוגייה מה-API פותחת את האתר') : fail('העוגייה מה-API לא עובדת');
passed(await middleware(req('/api/suppliers', { cookie: fresh }))) ? pass('העוגייה פותחת גם את ה-API') : fail('ה-API נחסם למחובר');

const badRes = fakeRes();
await login({ method: 'POST', headers: {}, query: {}, body: { user: 'tester', pass: 'nope' } }, badRes);
is(badRes.code, 401, 'סיסמה שגויה מחזירה 401');
badRes.headers['set-cookie'] ? fail('נשלחה עוגייה למרות סיסמה שגויה') : pass('אין עוגייה בסיסמה שגויה');

const outRes = fakeRes();
await login({ method: 'POST', headers: {}, query: {}, body: { logout: true } }, outRes);
/Max-Age=0/.test(outRes.headers['set-cookie'] || '') ? pass('יציאה מוחקת את העוגייה') : fail('היציאה לא מוחקת עוגייה');
!(await auth.verify(auth.readCookie((outRes.headers['set-cookie'] || '').split(';')[0])))
  ? pass('העוגייה שאחרי היציאה אינה תקפה') : fail('העוגייה שאחרי היציאה עדיין תקפה');

const whoRes = fakeRes();
await login({ method: 'GET', headers: { cookie: fresh }, query: {} }, whoRes);
is(whoRes.body?.user, 'tester', 'שאילתת מי מחובר מחזירה את שם המשתמש');

console.log(process.exitCode ? '\nנכשל' : '\nעבר');
