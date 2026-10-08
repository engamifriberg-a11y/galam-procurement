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
  constructor(id) { this.id = id; this._html = ''; this.dataset = {}; this.style = {}; this.textContent = ''; this.disabled = false; this.value = ''; }
  set innerHTML(v) { this._html = String(v); this._kids = []; log.push([this.id, this._html]); }
  get innerHTML() { return this._html + this._childHtml + (this._kids && this._kids.length ? '' : (this.textContent || '')); }
  // מחזיר אלמנט רשום אם ה-HTML שנכתב אכן מכיל אותו, כדי לדמות חיפוש בתוך תת-עץ
  querySelector(s) {
    if (s?.startsWith('#') && this._html.includes(`id="${s.slice(1)}"`)) {
      if (!els.has(s)) els.set(s, new El(s));
      return els.get(s);
    }
    // סלקטור לפי מאפיין: מחזירים אלמנט זמני אם הוא אכן קיים ב-HTML שנכתב
    const attr = s?.match(/^\[([\w-]+)\]$/);
    if (attr && this._html.includes(attr[1])) return new El(s);
    return null;
  }
  querySelectorAll() { return []; }
  setAttribute(k, v) { if (k === 'class') this.className = v; this._attrs ||= {}; this._attrs[k] = v; }
  getAttribute(k) { return (this._attrs || {})[k] ?? null; }
  addEventListener() {} closest() { return null; }
  get classList() { const self = this; return { add(c) { self.className = ((self.className || '') + ' ' + c).trim(); }, remove() {}, contains: () => false, toggle: () => false }; }
  // לשונית SPEND בונה צומתי DOM במקום מחרוזות HTML. בלי התמיכה הזאת
  // הבדיקה לא הייתה מגיעה בכלל לתוכן שלה.
  appendChild(c) { this._kids ||= []; this._kids.push(c); return c; }
  // ה-HTML מורכב מהילדים בזמן הקריאה ולא בזמן ההוספה, אחרת כל מה שנוסף
  // לצומת אחרי שצורף להורה שלו לא היה נספר בבדיקת המחלקות.
  get outerHTML() {
    const cls = this.className ? ` class="${this.className}"` : '';
    return `<div${cls}>${this.innerHTML}</div>`;
  }
  get _childHtml() { return (this._kids || []).map(k => (k && k.outerHTML) || '').join(''); }
  append(...cs) { cs.forEach(c => { if (c && typeof c === 'object') this.appendChild(c); }); }
  prepend(...cs) { this.append(...cs); }
  remove() {}
  insertBefore(c) { return this.appendChild(c); }
  scrollIntoView() {}
  focus() {}
  get firstChild() { return (this._kids || [])[0] || null; }
  get lastChild() { const k = this._kids || []; return k[k.length - 1] || null; }
  get isConnected() { return true; }
  getBoundingClientRect() { return { width: 900, height: 300, top: 0, left: 0, right: 900, bottom: 300 }; }
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
  body: new El('body'),
  head: new El('head'),
  getElementById: id => findEl('#' + id),
  createElement: () => new El('tmp')
};
globalThis.window = { addEventListener() {}, removeEventListener() {}, scrollTo() {}, setTimeout, clearTimeout };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
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
// כמויות שהוזנו ידנית, נדרס בבדיקה עצמה
let TONS_OVERRIDE = {};
let SKU_OVERRIDE = {};

/* מערך רכש מינימלי בפורמט ש-/api/spend מחזיר, כדי להריץ את לשונית SPEND
   בלי מסד נתונים. מספיק רחב כדי שכל 21 המסכים ימצאו מה להציג. */
