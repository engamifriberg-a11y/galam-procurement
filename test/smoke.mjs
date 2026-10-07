// בדיקת עשן לגרף המודולים של הפרונט, בלי דפדפן.
// תופסת תלות מעגלית, שגיאות ייבוא, ולשונית שלא מייצרת תוכן.
// הרצה:  node test/smoke.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const log = [];
const fail = m => { console.error('✗ ' + m); process.exitCode = 1; };
const pass = m => console.log('✓ ' + m);

/* ---------- DOM מינימלי ---------- */
class El {
  constructor(id) { this.id = id; this._html = ''; this.dataset = {}; this.style = {}; this.textContent = ''; this.disabled = false; }
  set innerHTML(v) { this._html = String(v); log.push([this.id, this._html]); }
  get innerHTML() { return this._html; }
  // מחזיר אלמנט רשום אם ה-HTML שנכתב אכן מכיל אותו, כדי לדמות חיפוש בתוך תת-עץ
  querySelector(s) {
    if (s?.startsWith('#') && els.has(s) && this._html.includes(`id="${s.slice(1)}"`)) return els.get(s);
    // סלקטור לפי מאפיין: מחזירים אלמנט זמני אם הוא אכן קיים ב-HTML שנכתב
    const attr = s?.match(/^\[([\w-]+)\]$/);
    if (attr && this._html.includes(attr[1])) return new El(s);
    return null;
  }
  querySelectorAll() { return []; }
  setAttribute() {} getAttribute() { return null; }
  addEventListener() {} closest() { return null; }
  get classList() { return { add() {}, remove() {}, contains: () => false }; }
}
const els = new Map([['#view', new El('#view')], ['#tabs', new El('#tabs')], ['#stamp', new El('#stamp')],
  ['#theme', new El('#theme')], ['#refresh', new El('#refresh')], ['#subview', new El('#subview')]]);

// מאתר גם אלמנטים שנוצרו בתוך HTML שנכתב, כמו דפדפן אמיתי
function findEl(sel) {
  if (els.has(sel)) return els.get(sel);
  if (sel?.startsWith('#') && log.some(([, h]) => h.includes(`id="${sel.slice(1)}"`))) {
    const el = new El(sel); els.set(sel, el); return el;
  }
  return null;
}
globalThis.document = {
  querySelector: findEl,
  querySelectorAll: () => [],
  addEventListener() {},
  documentElement: new El('html'),
  createElement: () => new El('tmp')
};
globalThis.window = { addEventListener() {}, scrollTo() {} };
globalThis.location = { hash: '', href: 'http://localhost/' };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#EDF1F2' });

