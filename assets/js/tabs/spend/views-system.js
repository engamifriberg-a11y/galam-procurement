// יועץ הרכש וטעינת קובץ חדש.
import { esc, send, get, clearCache } from '../../core/base.js';
import {
  M, F, IDX, idxWhere, ALL, scanWindow, curWindow, sum, nuniq, sumBy, topMap, agg,
  dstr, dayOf, money, moneyC, num, pct, price, MEASURABLE,
  SUPN, ITEM, IDESC, UNIT, PTYP, STAT, CUR, buildModel, resetF
} from './model.js';
import { factsPack, priceGaps, clearAnalyticsCache } from './analytics.js';
import { EL, panel, tiles, table, note, grp, kv, toast, drill } from './ui.js';
import { cssv } from './charts.js';

/* ======================= 18 · יועץ רכש מבוסס AI ======================= */
const SUGG = [
  'מהם 20 המק״טים שבהם כדאי להתחיל משא ומתן?',
  'מהם 10 הספקים הגדולים ביותר בגלעם?',
  'איזה ספק העלה מחירים הכי הרבה בשנה האחרונה?',
  'באילו מק״טים אנחנו משלמים יותר לעומת העבר?',
  'מה פוטנציאל החיסכון ברכש אריזות?',
  'באילו סוגי ספקים גדלה ההוצאה?',
  'אילו מק״טים נרכשים אצל כמה ספקים במחירים שונים?',
  'היכן קיימת אפשרות לאיחוד הזמנות?',
  'מה החשיפה שלנו לספק יחיד?',
  'מה מצב ההתחייבויות הפתוחות ומה באיחור?'
];

