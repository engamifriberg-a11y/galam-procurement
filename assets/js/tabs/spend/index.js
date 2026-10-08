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
  M, F, IDX, buildModel, invalidate, resetF, sum, num, moneyC, fkey,
  SUPN, CATN, PTYP, BUY
} from './model.js';
import { EL, closeDrawer } from './ui.js';
import { disposeCharts, resizeCharts } from './charts.js';
import { viewMacro } from './views-macro.js';
import { viewPortfolio } from './views-portfolio.js';
import { viewVendors } from './views-vendors.js';
import { viewActions } from './views-actions.js';
import { viewLoad } from './views-system.js';

const SCREENS = [
  { id: 'macro', he: 'מבט-על', full: 'מבט-על ניהולי', render: viewMacro,
    desc: 'תיק הרכש כולו בעמוד אחד: כמה הוצאנו, מול אשתקד, איפה התקציב יושב ומה זז. כל גרף לחיץ.' },
  { id: 'portfolio', he: 'תיק המק״טים', full: 'תיק המק״טים', render: viewPortfolio,
    desc: 'איך בנוי התיק: סיווג ABC, ריכוזיות התקציב, וכסף מול תנודתיות מחיר — איפה שווה להשקיע זמן ניהולי.' },
  { id: 'vendors', he: 'ספקים ומחזורים', full: 'ספקים ומחזורים', render: viewVendors,
    desc: 'מצבת הספקים: מחזורים, מדד ריכוזיות, פילוח לפי סוג הזמנה וסוג ספק, ותלות בספק בודד.' },
  { id: 'actions', he: 'הזדמנויות והמלצות', full: 'הזדמנויות והמלצות', render: viewActions,
    desc: 'רשימת עבודה: מכרזים, איחוד ספקים, מו״מ ופערי מחיר — כל אחת עם המספרים שמאחוריה.' },
  { id: 'load', he: 'טעינת נתונים', full: 'טעינת נתונים', render: viewLoad,
    desc: 'העלאת קובץ הזמנות רכש חדש, עם מיפוי עמודות ובדיקת תקינות. טעינה אחת מפעילה את כל המסכים.' }
];

let LOADED = false;
let LOAD_ERR = null;
const STATE = {};
const CACHE = { key: null, map: new Map() };

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
      // המסכים חולקים את אותם חישובים כבדים. המטמון נפסל אוטומטית בכל
      // שינוי סינון, כך שאין סיכוי ששני מסכים יראו מספרים שונים.
      cache: (key, build) => {
        const k = fkey();
        if (CACHE.key !== k) { CACHE.key = k; CACHE.map = new Map(); }
        if (!CACHE.map.has(key)) CACHE.map.set(key, build());
        return CACHE.map.get(key);
      },
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
    SCREENS.forEach(s => {
      // בלי נתונים אין מה להציג בשאר המסכים, והם מסומנים כלא זמינים.
      // כך ברור שמדובר בטעינה אחת שמפעילה את כולם, ולא בטעינה לכל מסך.
      const locked = !LOADED && s.id !== 'load';
      nav.appendChild(EL('button', {
        class: 'subtab', role: 'tab', 'aria-selected': String(s.id === screen.id),
        disabled: locked ? 'disabled' : null,
        title: locked ? 'יהיה זמין מיד אחרי טעינת הקובץ' : null,
        text: s.he, onclick: () => { if (!locked) go('spend', s.id); }
      }));
    });
    view.appendChild(nav);

    const head = EL('div', { class: 'spend-head' });
    head.innerHTML = LOADED
      ? `<h2>${esc(screen.full)}</h2><p>${esc(screen.desc)}</p>`
      : `<h2>טעינת קובץ הרכש</h2><p>טעינה אחת כאן מפעילה את כל מסכי SPEND —
         הוצאות לפי ספק, לפי מק״ט, לפי סוג ספק ויעדי מו״מ. אין צורך לטעון שוב בכל מסך.</p>`;
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