/* ---------- fetch: קבצים מקומיים + תשובת API מדומה ---------- */
const API_MARKET = {
  db: true, at: new Date().toISOString(),
  series: JSON.parse(await readFile(join(ROOT, 'assets/data/series.json'), 'utf8')).series.map((s, i) => ({
    ...s,
    last: i % 3 === 0 ? 100 + i : null,
    lastDate: i % 3 === 0 ? '2026-10-07' : null,
    source: i % 3 === 0 ? 'בדיקה' : null,
    points: i % 3 === 0 ? 30 : 0,
    chg: { d1: 0.2, d7: -1.1, d30: 2.4, d90: -4.8, d365: 7.3 },
    vol90: 18.2,
    hist: Array.from({ length: 30 }, (_, k) => ['2026-09-' + String(k + 1).padStart(2, '0'), 100 + k])
  }))
};
globalThis.fetch = async (url) => {
  const u = String(url);
  const body = u.startsWith('/api/market') ? API_MARKET
    : u.startsWith('/api/prices') ? {}
    : u.includes('task=brief') ? { group: 'x', he: 'x', text: 'קריאת בדיקה.', basedOn: 3, missing: 1, at: new Date().toISOString(), provider: 'nvidia' }
    : u.includes('task=pitch') ? { key: '1', item: 'x', rec: 'ask', text: 'טיעון בדיקה.', at: new Date().toISOString() }
    : u.startsWith('/api/suppliers') ? JSON.parse(await readFile(join(ROOT, 'assets/data/suppliers.json'), 'utf8'))
    : u.startsWith('/assets/data/lanes.json') ? JSON.parse(await readFile(join(ROOT, 'assets/data/lanes.json'), 'utf8'))
    : u.startsWith('/api/settings') ? { protected: false, saved: {}, search: { engine: 'Google News RSS', source: 'ברירת מחדל' }, active: { provider: 'nvidia', model: 'openai/gpt-oss-20b', search: false, source: 'סביבה' }, env: { tavily: false, nvidia: true, gemini: false, anthropic: false } }
    : u.includes('task=quote') ? { group: 'freight', asked: 8, quotes: [] }
    : u.startsWith('/api/analysis') ? { window: 'd90', series: API_MARKET.series, rows: [], modes: {} }
    : u.startsWith('/api/ai') ? (AI_OK ? AI_PAYLOAD : { error: 'no_ai_key', message: 'test' })
    : JSON.parse(await readFile(join(ROOT, u.replace(/^\//, '')), 'utf8'));
  const aiFail = u.startsWith('/api/ai') && !AI_OK && !u.includes('task=brief') && !u.includes('task=pitch');
  return { ok: !aiFail, status: aiFail ? 503 : 200, json: async () => body };
};

let AI_OK = false;
const AI_PAYLOAD = {
  task: 'risk', provider: 'nvidia', model: 'openai/gpt-oss-20b', cached: true, ageHours: 2, stale: false,
  grounding: { source: 'Google News RSS', items: 18, queries: 12, failed: [] },
  at: new Date().toISOString(),
  data: { asOf: '2026-10-07', overall: 'watch', summary: 'סיכום בדיקה.',
    alerts: [{ chemical: 'Sulfuric Acid 98%', severity: 'high', horizon: '0-3m', israelImpact: 'יש',
      headline: 'China suspends sulphuric acid exports', detail: 'יצוא סיני הושעה', action: 'לבדוק ספקים מקומיים',
      refs: [5], sources: ['https://example.com/a'], refTitles: ['Reuters: China suspends sulphuric acid exports'] }] }
};

/* ---------- ההרצה ---------- */
const timeout = setTimeout(() => {
  fail('המודולים לא סיימו להיטען תוך 8 שניות — כמעט תמיד תלות מעגלית עם await ברמת המודול');
  process.exit(1);
}, 8000);

await import('../assets/js/core/app.js');
clearTimeout(timeout);
await new Promise(r => setTimeout(r, 400));

const tabsHtml = els.get('#tabs').innerHTML;
tabsHtml.includes('data-id="volatility"') ? pass('הלשונית נרשמה ונבנתה בסרגל') : fail('סרגל הלשוניות ריק — registerTab לא רץ');

const viewHtml = log.filter(([id]) => id === '#view').map(([, h]) => h).join('\n');
viewHtml.includes('data-sub="chem"') ? pass('תתי-הלשוניות נוצרו') : fail('תת-לשוניות חסרות');
viewHtml.includes('טוען נתונים') ? pass('מצב טעינה הוצג') : fail('מצב טעינה חסר');

const sub = els.get('#subview').innerHTML;
const rendered = sub || viewHtml;
rendered.includes('<table') || rendered.includes('class="cards"')
  ? pass('תוכן הלשונית רונדר') : fail('הלשונית לא ייצרה תוכן');
/שגיאה|לא נטענה/.test(rendered) ? fail('הלשונית החזירה הודעת שגיאה: ' + rendered.slice(0, 200)) : pass('אין שגיאת רינדור');

// כל תת-לשונית בנפרד — הכימיקלים הם בעלי ההיגיון הרב ביותר ולכן הסיכון הגבוה ביותר
const { tabs, clearCache } = await import('../assets/js/core/base.js');
const vol = tabs().find(t => t.id === 'volatility');
for (const sub of ['paper', 'energy', 'fx', 'freight', 'chem', 'risk']) {
  els.get('#subview')._html = '';
  try {
    await vol.render(els.get('#view'), { sub, go: () => {} });
    await new Promise(r => setTimeout(r, 250));
    const html = els.get('#subview').innerHTML;
    if (!html) { fail(`תת-לשונית ${sub}: לא נוצר תוכן`); continue; }
    if (/שגיאה בהצגת/.test(html)) { fail(`תת-לשונית ${sub}: שגיאת רינדור`); continue; }
    pass(`תת-לשונית ${sub} (${html.length.toLocaleString()} תווים)`);
  } catch (e) {
    fail(`תת-לשונית ${sub}: ${e.message}`);
  }
}

// מסלול ההצלחה של לשונית המשברים, עם נתונים אמיתיים בצורתם
AI_OK = true;
clearCache();   // התשובה הקודמת שמורה במטמון הליבה
els.get('#subview')._html = '';
await vol.render(els.get('#view'), { sub: 'risk', go: () => {} });
await new Promise(r => setTimeout(r, 250));
const riskHtml = els.get('#subview').innerHTML;
riskHtml.includes('Sulfuric Acid 98%') ? pass('לשונית משברים: התרעה הוצגה') : fail('לשונית משברים: ההתרעה לא הוצגה');
riskHtml.includes('Reuters: China suspends') ? pass('לשונית משברים: כותרת המקור מקושרת') : fail('לשונית משברים: חסר קישור למקור');
riskHtml.includes('18 כותרות') || riskHtml.includes('נסרקו 18') ? pass('לשונית משברים: מוצג היקף העיגון') : fail('לשונית משברים: לא מוצג היקף העיגון');

// פאנל ה-AI קיים בלשוניות השוק, וכפתור הנימוק בלשונית הכימיקלים
for (const sub of ['paper', 'energy', 'fx', 'freight']) {
  els.get('#subview')._html = '';
  clearCache();
  await vol.render(els.get('#view'), { sub, go: () => {} });
  await new Promise(r => setTimeout(r, 200));
  els.get('#subview').innerHTML.includes('data-ai-run')
    ? pass(`פאנל AI בלשונית ${sub}`) : fail(`פאנל AI חסר בלשונית ${sub}`);
}
els.get('#subview')._html = '';
clearCache();
await vol.render(els.get('#view'), { sub: 'chem', go: () => {} });
await new Promise(r => setTimeout(r, 200));
els.get('#subview').innerHTML.includes('data-pitch=')
  ? pass('כפתור נימוק בשורות הכימיקלים') : fail('כפתור נימוק חסר');

// כפתור שליפת הערכים מופיע בלשונית עם אינדקסים מנוהלים
els.get('#subview')._html = '';
clearCache();
await vol.render(els.get('#view'), { sub: 'freight', go: () => {} });
await new Promise(r => setTimeout(r, 200));
const fh = els.get('#subview').innerHTML;
fh.includes('data-quote') ? pass('כפתור שליפת ערכים מהרשת') : fail('כפתור שליפת ערכים חסר');
fh.includes('מחירי מכולה לנמל חיפה') ? pass('טבלת הנתיבים לחיפה') : fail('טבלת הנתיבים חסרה');
fh.includes('data-lane-save') ? pass('הזנת הצעת מחיר לנתיב') : fail('שדה הצעת מחיר חסר');
fh.includes('statusbar') ? pass('שורת סטטוס שוק ההובלה') : fail('שורת הסטטוס חסרה');

// לשונית ההגדרות
const settings = tabs().find(t => t.id === 'settings');
if (!settings) { fail('לשונית ההגדרות לא נרשמה'); }
else {
  clearCache();
  const sv = new El('#settings-view');
  await settings.render(sv, {});
  await new Promise(r => setTimeout(r, 200));
  const h = log.filter(([id]) => id === '#settings-view').map(([, x]) => x).join('\n');
  h.includes('id="gk"') ? pass('לשונית הגדרות: שדה מפתח Gemini') : fail('לשונית הגדרות: שדה חסר');
  h.includes('ADMIN_CODE') ? pass('לשונית הגדרות: אזהרת אבטחה מוצגת') : fail('לשונית הגדרות: אזהרה חסרה');
  h.includes('id="tk"') ? pass('לשונית הגדרות: שדה מפתח Tavily') : fail('לשונית הגדרות: שדה Tavily חסר');
}

// לשונית הספקים
const sup = tabs().find(t => t.id === 'suppliers');
if (!sup) fail('לשונית הספקים לא נרשמה');
else {
  for (const s2 of ['risk', 'contacts', 'segment', 'terms', 'data']) {
    els.get('#subview')._html = '';
    clearCache();
    try {
      await sup.render(els.get('#view'), { sub: s2, go: () => {} });
      await new Promise(r => setTimeout(r, 250));
      const h = els.get('#subview').innerHTML;
      if (!h) { fail(`ספקים · ${s2}: אין תוכן`); continue; }
      pass(`ספקים · ${s2} (${h.length.toLocaleString()} תווים)`);
    } catch (e) { fail(`ספקים · ${s2}: ${e.message}`); }
  }
  els.get('#subview')._html = '';
  clearCache();
  await sup.render(els.get('#view'), { sub: 'risk', go: () => {} });
  await new Promise(r => setTimeout(r, 250));
  const rh = els.get('#subview').innerHTML;
  rh.includes('data-risk="high"') && rh.includes('class="bfill"') ? pass('גרף הסיכון לחיץ וצבעוני') : fail('גרף הסיכון אינו לחיץ או חסר מילוי');
  rh.includes('מתחת ל-15') ? pass('רף הסיכון 15 מוצג') : fail('רף הסיכון חסר');
  /background:var\(--up\)/.test(rh) ? pass('מילוי צבעוני בעמודות') : fail('אין צבע בעמודות');
  !/<button class="brow/.test(rh) ? pass('שורות הגרף אינן button') : fail('שורת גרף עטופה ב-button, המילוי ייעלם');
}

// כרטיס הספק וסינון לפי תחום סיווג
{
  els.get('#subview')._html = '';
  clearCache();
  await sup.render(els.get('#view'), { sub: 'contacts', go: () => {} });
  await new Promise(r => setTimeout(r, 250));
  const h = els.get('#subview').innerHTML;
  h.includes('data-open=') ? pass('שורת ספק לחיצה') : fail('שורת הספק אינה לחיצה');
  h.includes('id="drawer"') ? pass('מגירת כרטיס הספק קיימת') : fail('מגירת כרטיס הספק חסרה');
  h.includes('data-k="cls"') ? pass('סינון לפי תחום סיווג') : fail('סינון תחום סיווג חסר');

  els.get('#subview')._html = '';
  clearCache();
  await sup.render(els.get('#view'), { sub: 'segment', go: () => {} });
  await new Promise(r => setTimeout(r, 250));
  const g = els.get('#subview').innerHTML;
  g.includes('data-jump="cls"') ? pass('תחומי סיווג לחיצים') : fail('תחומי הסיווג אינם לחיצים');
}

// מחלקות שמופיעות ב-HTML אך חסרות ב-CSS — זה מה שגרם לשדות להיערם
{
  const css = await readFile(join(ROOT, 'assets/css/app.css'), 'utf8');
  const html = log.map(([, h]) => h).join(' ');
  const used = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g))
    m[1].split(/\s+/).forEach(c => { if (c && !/^[a-z]+-[0-9]/.test(c)) used.add(c); });
  const missing = [...used].filter(c => !css.includes('.' + c));
  missing.length
    ? fail(`מחלקות ללא עיצוב: ${missing.join(', ')}`)
    : pass(`כל ${used.size} המחלקות בשימוש מעוצבות`);
}

console.log(process.exitCode ? '\nנכשל' : '\nעבר');
process.exit(process.exitCode || 0);   // טיימרי העדכון האוטומטי מחזיקים את התהליך