/* markdown מצומצם: טבלאות, כותרות, רשימות והדגשה. */
function md(txt) {
  const lines = String(txt).split('\n'), out = [];
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  let i = 0;
  while (i < lines.length) {
    if (/^\s*\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const head = lines[i].split('|').slice(1, -1).map(s => s.trim());
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { body.push(lines[i].split('|').slice(1, -1).map(s => s.trim())); i++; }
      out.push(`<div class="tblwrap"><table><thead><tr>${head.map(h => `<th>${inl(h)}</th>`).join('')}</tr></thead><tbody>${
        body.map(r => `<tr>${r.map(c => `<td class="${/^[₪\d\-+.,% ]+$/.test(c) ? 'num' : ''}">${inl(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^#{1,4}\s/.test(lines[i])) { out.push(`<h4>${inl(lines[i].replace(/^#+\s/, ''))}</h4>`); i++; continue; }
    if (/^\s*[-*•]\s/.test(lines[i])) {
      const li = [];
      while (i < lines.length && /^\s*[-*•]\s/.test(lines[i])) { li.push(inl(lines[i].replace(/^\s*[-*•]\s/, ''))); i++; }
      out.push('<ul>' + li.map(x => `<li>${x}</li>`).join('') + '</ul>');
      continue;
    }
    if (lines[i].trim() === '') { i++; continue; }
    out.push(`<p>${inl(lines[i])}</p>`);
    i++;
  }
  return out.join('');
}

export function viewAdvisor(root, idx, ctx) {
  const st = ctx.state('ai', { log: [] });
  const b = panel(root, 'שיחה עם היועץ',
    `הסינון הפעיל: ${ctx.activeChips().map(c => c.label).join(' · ') || 'ללא סינון — כל הנתונים'} · ${num(idx.length)} שורות · ${moneyC(sum(idx, M.a))}`);

  const log = EL('div', { class: 'chatlog' });
  if (!st.log.length) log.appendChild(EL('div', { class: 'msg a', html:
    '<b>שלום.</b> אני עונה רק מתוך הנתונים שבמערכת. לפני כל שאלה הדפדפן מחשב חבילת עובדות מההזמנות המסוננות ושולח אותה למודל — כך שאין מספר בתשובה שלא חושב מהקובץ.<br><br>הסינון שבחרת בשורת הפילטרים חל גם על התשובות.' }));
  st.log.forEach(x => log.appendChild(EL('div', { class: 'msg ' + x.r, html: x.r === 'u' ? esc(x.t) : md(x.t) })));
  b.appendChild(log);

  const sg = EL('div', { class: 'qsug' });
  SUGG.forEach(q => sg.appendChild(EL('button', { class: 'btn sm', text: q, onclick: () => { ta.value = q; ask(); } })));
  b.appendChild(sg);

  const row = EL('div', { class: 'inline-form', style: 'margin-top:12px' });
  const ta = EL('textarea', {
    class: 'inp', style: 'flex:1 1 320px;min-height:72px;text-align:start;width:auto',
    placeholder: 'מה תרצה לדעת? לדוגמה: באילו מק״טים כדאי לפתוח משא ומתן ברבעון הקרוב?',
    onkeydown: e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } }
  });
  const btn = EL('button', { class: 'btn primary', text: 'שאל', onclick: () => ask() });
  row.append(ta, btn);
  b.appendChild(row);
  b.appendChild(EL('p', { class: 'note', text: 'Ctrl+Enter לשליחה. השיחה אינה נשמרת בשרת.' }));

  async function ask() {
    const q = ta.value.trim();
    if (!q) return;
    ta.value = '';
    st.log.push({ r: 'u', t: q });
    log.appendChild(EL('div', { class: 'msg u', text: q }));
    const ans = EL('div', { class: 'msg a', html: '<span class="spin"></span> מחשב על הנתונים…' });
    log.appendChild(ans);
    log.scrollTop = log.scrollHeight;
    btn.disabled = true;
    try {
      const facts = factsPack(IDX(), ctx.track.opps);
      const r = await send('/api/spend?ai=1', 'POST', { question: q, facts });
      if (!r.ok) {
        ans.innerHTML = r.status === 503
          ? '<b>לא מוגדר ספק AI בשרת.</b> שאר המסכים עונים על אותן שאלות ישירות: מיקוד משא ומתן במסך ניתוח מק״טים, פערי מחיר במודיעין מחירים, חיסכון בהזדמנויות, תלות בספקים ובהשוואה בין שנים.'
          : `<b>השאילתה נכשלה.</b> ${esc(r.body?.error || 'שגיאה ' + r.status)}`;
      } else {
        ans.innerHTML = md(r.body.answer || '');
        if (r.body.provider) ans.appendChild(EL('div', { class: 'src', text: `נענה על ידי ${r.body.provider} · ${r.body.model || ''}` }));
        st.log.push({ r: 'a', t: r.body.answer || '' });
      }
    } catch (e) {
      ans.innerHTML = '<b>השאילתה נכשלה.</b> ' + esc(e.message || e);
    } finally {
      btn.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  }

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const c = panel(g, 'מה היועץ מחשב', 'כל פריט כאן הוא אגרגציה אמיתית על הנתונים, לא ידע כללי');
    c.appendChild(EL('ul', {}, [
      'היקף הרכש וההתחייבויות בכל סינון', 'דירוג ספקים ומק״טים לפי היקף',
      'מחיר ממוצע משוקלל, מינימום, מקסימום ואחרון', 'פערי מחיר בין ספקים לאותו מק״ט ויחידת מידה',
      'שינויי מחיר עם הפרדת השפעת מחיר מהשפעת כמות', 'הזדמנויות חיסכון עם בסיס החישוב וההנחות',
      'תלות בספקים, HHI ומק״טים בספק יחיד', 'איחוד הזמנות והזמנות קטנות',
      'השוואה בין שנים', 'ההתראות והחריגות הפעילות'
    ].map(x => `<li>${esc(x)}</li>`).join('')));
  }
  {
    const c = panel(g, 'מה היועץ לא יכול', 'מידע שאינו קיים בקובץ');
    c.appendChild(EL('ul', {}, [
      'חשבוניות, תשלומים ואספקות בפועל — הקובץ הוא הזמנות רכש',
      'תנאי הסכם, הנחות כמות או מחירי מחירון',
      'מפרט טכני, ולכן אין איחוד מק״טים דומים בלי בדיקה',
      'עלות תהליך הזמנה — נאמדת ולא נמדדת',
      'מדדי שוק חיצוניים או מחירי סחורות עולמיים',
      'קריטיות מק״ט לייצור — אין שדה כזה בקובץ',
      'מפעל, מחלקה או מרכז עלות — אין עמודה כזו'
    ].map(x => `<li>${esc(x)}</li>`).join('')));
  }
}

/* ======================= טעינת נתונים ======================= */
const FIELDS = [
  { k: 'sid', t: 'מספר ספק', req: true, alias: ["מס' ספק", 'מס.ספק', 'מספר ספק', 'קוד ספק'] },
  { k: 'sname', t: 'שם ספק', alias: ['שם ספק'] },
  { k: 'std', t: 'תאור סוג ספק', alias: ['תאור סוג ספק', 'סוג ספק'] },
  { k: 'po', t: 'הזמנת רכש', req: true, alias: ['הזמנת רכש', 'מספר הזמנה'] },
  { k: 'line', t: 'שורה בהזמנה', alias: ['שורה בהזמנה', 'שורה'] },
  { k: 'odate', t: 'תאריך ההזמנה', req: true, alias: ['תאריך ההזמנה', 'תאריך הזמנה'] },
  { k: 'status', t: 'סטטוס הזמנה', alias: ['סטטוס הזמנה', 'סטטוס'] },
  { k: 'ptyp', t: 'תאור סוג הזמנת רכש', alias: ['תאור סוג הזמנת רכש', 'סוג הזמנה'] },
  { k: 'item', t: 'מק״ט', req: true, alias: ["מק'ט", 'מקט', 'מק״ט'] },
  { k: 'idesc', t: 'תאור מוצר', alias: ['תאור מוצר', 'תיאור מוצר'] },
  { k: 'qty', t: 'כמות', req: true, alias: ['כמות'] },
  { k: 'unit', t: 'יחידת מידה', alias: ["יח'", 'יחידה', 'יחידת מידה'] },
  { k: 'cprice', t: 'מחיר ליחידה', req: true, alias: ['מחיר ליחידה', 'מחיר יחידה'] },
  { k: 'cur', t: 'מטבע', alias: ['מטבע ההזמנה', 'מטבע'] },
  { k: 'amt', t: 'סכום (ILS)', req: true, alias: ['סכום (ils)', 'סכום בשקלים', 'סכום'] },
  { k: 'ddate', t: 'תאריך אספקה', alias: ['ת. אספקה', 'תאריך אספקה'] },
  { k: 'openq', t: 'יתרה לאספקה', alias: ['יתרה לאספקה', 'יתרה'] },
  { k: 'buyer', t: 'קניין / לטיפול', alias: ['לטיפול', 'קניין'] }
];
const norm = s => String(s ?? '').trim().toLowerCase().replace(/[״"'`]/g, '').replace(/\s+/g, ' ');

/* סדר המועמדים הוא שקובע, לא סדר העמודות בקובץ. בלי זה, גיליון שמכיל גם
   ״סוג ספק״ (הקוד) וגם ״תאור סוג ספק״ (הטקסט) היה נתפס לפי העמודה
   המוקדמת יותר, והסיווג היה מתמלא במספרים. */
export function autoMap(headers) {
  const out = {}, used = new Set();
  FIELDS.forEach(f => {
    const cands = [norm(f.t), ...f.alias.map(norm)];
    let hit = -1;
    for (const c of cands) {
      hit = headers.findIndex((h, n) => !used.has(n) && norm(h) === c);
      if (hit >= 0) break;
    }
    if (hit < 0) for (const c of cands) {
      if (c.length <= 3) continue;
      hit = headers.findIndex((h, n) => !used.has(n) && norm(h).includes(c));
      if (hit >= 0) break;
    }
    if (hit >= 0) { out[f.k] = hit; used.add(hit); }
  });
  return out;
}

/* ---------- גיליון כרטיס הספקים שבאותו קובץ ----------
   הקובץ שמייצאים מ-Priority מכיל את שורות ההזמנה ואת כרטיסי הספקים בשני
   גיליונות. אין סיבה להעלות אותו פעמיים: אותה טעינה מעדכנת גם את לשונית
   הספקים, ולכן הסקור, תנאי התשלום ופרטי הקשר תמיד מאותו יום כמו ההזמנות. */
const SUP_COLS = {
  id: ['מס.ספק', 'מס ספק', 'מספר ספק', "מס' ספק"],
  nm: ['שם ספק'], en: ['שם לועזי'], tc: ['סוג ספק'], t: ['תאור סוג ספק'],
  st: ['סטטוס'], cur: ['מטבע'], own: ['לטיפול'], dt: ['תאריך פתיחה'],
  tel: ['טלפון'], fax: ['פקס'], em: ['e-mail', 'אימייל'],
  city: ['עיר', 'עיר ומדינה'], cn: ['ארץ'], web: ['web site', 'אתר'],
  vat: ['מס. עוסק מורשה', 'ח.פ'], scr: ['סקור'], ind: ['סקור ענפי'],
  crd: ['המלצת אשראי'], cls: ['סיווג תאור'], emp: ['מספר עובדים'],
  yr: ['שנת הקמה'], field: ['תחום עיסוק'], ord: ['דרישה\\הזמנה']
};
const NUMF = new Set(['scr', 'ind', 'crd', 'emp', 'yr']);

export function looksLikeSupplierSheet(headers) {
  const h = headers.map(norm);
  const hasId = SUP_COLS.id.some(c => h.includes(norm(c)));
  const hasName = h.includes(norm('שם ספק'));
  const isOrders = h.includes(norm('הזמנת רכש')) || h.includes(norm('סכום (ILS)'));
  return hasId && hasName && !isOrders;
}

export function mapSupplierRows(headers, rows) {
  const h = headers.map(norm);
  const at = names => { for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; } return -1; };
  const idx = {};
  for (const k in SUP_COLS) idx[k] = at(SUP_COLS[k]);
  // שתי עמודות "תנאי תשלום": הראשונה הקוד, האחרונה התיאור הקריא
  const terms = h.map((x, i) => x === norm('תנאי תשלום') ? i : -1).filter(i => i >= 0);
  const addr = ['כתובת', 'כתובת - שורה 2', 'כתובת - שורה 3'].map(n => at([n])).filter(i => i >= 0);
  const txt = (r, i) => i >= 0 ? String(r[i] ?? '').trim() : '';
  const out = [];
  for (const r of rows) {
    const id = txt(r, idx.id);
    if (!id) continue;
    const o = { id };
    for (const k in idx) {
      if (k === 'id') continue;
      const v = txt(r, idx[k]);
      if (!v) continue;
      if (NUMF.has(k)) { const n = Number(v.replace(/[^\d.-]/g, '')); if (Number.isFinite(n)) o[k] = n; }
      else o[k] = v;
    }
    if (!o.t) o.t = 'לא מסווג';
    if (!o.cn) o.cn = 'לא ידוע';
    o.pt = terms.length ? txt(r, terms[0]) || '—' : '—';
    o.ptd = terms.length > 1 ? (txt(r, terms[terms.length - 1]) || o.pt) : o.pt;
    if (o.ptd === '—') o.ptd = 'לא הוגדר';
    const ad = addr.map(i => txt(r, i)).filter(Boolean).join(' ');
    if (ad) o.ad = ad;
    out.push(o);
  }
  return out;
}

const EPOCH_ISO = '2014-01-01';
const EPOCH_MS = Date.parse(EPOCH_ISO + 'T00:00:00Z');
const dnum = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - EPOCH_MS) / 864e5);
function xlDate(v) {
  if (v instanceof Date) return dnum(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
    return dnum(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/);
    if (m) {
      let [, a, b, c] = m.map(Number), y, mo, d;
      if (a > 31) { y = a; mo = b; d = c; } else { d = a; mo = b; y = c < 100 ? 2000 + c : c; }
      return dnum(y, mo, d);
    }
  }
  return -1;
}
const numOf = v => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(/,/g, ''));
  return isFinite(n) ? n : 0;
};

export function ingest(rowsIn, map, fileName) {
  const errs = [];
  const dims = { sup: [], supInfo: [], item: [], itemDesc: [], po: [], buyer: [], status: [], potype: [], unit: [], cur: [] };
  const ix = { sup: new Map(), item: new Map(), po: new Map(), buyer: new Map(), status: new Map(), potype: new Map(), unit: new Map(), cur: new Map() };
  const push = (d, m, v) => { v = v === '' || v == null ? '' : String(v).trim(); if (m.has(v)) return m.get(v); const n = dims[d].length; dims[d].push(v); m.set(v, n); return n; };
  const R = { s: [], i: [], p: [], b: [], st: [], pt: [], u: [], c: [], ln: [], d: [], dd: [], q: [], up: [], a: [], oq: [] };
  const seen = new Set();
  let dup = 0, badDate = 0;
  const supMeta = new Map();
  rowsIn.forEach((r, n) => {
    const g = k => map[k] == null ? undefined : r[map[k]];
    const sid = String(g('sid') ?? '').trim(), item = String(g('item') ?? '').trim(), po = String(g('po') ?? '').trim();
    const d = xlDate(g('odate'));
    if (!sid || !item || !po) { errs.push({ row: n + 2, why: 'חסר מספר ספק, מק״ט או מספר הזמנה' }); return; }
    if (d < 0) { badDate++; errs.push({ row: n + 2, why: 'תאריך הזמנה לא תקין: ' + String(g('odate')) }); return; }
    const ln = Math.round(numOf(g('line'))) || 1;
    const key = po + '|' + ln + '|' + item;
    if (seen.has(key)) { dup++; return; }
    seen.add(key);
    const si = push('sup', ix.sup, sid);
    if (!supMeta.has(si)) supMeta.set(si, { name: String(g('sname') ?? sid).trim(), typeDesc: String(g('std') ?? '').trim() });
    const ii = push('item', ix.item, item);
    if (!dims.itemDesc[ii]) dims.itemDesc[ii] = String(g('idesc') ?? '').trim();
    R.s.push(si); R.i.push(ii); R.p.push(push('po', ix.po, po));
    R.b.push(push('buyer', ix.buyer, g('buyer') ?? '—'));
    R.st.push(push('status', ix.status, g('status') ?? '—'));
    R.pt.push(push('potype', ix.potype, String(g('ptyp') ?? '').trim() || '(ללא סוג)'));
    R.u.push(push('unit', ix.unit, String(g('unit') ?? '').trim() || 'EAC'));
    R.c.push(push('cur', ix.cur, String(g('cur') ?? '').trim() || 'ILS'));
    R.ln.push(ln); R.d.push(d); R.dd.push(xlDate(g('ddate')));
    R.q.push(numOf(g('qty'))); R.up.push(numOf(g('cprice'))); R.a.push(numOf(g('amt'))); R.oq.push(numOf(g('openq')));
  });
  if (!R.s.length) return { ok: false, errs, msg: 'לא נקלטה אף שורה תקינה.' };
  dims.sup.forEach((id, n) => {
    const mt = supMeta.get(n) || {};
    dims.supInfo.push({ name: mt.name || id, typeCode: '', typeDesc: mt.typeDesc || '', status: '', terms: '', opened: -1, city: '', country: '', classDesc: '' });
  });
  dims.itemDesc = dims.item.map((c, n) => dims.itemDesc[n] || '');
  return {
    ok: true, errs, dup, badDate,
    payload: {
      meta: {
        epoch: EPOCH_ISO, rows: R.s.length, builtAt: new Date().toISOString().slice(0, 19),
        sourceFile: fileName, minDate: Math.min(...R.d), maxDate: Math.max(...R.d),
        amountNote: 'סכום בשקלים נלקח מהעמודה שמופתה כ-סכום (ILS).',
        openNote: 'יתרה לאספקה מטופלת ככמות; השווי = סכום×(יתרה/כמות).'
      },
      dims, rows: R
    }
  };
}

/* מערך של 42 אלף שורות שוקל כ-3.5MB כ-JSON, קרוב לתקרת גוף הבקשה של
   פונקציה בודדת. דוחסים בדפדפן ושולחים כ-650KB; השרת פורס. אם הדפדפן
   אינו תומך בדחיסה, נשלח כרגיל. */
/* המערך נשלח דחוס ומקודד base64 בתוך JSON רגיל. גוף בינארי מתפרש אחרת
   בין סביבות ריצה, ותקלה כזו נראית למשתמש כ"השמירה נכשלה" בלי סיבה. */
async function putDataset(payload) {
  const json = JSON.stringify(payload);
  if (typeof CompressionStream === 'function') {
    try {
      const gz = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      const bytes = new Uint8Array(await new Response(gz).arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const r = await fetch('/api/spend', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gzb64: btoa(bin) })
      });
      const body = await r.json().catch(() => ({}));
      // שגיאת שרת שאינה בעיית תוכן — ננסה שוב בשליחה רגילה, לא דחוסה
      if (r.ok || r.status === 400) return { ok: r.ok, status: r.status, body };
    } catch { /* נופלים לשליחה רגילה */ }
  }
  const r = await fetch('/api/spend', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: json });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