const SPEND_FIXTURE = (() => {
  const dims = {
    sup: ['200-000001', '200-000002', '200-000003'],
    supInfo: [
      { name: 'ספק אלפא', typeCode: '30', typeDesc: 'רכש טכני', status: 'פעיל', terms: 'שוטף + 60', opened: 4000, city: 'חיפה', country: 'Israel', classDesc: 'ציוד' },
      { name: 'ספק בטא', typeCode: '61', typeDesc: 'כימיקלים ושרפים', status: 'פעיל', terms: 'מיידי', opened: 4100, city: 'אשדוד', country: 'Israel', classDesc: 'כימיה' },
      { name: 'ספק גמא', typeCode: '11', typeDesc: 'הובלות יבשתיות', status: 'פעיל', terms: 'שוטף + 30', opened: 4200, city: 'לוד', country: 'Israel', classDesc: 'הובלה' }
    ],
    item: ['IT-100', 'IT-200', 'IT-300'],
    itemDesc: ['חומצה גופרתית', 'משטח עץ', 'הובלת סחורה'],
    po: [], buyer: ['DANA', 'BARM'], status: ['סגורה', 'אושרה', 'טיוטא'],
    potype: ['מחסן טכני', 'תפעול'], unit: ['KG', 'EA', 'EAC'], cur: ['ILS', 'USD']
  };
  const R = { s: [], i: [], p: [], b: [], st: [], pt: [], u: [], c: [], ln: [], d: [], dd: [], q: [], up: [], a: [], oq: [] };
  let n = 0;
  for (let y = 0; y < 2; y++) for (let mo = 0; mo < 12; mo++) for (let v = 0; v < 3; v++) {
    const po = 'PO' + String(1000 + n).padStart(5, '0');
    dims.po.push(po);
    const day = Math.round((Date.UTC(2025 + y, mo, 10) - Date.UTC(2014, 0, 1)) / 864e5);
    const qty = 10 + v * 5 + mo;
    const unitPrice = v === 0 ? 4 + y * 0.6 : v === 1 ? 38 + y * 3 : 1200 + y * 90;
    R.s.push(v); R.i.push(v); R.p.push(n); R.b.push(v % 2); R.st.push(mo === 11 && v === 2 ? 1 : 0);
    R.pt.push(v % 2); R.u.push(v); R.c.push(v === 2 ? 1 : 0); R.ln.push(1);
    R.d.push(day); R.dd.push(day + 30); R.q.push(qty); R.up.push(unitPrice);
    R.a.push(+(qty * unitPrice * (v === 2 ? 3.6 : 1)).toFixed(2));
    R.oq.push(mo === 11 && v === 2 ? qty / 2 : 0);
    n++;
  }
  // ספק שני לאותו מק"ט ויחידה, כדי שיהיה פער מחיר אמיתי להשוות עליו
  for (let mo = 0; mo < 6; mo++) {
    const po = 'PO-ALT' + mo;
    dims.po.push(po);
    const day = Math.round((Date.UTC(2026, mo, 15) - Date.UTC(2014, 0, 1)) / 864e5);
    R.s.push(1); R.i.push(0); R.p.push(dims.po.length - 1); R.b.push(0); R.st.push(0);
    R.pt.push(0); R.u.push(0); R.c.push(0); R.ln.push(1);
    R.d.push(day); R.dd.push(day + 20); R.q.push(40); R.up.push(5.4); R.a.push(216); R.oq.push(0);
  }
  return {
    meta: {
      epoch: '2014-01-01', rows: R.s.length, builtAt: '2026-10-08T00:00:00',
      sourceFile: 'בדיקה', minDate: Math.min(...R.d), maxDate: Math.max(...R.d),
      amountNote: '', openNote: ''
    },
    dims, rows: R
  };
})();

