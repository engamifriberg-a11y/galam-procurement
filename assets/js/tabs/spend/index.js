// לשונית SPEND: ניתוח הרכש של גלעם מקובץ הזמנות הרכש.
//
// ארבעה מסכים בלבד, בסדר שבו מנהל רכש שואל את השאלות: איפה הכסף → אצל מי
// → על מה → ומה השתנה מול שנה שעברה. כל מספר במסך לחיץ ומוביל לכרטיס
// המלא של אותו ספק או מק״ט.
//
// 42 אלף שורות הזמנה נטענות פעם אחת מ-/api/spend, נשמרות במערכים מוקלדים,
// וכל המסכים שואבים מאותו מנוע סינון — ולכן אין שני מסכים שמראים מספר שונה.

import { registerTab, esc, get, loading, empty } from '../../core/base.js';
import {
  M, F, IDX, buildModel, invalidate, resetF, sum, num, moneyC,
  SUPN, CATN, PTYP, BUY
} from './model.js';
import { EL, closeDrawer } from './ui.js';
import { disposeCharts, resizeCharts } from './charts.js';
import { viewSuppliers } from './views-suppliers.js';
import { viewItems } from './views-items.js';
import { viewTypes } from './views-types.js';
import { viewNegotiate } from './views-negotiate.js';
import { viewAdvisor, viewLoad } from './views-system.js';

const SCREENS = [
  { id: 'suppliers', he: 'הוצאות לפי ספק', full: 'הוצאות לפי ספק', render: viewSuppliers,
    desc: 'אצל מי הכסף יושב: חלוקת ההוצאה בין הספקים, מי גדל ומי קטן מול אשתקד, ועקומת פארטו. לחיצה פותחת כרטיס ספק.' },
  { id: 'items', he: 'הוצאות לפי מק״ט', full: 'הוצאות לפי מק״ט', render: viewItems,
    desc: 'על מה הכסף הולך: הוצאה לכל מק״ט, הכמות שנצרכה, המחיר הממוצע ואיך הוא זז. לחיצה פותחת כרטיס מק״ט.' },
  { id: 'types', he: 'לפי סוג ספק', full: 'ניתוח לפי סוג ספק', render: viewTypes,
    desc: 'באיזו פעילות הכסף יושב — חומרי גלם, אנרגיה, אריזות, אחזקה, הובלות. בחירת סוג פותחת את הספקים והמק״טים שבתוכו.' },
  { id: 'negotiate', he: 'יעדי מו״מ', full: 'יעדי משא ומתן', render: viewNegotiate,
    desc: 'המק״טים היקרים והנצרכים ביותר, מדורגים לפי כדאיות מו״מ, עם פוטנציאל החיסכון והנימוק לכל אחד.' },
  { id: 'ai', he: 'יועץ AI', full: 'יועץ רכש', render: viewAdvisor,
    desc: 'שאלות בעברית חופשית על הנתונים. התשובות מחושבות מההזמנות שבסינון הנוכחי, לא מידע כללי.' },
  { id: 'load', he: 'טעינת נתונים', full: 'טעינת נתונים', render: viewLoad,
    desc: 'העלאת קובץ הזמנות רכש חדש, עם מיפוי עמודות ובדיקת תקינות.' }
];

let LOADED = false;
let LOAD_ERR = null;
const STATE = {};

async function loadData() {
  if (LOADED) return true;
  const r = await fetch('/api/spend', { headers: { accept: 'application/json' } });
  if (r.status === 401) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash)); return false; }
  if (!r.ok) { LOAD_ERR = `השרת החזיר ${r.status}`; return false; }
  const body = await r.json();
  if (body.empty) { LOAD_ERR = 'empty'; return false; }
  buildModel(body);
  openOnLastYear();
  LOADED = true;
  return true;
}

// נפתחים על השנה האחרונה שיש בה נתונים: כך כל השוואה מול אשתקד
// משמעותית כבר במבט הראשון, בלי שצריך לבחור כלום.
function openOnLastYear() {
  resetF();
  F.years.add(M.years[M.years.length - 1]);
  invalidate();
}

/* ---------- סרגל הסינון ----------
   ארבע בקרות בלבד: שנה, סוג ספק, סוג הזמנה וקניין. כל מה שמעבר לזה נעשה
   בתוך המסכים עצמם, דרך חיפוש בטבלה או לחיצה על עמודה. */
