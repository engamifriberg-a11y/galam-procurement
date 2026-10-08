// לשונית SPEND: ניתוח רכש אסטרטגי על קובץ הזמנות הרכש.
//
// המבנה זהה לשאר הלשוניות — registerTab אחד, ניווט פנימי דרך #spend/<מסך>.
// ההבדל היחיד הוא הנפח: 42 אלף שורות הזמנה נטענות פעם אחת מ-/api/spend,
// נשמרות במערכים מוקלדים, וכל 21 המסכים שואבים מאותו מנוע סינון.

import { registerTab, $, $$, esc, get, send, clearCache, loading, empty } from '../../core/base.js';
import {
  M, F, IDX, buildModel, invalidate, resetF, clearPeriod, curWindow, sum, nuniq,
  moneyC, num, dstr, isoOf, fromIso, MON, ABCN, LS,
  SUPN, SUPID, ITEM, IDESC, UNIT, CUR, STAT, PTYP, BUY, CATN
} from './model.js';
import { clearAnalyticsCache } from './analytics.js';
import { EL, closeDrawer } from './ui.js';
import { disposeCharts, resizeCharts } from './charts.js';
import { viewExec, viewSuppliers, viewItems, viewABC, supplierCard, itemCard } from './views-core.js';
import { viewPrice, viewYoY, viewCategories, viewCompare, viewInflation } from './views-price.js';
import { viewSavings, viewCentre, viewDependency, viewOrders, viewOpen, viewDemand, viewEfficiency, viewForecast, viewAlerts } from './views-ops.js';
import { viewAdvisor, viewDataQuality, viewLoad } from './views-system.js';

const SCREENS = [
  { id: 'exec', no: '01', he: 'תמונת מצב', full: 'Executive Dashboard', desc: 'היקף הרכש, התחייבויות פתוחות, מגמות והזדמנויות מרכזיות בתקופה הנבחרת.', render: viewExec },
  { id: 'suppliers', no: '02', he: 'ספקים', full: 'ניתוח ספקים', desc: 'דירוג, מגמות, ריכוזיות, ספקים חדשים ומופסקים. לחיצה על ספק פותחת כרטיס מלא.', render: viewSuppliers },
  { id: 'items', no: '03', he: 'מק״טים', full: 'ניתוח מק״טים', desc: 'היקף, כמות, מחיר ממוצע משוקלל, מינימום/מקסימום/אחרון, ספקים ומגמות.', render: viewItems },
  { id: 'abc', no: '04', he: 'ABC', full: 'ניתוח ABC / פארטו', desc: 'מק״טים, ספקים וסוגי ספקים לפי הוצאה מצטברת, עם ספים שניתן לשנות.', render: viewABC },
  { id: 'price', no: '05', he: 'מודיעין מחירים', full: 'מודיעין מחירים', desc: 'עליות וירידות מחיר, ספקים שמעלים מחירים בעקביות ופערים בין ספקים.', render: viewPrice },
  { id: 'yoy', no: '06', he: 'בין שנים', full: 'השוואה בין שנים', desc: 'השוואה חופשית בין תקופות, עם הפרדה בין שינוי שנובע ממחיר לשינוי שנובע מכמות.', render: viewYoY },
  { id: 'categories', no: '07', he: 'קטגוריות', full: 'ניהול קטגוריות', desc: 'הקטגוריות נגזרות מהשדות שקיימים בקובץ. כאן בוחרים את הבסיס ועורכים את המיפוי.', render: viewCategories },
  { id: 'save', no: '08', he: 'חיסכון', full: 'הזדמנויות חיסכון', desc: 'כל הזדמנות עם הבעיה, הפעולה המומלצת, החיסכון המשוער, רמת הביטחון והנחות החישוב.', render: viewSavings },
  { id: 'dep', no: '09', he: 'תלות בספקים', full: 'תלות בספקים', desc: 'מק״טים בספק יחיד, ריכוזיות לפי קטגוריה והיקף החשיפה הכספית.', render: viewDependency },
  { id: 'orders', no: '10', he: 'הזמנות', full: 'ניתוח הזמנות', desc: 'התפלגות לפי שווי, סטטוס, קניין וגיל, והזמנות שמועד האספקה שלהן חלף.', render: viewOrders },
  { id: 'open', no: '11', he: 'התחייבויות', full: 'התחייבויות פתוחות', desc: 'יתרות שטרם סופקו לפי ספק, מק״ט וחודש אספקה צפוי. התחייבות אינה הוצאה.', render: viewOpen },
  { id: 'demand', no: '12', he: 'ביקוש', full: 'מגמות ביקוש', desc: 'מק״טים בצמיחה ובירידה, עונתיות, תנודתיות וביקושים חריגים.', render: viewDemand },
  { id: 'compare', no: '13', he: 'השוואת ספקים', full: 'השוואת ספקים', desc: 'בחירת שני ספקים או יותר והשוואה ביניהם, רק על מק״טים באותה יחידת מידה.', render: viewCompare },
  { id: 'inflation', no: '14', he: 'התייקרויות', full: 'התייקרויות ומניעי עלות', desc: 'מי הניע את ההוצאה — מחיר או כמות — לפי קטגוריה, מק״ט וספק.', render: viewInflation },
  { id: 'efficiency', no: '15', he: 'יעילות', full: 'יעילות תהליכי רכש', desc: 'ריבוי הזמנות קטנות, רכש חוזר, פוטנציאל איחוד והשוואה בין קניינים.', render: viewEfficiency },
  { id: 'forecast', no: '16', he: 'תחזית', full: 'תחזיות ותקציב', desc: 'תחזית לפי מגמה ועונתיות, השוואה לתקציב ותרחישי מחיר וחיסכון.', render: viewForecast },
  { id: 'alerts', no: '17', he: 'התראות', full: 'התראות חכמות', desc: 'כל התראה עם הסבר, מקור הנתונים, חומרה ופעולה מומלצת.', render: viewAlerts },
  { id: 'advisor', no: '18', he: 'יועץ AI', full: 'יועץ רכש מבוסס AI', desc: 'שאלות בעברית חופשית. התשובות מחושבות מהנתונים שבסינון הנוכחי.', render: viewAdvisor },
  { id: 'centre', no: '', he: 'מרכז התייעלות', full: 'מרכז התייעלות', desc: 'יעדי חיסכון לפי פעילות: בסיס, יעד, מה זוהה, מה אושר, מה מומש והפער.', render: viewCentre },
  { id: 'quality', no: '', he: 'איכות נתונים', full: 'איכות נתונים', desc: 'מה נקלט, מה חסר, מה חריג, ומה אחוז הכיסוי של כל ניתוח.', render: viewDataQuality },
  { id: 'load', no: '', he: 'טעינת נתונים', full: 'טעינת נתונים', desc: 'העלאת קובץ חדש עם מיפוי עמודות, זיהוי התקופה ומניעת ספירה כפולה.', render: viewLoad }
];