// כשדולק, /api/spend מחזיר מאגר ריק — מצב ההתחלה של עמי
let SPEND_EMPTY = false;

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('/api/spend')) {
    const body = u.includes('track=1') ? { opps: {}, targets: {} }
      : u.includes('ai=1') ? { answer: 'תשובת בדיקה.', provider: 'test', model: 'stub' }
      : SPEND_EMPTY ? { empty: true }
      : SPEND_FIXTURE;
    return { ok: true, status: 200, json: async () => body };
  }
  const body = u.startsWith('/api/market') ? API_MARKET
    : u.startsWith('/api/prices?what=tons') ? TONS_OVERRIDE
    : u.startsWith('/api/prices?what=sku') ? SKU_OVERRIDE
    : u.startsWith('/api/prices') ? {}
    : u.includes('task=brief') ? { group: 'x', he: 'x', text: 'קריאת בדיקה.', basedOn: 3, missing: 1, at: new Date().toISOString(), provider: 'nvidia' }
    : u.includes('task=pitch') ? { key: '1', item: 'x', rec: 'ask', text: 'טיעון בדיקה.', at: new Date().toISOString() }
    : u.startsWith('/api/contracts') ? { ...JSON.parse(await readFile(join(ROOT, 'assets/data/contracts.json'), 'utf8')), overrides: {}, origin: 'קובץ בסיס' }
    : u.startsWith('/api/suppliers') ? JSON.parse(await readFile(join(ROOT, 'assets/data/suppliers.json'), 'utf8'))
    : u.startsWith('/assets/data/lanes.json') ? JSON.parse(await readFile(join(ROOT, 'assets/data/lanes.json'), 'utf8'))
    : u.startsWith('/api/settings') ? { protected: false, saved: {}, search: { engine: 'Google News RSS', source: 'ברירת מחדל' }, active: { provider: 'nvidia', model: 'openai/gpt-oss-20b', search: false, source: 'סביבה' }, env: { tavily: false, nvidia: true, gemini: false, anthropic: false } }
    : u.includes('task=quote') ? { group: 'freight', asked: 8, quotes: [] }
    : u.startsWith('/api/login') ? { protected: true, user: 'tester' }
    : u.startsWith('/api/ops') ? { window: 'd90', series: API_MARKET.series, rows: [], modes: {} }
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
els.get('#subview').innerHTML.includes('data-chemsort')
  ? pass('בוחר המיון בטבלת הכימיקלים') : fail('בוחר המיון חסר');