function filterBar(ctx) {
  const wrap = EL('div', { class: 'panel spend-filters' });

  const r1 = EL('div', { class: 'bar' });
  r1.appendChild(EL('span', { class: 'flbl', text: 'שנה' }));
  M.years.forEach(y => r1.appendChild(EL('button', {
    class: 'chip' + (F.years.size === 1 && F.years.has(y) ? ' on' : ''),
    text: String(y),
    // בחירה יחידה: שנה אחת בכל רגע, כי כל המסכים משווים אותה לשנה שלפניה
    onclick: () => { F.years.clear(); F.years.add(y); ctx.refresh(); }
  })));
  r1.appendChild(EL('button', {
    class: 'chip' + (F.years.size ? '' : ' on'), text: 'כל השנים',
    onclick: () => { F.years.clear(); ctx.refresh(); }
  }));

  const drop = (key, label, names, valueOf) => {
    const sel = EL('select', { class: 'inp', style: 'width:auto;text-align:start', onchange: e => {
      F[key].clear();
      if (e.target.value !== '') F[key].add(+e.target.value);
      ctx.refresh();
    } });
    sel.appendChild(EL('option', { value: '', text: label }));
    names.forEach((nm, n) => sel.appendChild(EL('option', {
      value: n, text: nm || '—', selected: F[key].has(n) ? 'selected' : null
    })));
    return sel;
  };
  const r2 = EL('div', { class: 'bar' });
  r2.append(
    EL('span', { class: 'flbl', text: 'סינון' }),
    drop('styp', 'כל סוגי הספקים', M.dims.styp),
    drop('ptyp', 'כל סוגי ההזמנות', M.dims.potype),
    drop('buyer', 'כל הקניינים', M.dims.buyer),
    EL('button', { class: 'chip' + (F.noDrafts ? ' on' : ''), text: 'בלי טיוטות', onclick: () => { F.noDrafts = !F.noDrafts; ctx.refresh(); } }),
    EL('button', { class: 'chip', text: '↺ איפוס', onclick: () => { openOnLastYear(); ctx.refresh(); } })
  );
  wrap.append(r1, r2);

  const idx = IDX();
  const bar = EL('div', { class: 'statusbar' });
  bar.innerHTML = `<span>מוצגות <b>${num(idx.length)}</b> מתוך ${num(M.N)} שורות הזמנה · סך <b>${moneyC(sum(idx, M.a))}</b></span>`;
  wrap.appendChild(bar);
  return wrap;
}

registerTab({
  id: 'spend',
  he: 'SPEND',
  async render(view, { sub, go }) {
    disposeCharts();
    closeDrawer();

    if (!LOADED) {
      view.innerHTML = loading('טוען את נתוני הרכש');
      const ok = await loadData();
      if (!ok) {
        if (LOAD_ERR !== 'empty') { view.innerHTML = empty('טעינת נתוני הרכש נכשלה', LOAD_ERR || ''); return; }
        // אין עדיין נתונים: נפתחים ישר על מסך הטעינה, כך שאזור גרירת הקובץ
        // נמצא מול העיניים ולא מאחורי כפתור.
        sub = 'load';
      }
    }

    const screen = SCREENS.find(s => s.id === sub) || SCREENS[0];

    const ctx = {
      go: id => go('spend', id),
      refresh: () => { invalidate(); render2(); },
      redraw: () => render2(),
      state: (k, init) => (STATE[k] ||= init),
      hasData: () => LOADED,
      track: { opps: {} },
      // תיאור הסינון הפעיל, כדי שהיועץ ידע על מה הוא עונה
      activeChips: () => {
        const out = [];
        if (F.years.size) out.push({ label: 'שנה: ' + [...F.years].join(', ') });
        if (F.styp.size) [...F.styp].forEach(v => out.push({ label: 'סוג ספק: ' + M.dims.styp[v] }));
        if (F.ptyp.size) [...F.ptyp].forEach(v => out.push({ label: 'סוג הזמנה: ' + PTYP(v) }));
        if (F.buyer.size) [...F.buyer].forEach(v => out.push({ label: 'קניין: ' + BUY(v) }));
        return out;
      },
      // סינון מהירה מתוך גרף: לחיצה על עמודה מצמצמת את כל המסך אליה
      filterBy: (key, value) => { F[key].clear(); F[key].add(value); invalidate(); render2(); },
      markLoaded: () => { LOADED = true; LOAD_ERR = null; openOnLastYear(); }
    };

    view.innerHTML = '';
    const nav = EL('nav', { class: 'subtabs', role: 'tablist' });
    SCREENS.forEach(s => nav.appendChild(EL('button', {
      class: 'subtab', role: 'tab', 'aria-selected': String(s.id === screen.id),
      text: s.he, onclick: () => go('spend', s.id)
    })));
    view.appendChild(nav);

    const head = EL('div', { class: 'spend-head' });
    head.innerHTML = `<h2>${esc(screen.full)}</h2><p>${esc(screen.desc)}</p>`;
    view.appendChild(head);

    const bar = EL('div');
    const body = EL('div', { class: 'spend-body' });
    view.append(bar, body);

    function render2() {
      disposeCharts();
      bar.innerHTML = '';
      body.innerHTML = '';
      if (!LOADED) {
        try { screen.render(body, new Uint32Array(0), ctx); }
        catch (e) { console.error(e); body.innerHTML = empty('שגיאה בהצגת המסך', String(e?.message || e)); }
        return;
      }
      if (screen.id !== 'load') bar.appendChild(filterBar(ctx));
      const idx = IDX();
      if (!idx.length && screen.id !== 'load') {
        body.innerHTML = empty('אין שורות שעונות על הסינון', 'שנה את הבחירה בסרגל שמעל.');
        return;
      }
      try { screen.render(body, idx, ctx); }
      catch (e) { console.error(e); body.innerHTML = empty('שגיאה בהצגת המסך', String(e?.message || e)); }
      setTimeout(resizeCharts, 60);
    }
    render2();
  }
});