let LOADED = false;
let LOAD_ERR = null;
const TRACK = { opps: {}, targets: {} };
const STATE = {};
let CURRENT = 'exec';

/* ----- טעינת מערך הנתונים. התשובה דחוסה; הדפדפן פורס אותה לבד. ----- */
async function loadData() {
  if (LOADED) return true;
  const r = await fetch('/api/spend', { headers: { accept: 'application/json' } });
  if (r.status === 401) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash)); return false; }
  if (!r.ok) { LOAD_ERR = `השרת החזיר ${r.status}`; return false; }
  const body = await r.json();
  if (body.empty) { LOAD_ERR = 'empty'; return false; }
  buildModel(body);
  // נפתח על השנה האחרונה: כל השוואת תקופה במערכת משמעותית כבר במבט הראשון
  resetF();
  F.years.add(M.years[M.years.length - 1]);
  invalidate();
  LOADED = true;
  return true;
}
async function loadTrack() {
  const r = await get('/api/spend?track=1');
  if (r.ok) { TRACK.opps = r.body.opps || {}; TRACK.targets = r.body.targets || {}; }
}

/* ----- סרגל הסינון המשותף ----- */
const MSELS = () => [
  { k: 'sup', t: 'ספק', opts: () => M.dims.sup.map((v, n) => [n, SUPN(n), v]) },
  { k: 'styp', t: 'סוג ספק', opts: () => M.dims.styp.map((v, n) => [n, v, '']) },
  { k: 'cat', t: 'קטגוריה', opts: () => M.dims.cat.map((v, n) => [n, v, '']) },
  { k: 'item', t: 'מק״ט', opts: () => M.dims.item.map((v, n) => [n, IDESC(n) || v, v]) },
  { k: 'ptyp', t: 'סוג הזמנה', opts: () => M.dims.potype.map((v, n) => [n, v, '']) },
  { k: 'buyer', t: 'קניין', opts: () => M.dims.buyer.map((v, n) => [n, v, '']) },
  { k: 'stat', t: 'סטטוס', opts: () => M.dims.status.map((v, n) => [n, v, '']) },
  { k: 'cur', t: 'מטבע', opts: () => M.dims.cur.map((v, n) => [n, v, '']) },
  { k: 'unit', t: 'יח׳ מידה', opts: () => M.dims.unit.map((v, n) => [n, v, '']) },
  { k: 'abc', t: 'רמת ABC', opts: () => ABCN.map((v, n) => [n, 'רמה ' + v, '']) }
];