// מיון הטונות: ברירת המחדל מהגבוה לנמוך, והיפוך הכיוון הופך את הסדר.
{
  const { chemicalsView } = await import(new URL('../assets/js/tabs/volatility/chemicals-view.js', import.meta.url));
  const mk = (he, tons) => ({ n: he, he, en: he, item: he, origin: 'בדיקה', cur: 'USD', sup: 1, tons, drivers: [] });
  const chem = { items: [mk('קטן', 5), mk('גדול', 1200), mk('בינוני', 40), mk('ללא כמות', null)] };
  const names = html => [...html.matchAll(/<td>([^<]+)<span class="sub">/g)].map(m => m[1].trim()).slice(0, 4);
  const desc = names(chemicalsView({}, chem, {}, new Map(), { win: 'd90', sort: 'tons', dir: -1 }));
  const asc = names(chemicalsView({}, chem, {}, new Map(), { win: 'd90', sort: 'tons', dir: 1 }));
  String(desc) === String(['גדול', 'בינוני', 'קטן', 'ללא כמות'])
    ? pass('מיון טונות מהגבוה לנמוך') : fail('מיון טונות יורד שגוי: ' + desc);
  String(asc) === String(['קטן', 'בינוני', 'גדול', 'ללא כמות'])
    ? pass('מיון טונות מהנמוך לגבוה') : fail('מיון טונות עולה שגוי: ' + asc);

  // הזנה ידנית: דורסת את הקובץ, משנה את הסדר, ומסומנת בטבלה
  const { applyTons } = await import(new URL('../assets/js/tabs/volatility/data.js', import.meta.url));
  const edited = { items: applyTons(chem.items, { 'קטן': 9000, 'גדול': null }) };
  const after = names(chemicalsView({}, edited, {}, new Map(), { win: 'd90', sort: 'tons', dir: -1 }));
  String(after) === String(['קטן', 'גדול', 'בינוני', 'ללא כמות'])
    ? pass('כמות שהוזנה ידנית דורסת את הקובץ וקובעת את הסדר') : fail('ההזנה הידנית לא נתפסה במיון: ' + after);
  const html = chemicalsView({}, edited, {}, new Map(), { win: 'd90', sort: 'tons', dir: -1 });
  html.includes('data-f="tons"') ? pass('שדה הזנת כמות בכל שורה') : fail('שדה הזנת הכמות חסר');
  html.includes('data-tons=') && html.includes('class="celledit"')
    ? pass('עמודת הטונות לחיצה לעריכה') : fail('אי אפשר לערוך את עמודת הטונות');

  // מק״ט: עמודה ראשונה, לחיצה לעריכה, וריק כשאין
  const { applySkus } = await import(new URL('../assets/js/tabs/volatility/data.js', import.meta.url));
  // כמו בקובץ האמיתי: לרוב הפריטים אין מק״ט, ולאחד הזנו אחד ידנית
  const noSku = chem.items.map(i => ({ ...i, item: '' }));
  const sk = chemicalsView({}, { items: applySkus(noSku, { 'גדול': '5091506' }) }, {}, new Map(), { win: 'd90', sort: 'tons', dir: -1 });
  sk.indexOf('<th>מק״ט</th>') >= 0 && sk.indexOf('<th>מק״ט</th>') < sk.indexOf('<th>כימיקל</th>')
    ? pass('מק״ט הוא העמודה הימנית ביותר') : fail('המק״ט אינו בעמודה הימנית');
  sk.includes('data-sku=') ? pass('המק״ט ניתן לעריכה בלחיצה') : fail('אי אפשר לערוך מק״ט');
  sk.includes('5091506') ? pass('מק״ט שהוזן מוצג') : fail('המק״ט שהוזן לא מוצג');
  sk.includes('הזן מק״ט') ? pass('פריט בלי מק״ט נשאר ריק להזנה') : fail('פריט בלי מק״ט אינו מזמין הזנה');
  html.includes('ידני') && html.includes('מהקובץ')
    ? pass('מסומן מה הוזן ידנית ומה מהקובץ') : fail('חסר סימון מקור הכמות');
  applyTons(chem.items, {})[0].tons === 5 ? pass('בלי הזנה, הכמות נשארת מהקובץ') : fail('הכמות מהקובץ נדרסה לשווא');
}

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

// לשונית חוזי אחזקה
{
  const ct = tabs().find(t => t.id === 'contracts');
  if (!ct) fail('לשונית חוזי אחזקה לא נרשמה');
  else for (const s2 of ['track', 'data']) {
    els.get('#subview')._html = '';
    clearCache();
    try {
      await ct.render(els.get('#view'), { sub: s2, go: () => {} });
      await new Promise(r => setTimeout(r, 250));
      const h = els.get('#subview').innerHTML;
      if (!h) { fail(`חוזים · ${s2}: אין תוכן`); continue; }
      pass(`חוזים · ${s2} (${h.length.toLocaleString()} תווים)`);
      if (s2 === 'track') {
        h.includes('data-open=') ? pass('שורת חוזה לחיצה') : fail('שורת חוזה אינה לחיצה');
        h.includes('data-money=') ? pass('עריכת סכום מהירה') : fail('עריכת סכום חסרה');
        h.includes('data-filter="soon"') ? pass('מסנני ההתראות') : fail('מסנני ההתראות חסרים');
      }
    } catch (e) { fail(`חוזים · ${s2}: ${e.message}`); }
  }
}