let XLSXp = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  XLSXp ||= new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    el.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error('הספרייה נטענה אך אינה זמינה'));
    el.onerror = () => rej(new Error('טעינת מנוע האקסל נכשלה'));
    document.head.appendChild(el);
  });
  return XLSXp;
}

export function viewLoad(root, idx, ctx) {
  const loaded = ctx.hasData ? ctx.hasData() : !!M.N;
  // כשאין נתונים, אזור גרירת הקובץ הוא הדבר הראשון על המסך. פאנל "הנתונים
  // שנטענים כרגע" נפתח רק כשבאמת יש מה להציג בו.
  if (loaded) {
    const cur = panel(root, 'הנתונים שנטענים כרגע');
    kv(cur, [
      ['מקור', esc(M.meta.sourceFile || '—')],
      ['שורות', num(M.N)],
      ['תקופה', `${dstr(M.minD)} – ${dstr(M.maxD)}`],
      ['הזמנות / ספקים / מק״טים', `${num(M.dims.po.length)} / ${num(M.dims.sup.length)} / ${num(M.dims.item.length)}`],
      ['סך הוצאה', money((() => { let s = 0; for (let k = 0; k < M.N; k++) s += M.a[k]; return s; })())],
      ['נקלט לשרת', esc(String(M.meta.builtAt || '').replace('T', ' '))]
    ]);
  }

  const up = panel(root,
    loaded ? 'העלאת קובץ חדש' : 'העלאת קובץ הזמנות הרכש',
    loaded
      ? 'XLSX או CSV · הקובץ נקרא בדפדפן, ורק התוצאה הדחוסה נשמרת בשרת'
      : 'גרור לכאן את הקובץ, או בחר אותו מהמחשב. XLSX או CSV · הקובץ נקרא בדפדפן, '
        + 'תבחר את הגיליון ותאשר את מיפוי העמודות, ומיד אחר כך כל המסכים נפתחים עם הנתונים שלך');
  // מצב המסד עצמו, ולא מה שיש בזיכרון הדפדפן. בלי השורה הזו "טענתי ולא
  // קרה כלום" הוא ניחוש: עכשיו רואים שחור על גבי לבן אם השמירה נחתה.
  const srv = EL('p', { class: 'note', html: '<span class="spin"></span> בודק מה שמור בשרת…' });
  up.appendChild(srv);
  fetch('/api/spend?meta=1', { cache: 'no-store' })
    .then(r => r.json())
    .then(b => {
      srv.innerHTML = b && b.meta
        ? `<b>שמור בשרת:</b> ${num(b.meta.rows)} שורות · ${esc(b.meta.sourceFile || '')} · `
          + `${num(b.meta.suppliers)} ספקים · ${num(b.meta.items)} מק״טים · נקלט ${esc(String(b.meta.builtAt || '').replace('T', ' '))}`
        : '<b>אין עדיין נתונים בשרת.</b> הקובץ שתעלה כאן יישמר במסד, וכל המסכים ייפתחו מיד אחר כך.';
    })
    .catch(() => { srv.textContent = 'לא הצלחתי לבדוק מה שמור בשרת.'; });

  const drop = EL('div', { class: 'dropzone' });
  drop.innerHTML = '<b>גרור לכאן קובץ אקסל</b><span>או</span>';
  const fi = EL('input', { type: 'file', accept: '.xlsx,.xlsm,.xls,.csv', hidden: 'hidden' });
  const pick = EL('button', { class: 'btn', text: 'בחר קובץ', onclick: () => fi.click() });
  drop.append(pick, fi);
  up.appendChild(drop);
  const out = EL('div');
  up.appendChild(out);

  ['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', ev => { const f = ev.dataTransfer.files[0]; if (f) read(f); });
  fi.onchange = () => { if (fi.files[0]) read(fi.files[0]); };

  async function read(file) {
    out.innerHTML = '<p class="note"><span class="spin"></span> קורא את הקובץ…</p>';
    let wb;
    try {
      const XLSX = await loadXlsx();
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    } catch (e) { out.innerHTML = `<p class="banner warn">לא ניתן לקרוא את הקובץ: ${esc(e.message || e)}</p>`; return; }
    out.innerHTML = '';
    const pickS = panel(out, 'גיליון', 'בחר את הגיליון שמכיל את שורות ההזמנה');
    const sel = EL('select', { class: 'inp', style: 'width:auto' });
    wb.SheetNames.forEach(s => sel.appendChild(EL('option', { text: s, value: s, selected: /data|הזמנ|שורות/i.test(s) ? 'selected' : null })));
    pickS.appendChild(sel);
    const step = EL('div');
    out.appendChild(step);

    // מחפשים באותו קובץ גיליון של כרטיסי ספקים, כדי לא לדרוש העלאה שנייה
    let supCand = null;
    try {
      const XLSX = await loadXlsx();
      for (const nm of wb.SheetNames) {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true, blankrows: false, defval: '' });
        if (!aoa.length) continue;
        const hd = aoa[0].map(x => String(x ?? '').trim());
        if (!looksLikeSupplierSheet(hd)) continue;
        const mapped = mapSupplierRows(hd, aoa.slice(1));
        if (mapped.length) { supCand = { name: nm, rows: mapped }; break; }
      }
    } catch { /* אם לא נמצא, פשוט אין עדכון לספקים */ }

    const load = async () => {
      const XLSX = await loadXlsx();
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sel.value], { header: 1, raw: true, blankrows: false, defval: '' });
      step.innerHTML = '';
      if (!aoa.length) { step.innerHTML = '<p class="banner warn">הגיליון ריק.</p>'; return; }
      // שורת הכותרות היא המלאה ביותר *והטקסטואלית* ביותר, והראשונה מביניהן.
      // ספירת תאים בלבד עם >= הייתה בוחרת את השורה האחרונה מבין השוות,
      // כלומר שורת נתונים, בכל גיליון שבו כל העמודות מלאות.
      let hr = 0, best = -1;
      for (let n = 0; n < Math.min(8, aoa.length); n++) {
        const cells = aoa[n].filter(x => String(x ?? '').trim() !== '');
        const textish = cells.filter(x => typeof x !== 'number' && !/^-?\d+([.,]\d+)?$/.test(String(x).trim())).length;
        const score = cells.length + textish;
        if (score > best) { best = score; hr = n; }
      }
      const headers = aoa[hr].map(x => String(x ?? '').trim());
      const body = aoa.slice(hr + 1).filter(r => r.some(x => String(x).trim() !== ''));
      const map = autoMap(headers);

      const mp = panel(step, 'מיפוי עמודות', `זוהו ${num(headers.length)} עמודות ו-${num(body.length)} שורות. תקן כל מיפוי שלא זוהה נכון.`);
      const tw = EL('div', { class: 'tblwrap' });
      tw.innerHTML = '<table><thead><tr><th>שדה במערכת</th><th>עמודה בקובץ</th><th>דוגמה</th></tr></thead><tbody>' +
        FIELDS.map(f => `<tr><td>${esc(f.t)}${f.req ? ' <span class="pill high">חובה</span>' : ''}</td>
          <td><select class="inp" style="width:auto;max-width:220px" data-f="${f.k}"><option value="">— לא ממופה —</option>${
            headers.map((h, n) => `<option value="${n}"${map[f.k] === n ? ' selected' : ''}>${esc(h || 'עמודה ' + (n + 1))}</option>`).join('')}</select></td>
          <td class="wrap" id="ex_${f.k}">${esc(map[f.k] != null && body[0] ? String(body[0][map[f.k]] ?? '') : '')}</td></tr>`).join('') + '</tbody></table>';
      mp.appendChild(tw);
      tw.querySelectorAll('select[data-f]').forEach(s => s.onchange = () => {
        const n = s.value === '' ? null : +s.value;
        const cell = document.getElementById('ex_' + s.dataset.f);
        if (cell) cell.textContent = n != null && body[0] ? String(body[0][n] ?? '') : '';
      });

      const act = EL('div', { class: 'inline-form', style: 'margin-top:12px' });
      let supBox = null;
      if (supCand) {
        const lab = EL('label', { class: 'inline-form', style: 'gap:6px;cursor:pointer' });
        supBox = EL('input', { type: 'checkbox' });
        supBox.checked = true;
        lab.append(supBox, EL('span', { text: `לעדכן גם את מאגר הספקים מגיליון «${supCand.name}» (${num(supCand.rows.length)} ספקים)` }));
        act.appendChild(lab);
      }
      const go = EL('button', { class: 'btn primary', text: 'קלוט ושמור בשרת', onclick: async () => {
        const mm = {};
        tw.querySelectorAll('select[data-f]').forEach(s => { if (s.value !== '') mm[s.dataset.f] = +s.value; });
        const miss = FIELDS.filter(f => f.req && mm[f.k] == null);
        if (miss.length) { toast('חסר מיפוי לשדות חובה: ' + miss.map(f => f.t).join(', ')); return; }
        go.disabled = true; go.textContent = 'קולט…';
        const res = ingest(body, mm, file.name);
        if (!res.ok) { go.disabled = false; go.textContent = 'קלוט ושמור בשרת'; step.appendChild(EL('p', { class: 'banner warn', text: res.msg })); return; }
        const prevRows = loaded ? M.N : 0;
        const prevSrc = loaded ? (M.meta.sourceFile || '—') : null;
        const r = await putDataset(res.payload);
        go.disabled = false; go.textContent = 'קלוט ושמור בשרת';
        if (!r.ok) {
          step.appendChild(EL('p', { class: 'banner warn',
            text: `השמירה בשרת נכשלה (${r.status || 'אין תשובה'}): ${r.body?.error || 'לא התקבל הסבר מהשרת'}. `
              + 'הנתונים עדיין בדפדפן — אפשר ללחוץ שוב על הכפתור. אם זה חוזר, צלם את ההודעה הזו.' }));
          return;
        }
        clearCache();
        buildModel(res.payload);
        clearAnalyticsCache();
        if (ctx.markLoaded) ctx.markLoaded(); else resetF();
        let supMsg = null;
        if (supBox && supBox.checked && supCand) {
          const r2 = await send('/api/suppliers', 'PUT', { version: new Date().toISOString().slice(0, 10), rows: supCand.rows });
          supMsg = r2.ok
            ? `${num(r2.body?.rows ?? supCand.rows.length)} ספקים מגיליון «${supCand.name}»`
            : 'העדכון נכשל: ' + esc(r2.body?.error || r2.status);
        }

        const rep = panel(step, 'דוח קליטה');
        kv(rep, [
          ['קובץ', esc(file.name)], ['שורות שנקלטו', num(M.N)], ['שורות שנדחו', num(res.errs.length)],
          ['כפילויות שהוסרו', `${num(res.dup)} <span class="sub">מפתח: הזמנה + שורה + מק״ט</span>`],
          ['תאריכים לא תקינים', num(res.badDate)],
          ['התקופה שזוהתה', `${dstr(M.minD)} – ${dstr(M.maxD)}`],
          ['סך ההוצאה', money((() => { let s = 0; for (let k = 0; k < M.N; k++) s += M.a[k]; return s; })())],
          [prevSrc ? 'הוחלף' : 'מצב קודם', prevSrc ? `${esc(prevSrc)} (${num(prevRows)} שורות)` : 'לא היו נתונים במערכת'],
          ...(supMsg ? [['מאגר הספקים עודכן', supMsg]] : [])
        ]);
        if (res.errs.length) {
          const e = panel(rep, 'שורות שנפסלו והסיבה');
          table(e, [{ k: 'row', t: 'שורה בקובץ', n: true }, { k: 'why', t: 'סיבת הפסילה', w: true }], res.errs.slice(0, 500), { size: 10, name: 'שגיאות קליטה' });
        }
        rep.appendChild(EL('p', { class: 'banner', text: 'כל הניתוחים חושבו מחדש. אם הקובץ הוא צילום מצב של הזמנות פתוחות בלבד — המערכת מתייחסת לכל שורה כשורת הזמנה, ולכן טעינה כזו מחליפה את התמונה המלאה ואינה מתווספת אליה.' }));
        toast('נקלטו ' + num(M.N) + ' שורות');
        setTimeout(() => ctx.go('macro'), 700);
      } });
      act.append(go, EL('button', { class: 'btn', text: 'בטל', onclick: () => { out.innerHTML = ''; } }));
      mp.appendChild(act);

      const pv = panel(step, 'תצוגה מקדימה', '5 השורות הראשונות כפי שהן בקובץ');
      const tw2 = EL('div', { class: 'tblwrap' });
      tw2.innerHTML = '<table><thead><tr>' + headers.map(h => `<th>${esc(h || '—')}</th>`).join('') + '</tr></thead><tbody>' +
        body.slice(0, 5).map(r => '<tr>' + headers.map((_, n) => `<td>${esc(String(r[n] ?? ''))}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
      pv.appendChild(tw2);
    };
    sel.onchange = load;
    load();
  }

  const notes = panel(root, 'כללי הקליטה');
  notes.appendChild(EL('ul', {}, [
    'מיפוי אוטומטי לפי שמות העמודות, עם אפשרות לתקן כל שדה לפני הקליטה.',
    'מפתח ייחודי לשורה: הזמנת רכש + שורה בהזמנה + מק״ט. שורה שחוזרת מוסרת, כדי למנוע ספירה כפולה בטעינה חוזרת.',
    'התקופה מזוהה אוטומטית מתאריכי ההזמנה שבקובץ.',
    'שורות ללא ספק, מק״ט, הזמנה או תאריך תקין נפסלות ומוצגות בדוח הקליטה עם הסיבה.',
    'סכום ההוצאה נלקח מהעמודה שמופתה כ-סכום (ILS) ולא מחושב מכמות×מחיר, כדי לא לכפול המרות מטבע.',
    'הנתונים נשמרים במסד של האתר ולא בקובץ בתוך הקוד — הם מוגשים רק למי שמחובר.',
    'מפת הקטגוריות נשמרת בדפדפן. אחראי וסטטוס של הזדמנויות נשמרים בשרת ומשותפים לכל המשתמשים.'
  ].map(x => `<li>${esc(x)}</li>`).join('')));
}