function activeChips() {
  const out = [];
  const named = {
    sup: ['ספק', n => SUPN(n)], styp: ['סוג ספק', n => M.dims.styp[n]], cat: ['קטגוריה', n => CATN(n)],
    item: ['מק״ט', n => ITEM(n)], ptyp: ['סוג הזמנה', n => PTYP(n)], buyer: ['קניין', n => BUY(n)],
    stat: ['סטטוס', n => STAT(n)], cur: ['מטבע', n => CUR(n)], unit: ['יח׳', n => UNIT(n)], abc: ['ABC', n => ABCN[n]]
  };
  for (const k in named) {
    const [lbl, f] = named[k];
    if (!F[k].size) continue;
    if (F[k].size <= 3) [...F[k]].forEach(v => out.push({ label: `${lbl}: ${f(v)}`, clear: () => F[k].delete(v) }));
    else out.push({ label: `${lbl}: ${F[k].size} נבחרו`, clear: () => F[k].clear() });
  }
  if (F.years.size) out.push({ label: `שנים: ${[...F.years].join(', ')}`, clear: () => F.years.clear() });
  if (F.qs.size) out.push({ label: `רבעונים: ${[...F.qs].map(q => 'Q' + q).join(', ')}`, clear: () => F.qs.clear() });
  if (F.months.size) out.push({ label: `חודשים: ${F.months.size}`, clear: () => F.months.clear() });
  if (F.from != null) out.push({ label: `מ-${dstr(F.from)}`, clear: () => { F.from = null; } });
  if (F.to != null) out.push({ label: `עד ${dstr(F.to)}`, clear: () => { F.to = null; } });
  if (F.openOnly) out.push({ label: 'רק הזמנות פתוחות', clear: () => { F.openOnly = false; } });
  return out;
}

let POP = null;
function closePop() { if (POP) { POP.remove(); POP = null; } }