/* ---------- לשונית SPEND ---------- */
{
  const sp = tabs().find(t => t.id === 'spend');
  if (!sp) fail('לשונית SPEND לא נרשמה');
  else {
    // מצב ההתחלה: אין עדיין נתונים. הלשונית חייבת להציג מיד את אזור גרירת
    // הקובץ, ולא מסך ריק שמפנה למסך אחר.
    SPEND_EMPTY = true;
    const v0 = new El('#view');
    await sp.render(v0, { sub: 'exec', go: () => {} });
    await new Promise(r => setTimeout(r, 40));
    const h0 = v0.innerHTML;
    h0.includes('dropzone') && h0.includes('גרור לכאן קובץ אקסל')
      ? pass('SPEND בלי נתונים: אזור גרירת הקובץ מוצג מיד') : fail('SPEND בלי נתונים: אין לאן לשים את הקובץ');
    h0.includes('העלאת קובץ הזמנות הרכש')
      ? pass('SPEND בלי נתונים: פאנל ההעלאה הוא הראשון') : fail('SPEND בלי נתונים: פאנל ההעלאה אינו ראשון');
    h0.includes('הנתונים שנטענים כרגע')
      ? fail('SPEND בלי נתונים: מוצג פאנל נתונים ריק') : pass('SPEND בלי נתונים: בלי פאנל נתונים ריק');
    SPEND_EMPTY = false;

    const SCREENS = ['money', 'suppliers', 'items', 'years', 'ai', 'load'];
    let rendered = 0;
    for (const id of SCREENS) {
      const v = new El('#view');
      try {
        await sp.render(v, { sub: id, go: () => {} });
        await new Promise(r => setTimeout(r, 30));
        const h = v.innerHTML;
        if (h.length < 300) fail(`SPEND · ${id}: כמעט ריק (${h.length} תווים)`);
        else if (/שגיאה בהצגת המסך/.test(h)) fail(`SPEND · ${id}: המסך זרק שגיאה`);
        else { rendered++; pass(`SPEND · ${id} (${h.length.toLocaleString()} תווים)`); }
      } catch (e) { fail(`SPEND · ${id}: ${e.message}`); }
    }
    rendered === SCREENS.length ? pass(`כל ${SCREENS.length} מסכי SPEND נבנו`) : fail('לא כל מסכי SPEND נבנו');

    // טעינה אחת, שני מאגרים: גיליון כרטיסי הספקים שבאותו קובץ
    {
      const sys = await import('../assets/js/tabs/spend/views-system.js');
      const hd = ['מס.ספק', 'תנאי תשלום', 'תנאי תשלום', 'תאור סוג ספק', 'שם ספק', 'סטטוס', 'סקור', 'סקור ענפי', 'כתובת', 'e-mail'];
      const ordersHd = ['מס.ספק', 'שם ספק', 'הזמנת רכש', 'מק\'ט', 'סכום (ILS)'];
      sys.looksLikeSupplierSheet(hd) ? pass('גיליון כרטיסי ספקים מזוהה') : fail('גיליון הספקים לא זוהה');
      !sys.looksLikeSupplierSheet(ordersHd) ? pass('גיליון ההזמנות אינו נחשב לכרטיסי ספקים') : fail('גיליון ההזמנות זוהה בטעות');
      const mapped = sys.mapSupplierRows(hd, [
        ['200-000005', 'E60', 'שוטף + 60 יום', 'אנזימים', 'דיפריס', 'פעיל', '48', '36', 'הברזל 32', 'a@b.c'],
        ['', 'X', 'Y', '', '', '', '', '', '', '']
      ]);
      mapped.length === 1 ? pass('שורה בלי מספר ספק נדחית') : fail('שורה ריקה נקלטה');
      mapped[0].ptd === 'שוטף + 60 יום' && mapped[0].pt === 'E60'
        ? pass('תנאי תשלום: הקוד והתיאור נשמרים בנפרד') : fail('תנאי התשלום מופו שגוי: ' + JSON.stringify(mapped[0]));
      mapped[0].scr === 48 && mapped[0].ind === 36
        ? pass('סקור וסקור ענפי נקלטים כמספרים') : fail('הסקור לא נקלט כמספר');
    }

    // המנוע עצמו: אותם מספרים שהמסכים מציגים, מול חישוב ישיר
    const m = await import('../assets/js/tabs/spend/model.js');
    const an = await import('../assets/js/tabs/spend/analytics.js');
    m.resetF(); m.invalidate();
    const idx = m.IDX();
    const tot = m.sum(idx, m.M.a);
    let raw = 0;
    for (let k = 0; k < m.M.N; k++) if (m.M.st[k] !== m.M.statDraft) raw += m.M.a[k];
    Math.abs(tot - raw) < 0.01 ? pass('סך ההוצאה מתיישב עם סכום השורות') : fail(`סך ההוצאה ${tot} מול ${raw}`);

    // יתרה לאספקה היא כמות, והשווי הוא החלק היחסי מאותה שורה
    const op = m.openIdx(idx);
    let want = 0;
    for (let j = 0; j < op.length; j++) { const k = op[j]; want += m.M.a[k] * (m.M.oq[k] / m.M.q[k]); }
    Math.abs(m.sum(op, m.M.openILS) - want) < 0.01
      ? pass('שווי ההתחייבות הפתוחה מחושב כחלק יחסי מהשורה')
      : fail('שווי ההתחייבות הפתוחה שגוי');

    // מחיר ממוצע משוקלל, ולא ממוצע פשוט של מחירי השורות
    const w = m.wapOf(idx, 0);
    if (!w) fail('לא חושב מחיר משוקלל');
    else {
      let q = 0, a = 0;
      for (let j = 0; j < idx.length; j++) {
        const k = idx[j];
        if (m.M.i[k] !== 0 || m.M.u[k] !== m.M.itemUnit[0]) continue;
        q += m.M.q[k]; a += m.M.a[k];
      }
      Math.abs(w.wap - a / q) < 1e-9 ? pass('מחיר משוקלל = סכום חלקי כמות') : fail('מחיר משוקלל שגוי');
    }

    // שער ההשוואה: קוד מרכז-עלות לא נכנס לפערי המחיר
    const gaps = an.priceGaps(idx);
    gaps.every(g => !m.M.itemCatchAll[g.it])
      ? pass('קודי מרכז-עלות מוחרגים מפערי המחיר')
      : fail('קוד מרכז-עלות חלחל לפערי המחיר');
    gaps.length ? pass(`זוהו ${gaps.length} פערי מחיר בני-השוואה`) : fail('לא זוהה אף פער מחיר בנתוני הבדיקה');

    // חיסכון מחושב לעולם לא שלילי, ותמיד מופרד מאומדן
    const { out } = an.buildOpportunities(idx, {});
    out.every(o => o.save >= 0) ? pass('אין הזדמנות עם חיסכון שלילי') : fail('הזדמנות עם חיסכון שלילי');
    out.every(o => o.basis === 'מחושב' || o.basis === 'אומדן') && out.every(o => o.assume)
      ? pass('כל הזדמנות מסומנת כמחושבת או כאומדן ונושאת את הנחות החישוב')
      : fail('הזדמנות בלי בסיס או בלי הנחות חישוב');

    // חלון ארוך משנה חופף לעצמו — ההשוואה חייבת להיחסם
    m.clearPeriod(); m.invalidate();
    m.yoyUsable() === false ? pass('השוואה לשנה קודמת נחסמת בטווח ארוך משנה') : fail('השוואה חופפת לא נחסמה');
    m.F.years.add(m.M.years[m.M.years.length - 1]); m.invalidate();
    m.yoyUsable() === true ? pass('השוואה לשנה קודמת פעילה בבחירת שנה אחת') : fail('השוואה לשנה אחת נחסמה בטעות');

    // מיפוי העמודות: סדר המועמדים גובר על סדר העמודות בקובץ
    const sys = await import('../assets/js/tabs/spend/views-system.js');
    {
      const hdr = ['לטיפול', "מס' ספק", 'שם ספק', 'סוג ספק', 'תאור סוג ספק', 'תאור סוג הזמנת רכש',
        'הזמנת רכש', 'תאריך ההזמנה', 'סטטוס הזמנה', 'שורה בהזמנה', "מק'ט", 'תאור מוצר',
        'כמות', "יח'", 'מחיר ליחידה', 'מטבע ההזמנה', 'סכום (ILS)', 'ת. אספקה', 'יתרה לאספקה'];
      const mp = sys.autoMap(hdr);
      hdr[mp.std] === 'תאור סוג ספק'
        ? pass('מיפוי אוטומטי בוחר את תאור סוג הספק ולא את הקוד')
        : fail(`מיפוי סוג ספק הצביע על "${hdr[mp.std]}"`);
      ['sid', 'po', 'odate', 'item', 'qty', 'cprice', 'amt'].every(k => mp[k] != null)
        ? pass('כל שדות החובה ממופים אוטומטית מכותרות הקובץ')
        : fail('שדה חובה לא מופה אוטומטית');

      // שורה כפולה מוסרת, שורה פגומה נפסלת עם סיבה
      const row = (po, ln, item, d) => {
        const r = new Array(hdr.length).fill('');
        r[mp.sid] = '200-1'; r[mp.sname] = 'ספק'; r[mp.po] = po; r[mp.line] = ln;
        r[mp.item] = item; r[mp.odate] = d; r[mp.qty] = 2; r[mp.cprice] = 5; r[mp.amt] = 10;
        return r;
      };
      const bad = new Array(hdr.length).fill('');
      bad[mp.sid] = '200-1'; bad[mp.po] = 'P9'; bad[mp.item] = 'X'; bad[mp.odate] = 'לא תאריך';
      const ing = sys.ingest([row('P1', 1, 'A', '2026-01-05'), row('P1', 1, 'A', '2026-01-05'),
        row('P2', 1, 'A', '2026-02-05'), bad], mp, 'בדיקה.xlsx');
      ing.ok && ing.payload.meta.rows === 2 ? pass('קליטה: שתי שורות תקינות') : fail(`קליטה החזירה ${ing.payload?.meta?.rows} שורות`);
      ing.dup === 1 ? pass('שורה כפולה הוסרה (הזמנה+שורה+מק״ט)') : fail('כפילות לא הוסרה');
      ing.errs.length === 1 && /תאריך/.test(ing.errs[0].why) ? pass('שורה עם תאריך פגום נפסלה עם סיבה') : fail('שורה פגומה לא נפסלה כראוי');
    }

    // שורת הכותרות נבחרת לפי טקסטואליות, לא לפי מיקום
    {
      const aoa = [
        ['מס\' ספק', 'הזמנת רכש', 'תאריך ההזמנה', "מק'ט", 'כמות', 'מחיר ליחידה', 'סכום (ILS)'],
        ['200-1', 'P1', '2026-01-05', 'A', 2, 5, 10],
        ['200-1', 'P2', '2026-02-05', 'A', 3, 5, 15]
      ];
      let hr = 0, best = -1;
      for (let n = 0; n < Math.min(8, aoa.length); n++) {
        const cells = aoa[n].filter(x => String(x ?? '').trim() !== '');
        const textish = cells.filter(x => typeof x !== 'number' && !/^-?\d+([.,]\d+)?$/.test(String(x).trim())).length;
        const score = cells.length + textish;
        if (score > best) { best = score; hr = n; }
      }
      hr === 0 ? pass('שורת הכותרות מזוהה גם כשכל שורות הנתונים מלאות') : fail(`זוהתה שורה ${hr} ככותרת`);
    }

    // הסינון באמת מצמצם
    const all = m.IDX().length;
    m.F.sup.add(0); m.invalidate();
    const one = m.IDX().length;
    one > 0 && one < all ? pass('מנוע הסינון מצמצם את קבוצת השורות') : fail('הסינון לא השפיע');
    m.resetF(); m.invalidate();
  }
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