function filterBar(ctx) {
  const wrap = EL('div', { class: 'panel spend-filters' });
  const lastY = M.years[M.years.length - 1];

  const r1 = EL('div', { class: 'bar' });
  r1.appendChild(EL('span', { class: 'flbl', text: 'תקופה' }));
  const presets = [
    ['השנה הנוכחית', () => { clearPeriod(); F.years.add(lastY); }, () => F.years.size === 1 && F.years.has(lastY) && F.from == null],
    ['12 חודשים אחרונים', () => { clearPeriod(); F.from = M.maxD - 365; F.to = M.maxD; }, () => F.from === M.maxD - 365 && F.to === M.maxD],
    ['שנה קודמת', () => { clearPeriod(); F.years.add(lastY - 1); }, () => F.years.size === 1 && F.years.has(lastY - 1) && F.from == null],
    ['כל השנים', () => clearPeriod(), () => !F.years.size && !F.qs.size && !F.months.size && F.from == null && F.to == null]
  ];
  presets.forEach(([lbl, fn, on]) => r1.appendChild(EL('button', {
    class: 'chip' + (on() ? ' on' : ''), text: lbl, onclick: () => { fn(); ctx.refresh(); }
  })));
  r1.appendChild(EL('span', { class: 'flbl', text: 'שנים' }));
  M.years.forEach(y => r1.appendChild(EL('button', {
    class: 'chip' + (F.years.has(y) ? ' on' : ''), text: String(y),
    onclick: () => { F.years.has(y) ? F.years.delete(y) : F.years.add(y); ctx.refresh(); }
  })));
  [1, 2, 3, 4].forEach(q => r1.appendChild(EL('button', {
    class: 'chip' + (F.qs.has(q) ? ' on' : ''), text: 'Q' + q,
    onclick: () => { F.qs.has(q) ? F.qs.delete(q) : F.qs.add(q); ctx.refresh(); }
  })));
  const mw = EL('div', { class: 'msel' });
  mw.appendChild(EL('button', { class: 'chip', html: `חודשים${F.months.size ? ` <b>${F.months.size}</b>` : ''}`, onclick: e => popMulti(e.currentTarget, 'months', MON.map((v, n) => [n + 1, v, '']), ctx) }));
  r1.appendChild(mw);
  r1.append(EL('span', { class: 'flbl', text: 'טווח' }),
    EL('input', { class: 'inp', type: 'date', style: 'width:auto;text-align:start', value: F.from != null ? isoOf(F.from) : '', onchange: e => { F.from = e.target.value ? fromIso(e.target.value) : null; ctx.refresh(); } }),
    EL('span', { text: '–' }),
    EL('input', { class: 'inp', type: 'date', style: 'width:auto;text-align:start', value: F.to != null ? isoOf(F.to) : '', onchange: e => { F.to = e.target.value ? fromIso(e.target.value) : null; ctx.refresh(); } }));
  wrap.appendChild(r1);

  const r2 = EL('div', { class: 'bar' });
  r2.appendChild(EL('span', { class: 'flbl', text: 'סינון' }));
  MSELS().forEach(d => {
    const w = EL('div', { class: 'msel' });
    w.appendChild(EL('button', { class: 'chip' + (F[d.k].size ? ' on' : ''), html: `${esc(d.t)}${F[d.k].size ? ` <b>${F[d.k].size}</b>` : ''}`, onclick: e => popMulti(e.currentTarget, d.k, d.opts(), ctx) }));
    r2.appendChild(w);
  });
  r2.appendChild(EL('button', { class: 'chip' + (F.openOnly ? ' on' : ''), text: 'רק הזמנות פתוחות', onclick: () => { F.openOnly = !F.openOnly; ctx.refresh(); } }));
  r2.appendChild(EL('button', { class: 'chip' + (F.noDrafts ? ' on' : ''), text: 'ללא טיוטות', onclick: () => { F.noDrafts = !F.noDrafts; ctx.refresh(); } }));
  r2.appendChild(EL('button', { class: 'chip', text: '↺ אפס הכל', onclick: () => { resetF(); ctx.refresh(); } }));
  wrap.appendChild(r2);

  const act = activeChips();
  if (act.length) {
    const r3 = EL('div', { class: 'bar' });
    r3.appendChild(EL('span', { class: 'flbl', text: 'פעיל' }));
    act.forEach(c => r3.appendChild(EL('button', { class: 'chip on', html: `${esc(c.label)} <b>✕</b>`, onclick: () => { c.clear(); ctx.refresh(); } })));
    wrap.appendChild(r3);
  }

  const idx = IDX();
  const cov = EL('div', { class: 'statusbar' });
  cov.innerHTML = `<span>מוצגות <b>${num(idx.length)}</b> מתוך ${num(M.N)} שורות הזמנה · <b>${moneyC(sum(idx, M.a))}</b> · כיסוי ${(idx.length / M.N * 100).toFixed(1)}%</span>`;
  wrap.appendChild(cov);
  return wrap;
}

function popMulti(btn, key, opts, ctx) {
  closePop();
  const set = F[key];
  const pop = EL('div', { class: 'mselpop' });
  POP = pop;
  const sb = EL('input', { type: 'search', class: 'inp', style: 'width:100%;text-align:start', placeholder: 'חיפוש…' });
  const list = EL('div', { class: 'msellist' });
  const top = EL('div', { class: 'inline-form' });
  const info = EL('span', { class: 'sub' });
  const cur = () => {
    const q = sb.value.trim().toLowerCase();
    return q ? opts.filter(o => String(o[1]).toLowerCase().includes(q) || String(o[2]).toLowerCase().includes(q)) : opts;
  };
  const fill = () => {
    const a = cur();
    list.innerHTML = '';
    info.textContent = `${a.length} אפשרויות · ${set.size} נבחרו`;
    a.slice(0, 400).forEach(o => {
      const lb = EL('label');
      const cb = EL('input', { type: 'checkbox' });
      cb.checked = set.has(o[0]);
      cb.onchange = () => { cb.checked ? set.add(o[0]) : set.delete(o[0]); invalidate(); info.textContent = `${a.length} אפשרויות · ${set.size} נבחרו`; };
      lb.append(cb, EL('span', { text: String(o[1]) }), o[2] ? EL('i', { text: String(o[2]) }) : EL('i'));
      list.appendChild(lb);
    });
    if (a.length > 400) list.appendChild(EL('div', { class: 'sub', text: 'מוצגות 400 הראשונות — חדד את החיפוש' }));
  };
  top.append(
    EL('button', { class: 'btn sm', text: 'נקה', onclick: () => { set.clear(); invalidate(); fill(); } }),
    EL('button', { class: 'btn sm', text: 'בחר את המוצגים', onclick: () => { cur().slice(0, 400).forEach(o => set.add(o[0])); invalidate(); fill(); } }),
    info
  );
  sb.oninput = fill;
  fill();
  pop.append(sb, top, list);
  btn.parentElement.appendChild(pop);
  setTimeout(() => sb.focus(), 10);
  const off = e => {
    if (pop.contains(e.target) || e.target === btn) return;
    document.removeEventListener('mousedown', off);
    closePop();
    ctx.refresh();
  };
  setTimeout(() => document.addEventListener('mousedown', off), 10);
}

/* ----- הלשונית ----- */
registerTab({
  id: 'spend',
  he: 'SPEND',
  async render(view, { sub, go }) {
    disposeCharts();
    closeDrawer();
    closePop();

    // כשאין עדיין נתונים, מסך הטעינה חייב להיות נגיש — אחרת אין דרך להעלות
    // את הקובץ הראשון, והלשונית נעולה על מסך ריק שמפנה לעצמו.
    if (!LOADED) {
      view.innerHTML = loading('טוען את מחסן נתוני הרכש');
      const ok = await loadData();
      if (!ok && !(LOAD_ERR === 'empty' && sub === 'load')) {
        view.innerHTML = LOAD_ERR === 'empty'
          ? empty('לא נטענו עדיין נתוני רכש', 'העלה את קובץ הזמנות הרכש במסך טעינת הנתונים כדי להפעיל את הלשונית.')
          : empty('טעינת נתוני הרכש נכשלה', LOAD_ERR || '');
        if (LOAD_ERR === 'empty') {
          const b = EL('button', { class: 'btn primary', style: 'margin-top:14px', text: 'למסך טעינת הנתונים', onclick: () => go('spend', 'load') });
          view.querySelector('.empty').appendChild(b);
        }
        return;
      }
      if (ok) loadTrack();
    }

    const screen = SCREENS.find(s => s.id === sub) || SCREENS[0];
    CURRENT = screen.id;

    const ctx = {
      go: id => go('spend', id),
      refresh: () => { invalidate(); render2(); },
      redraw: () => render2(),
      state: (k, init) => (STATE[k] ||= init),
      track: TRACK,
      activeChips,
      hasData: () => LOADED,
      // נקרא אחרי קליטה מוצלחת: המודל כבר נבנה בדפדפן, אין טעם למשוך שוב מהשרת
      markLoaded: () => {
        LOADED = true;
        LOAD_ERR = null;
        resetF();
        F.years.add(M.years[M.years.length - 1]);
        invalidate();
        loadTrack();
      }
    };

    view.innerHTML = '';
    const nav = EL('nav', { class: 'subtabs', role: 'tablist' });
    SCREENS.forEach(s => nav.appendChild(EL('button', {
      class: 'subtab', role: 'tab', 'aria-selected': String(s.id === screen.id),
      html: `${s.no ? `<em>${s.no}</em>&nbsp;` : ''}${esc(s.he)}`,
      onclick: () => go('spend', s.id)
    })));
    view.appendChild(nav);

    const head = EL('div', { class: 'spend-head' });
    head.innerHTML = `<h2>${screen.no ? `<em>${screen.no}</em> ` : ''}${esc(screen.full)}</h2><p>${esc(screen.desc)}</p>`;
    view.appendChild(head);

    const bar = EL('div');
    view.appendChild(bar);
    const body = EL('div', { class: 'spend-body' });
    view.appendChild(body);

    function render2() {
      disposeCharts();
      bar.innerHTML = '';
      body.innerHTML = '';
      if (!LOADED) {                       // מסך הטעינה לפני שיש מודל כלשהו
        try { screen.render(body, new Uint32Array(0), ctx); }
        catch (e) { console.error(e); body.innerHTML = empty('שגיאה בהצגת המסך', String(e?.message || e)); }
        return;
      }
      if (screen.id !== 'load') bar.appendChild(filterBar(ctx));
      const idx = IDX();
      if (!idx.length && screen.id !== 'load' && screen.id !== 'quality') {
        body.innerHTML = empty('אין שורות שעונות על הסינון', 'נקה חלק מהפילטרים בשורת הסינון שמעל.');
        return;
      }
      try { screen.render(body, idx, ctx); }
      catch (e) { console.error(e); body.innerHTML = empty('שגיאה בהצגת המסך', String(e?.message || e)); }
      setTimeout(resizeCharts, 60);
    }
    render2();
  }
});