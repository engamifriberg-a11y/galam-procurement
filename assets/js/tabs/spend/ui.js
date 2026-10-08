// רכיבי התצוגה של לשונית SPEND, בנויים על שפת העיצוב הקיימת של האתר:
// panel/ph/pb לכרטיסים, tiles/tile למדדים, bars לעמודות, drawer למגירת הפירוט,
// pill לתגיות. אין כאן פלטת צבעים חדשה — הכל נשען על משתני ה-CSS של app.css.

import { $, $$, esc, cssEsc } from '../../core/base.js';
import {
  M, F, IDX, idxWhere, ALL, money, moneyC, num, pct, price, dstr,
  SUPN, SUPID, ITEM, IDESC, UNIT, CUR, STAT, PTYP, BUY, sum, nuniq, openIdx
} from './model.js';

/* ---------- יסודות ---------- */
export const EL = (t, a, h) => {
  const e = document.createElement(t);
  if (a) for (const k in a) {
    if (k === 'class') e.className = a[k];
    else if (k === 'html') e.innerHTML = a[k];
    else if (k === 'text') e.textContent = a[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), a[k]);
    else if (a[k] != null && a[k] !== false) e.setAttribute(k, a[k]);
  }
  if (h != null) e.innerHTML = h;
  return e;
};

export function panel(parent, title, sub, right) {
  const p = EL('div', { class: 'panel' });
  if (title) {
    const h = EL('div', { class: 'ph' });
    h.appendChild(EL('h2', { text: title }));
    if (sub) h.appendChild(EL('p', { text: sub }));
    if (right) { const r = EL('div', { class: 'right' }); r.appendChild(right); h.appendChild(r); }
    p.appendChild(h);
  }
  const b = EL('div', { class: 'pb' });
  p.appendChild(b);
  parent.appendChild(p);
  return b;
}

/* אריחי מדד. lead מסמן את האריח הראשי של המסך. */
export function tiles(parent, arr) {
  const d = EL('div', { class: 'tiles' });
  d.innerHTML = arr.map(a => tileHtml(a)).join('');
  parent.appendChild(d);
  return d;
}
export function tileHtml({ k, v, d, hint, lead, cls }) {
  return `<div class="tile${lead ? ' lead' : ''}${cls ? ' ' + cls : ''}">
    <span>${esc(k)}${hint ? `<i class="qm" title="${esc(hint)}">ⓘ</i>` : ''}</span>
    <b>${v}</b>
    <em>${d || '&nbsp;'}</em></div>`;
}

export const dirCls = v => v == null ? 'flat' : v > 1 ? 'up' : v < -1 ? 'down' : 'flat';
export const trend = v => v == null ? '<span class="flat">—</span>' : `<span class="${dirCls(v)}">${pct(v)}</span>`;
export function deltaOf(cur, prv) { return prv ? (cur / prv - 1) * 100 : null; }

export function note(parent, text, kind) {
  parent.appendChild(EL('p', { class: 'banner' + (kind ? ' ' + kind : ''), text }));
}

export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = EL('div', { id: 'toast', class: 'toast' }); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 2200);
}

export function seg(opts, cur, on) {
  const s = EL('div', { class: 'subtabs', style: 'margin:0' });
  opts.forEach(([v, l]) => s.appendChild(EL('button', {
    class: 'subtab', 'aria-selected': String(cur === v), text: l, onclick: () => on(v)
  })));
  return s;
}

/* ---------- עמודות אופקיות ---------- */
export function barRows(parent, rows, { fmt, onClick, max } = {}) {
  const mx = max ?? Math.max(1, ...rows.map(r => Math.abs(r[1])));
  const sum0 = rows.reduce((a, b) => a + Math.abs(b[1]), 0);
  const d = EL('div', { class: 'bars' });
  d.innerHTML = rows.map((r, n) => `
    <div class="brow${onClick ? ' click' : ''}" data-n="${n}">
      <span class="blabel" title="${esc(r[0])}">${esc(r[0])}</span>
      <span class="btrack"><span class="bfill" style="width:${Math.max(1.5, Math.abs(r[1]) / mx * 100).toFixed(1)}%${r[3] ? `;background:${r[3]}` : ''}"></span></span>
      <span class="bval">${fmt ? fmt(r[1]) : moneyC(r[1])}<i>${sum0 ? (Math.abs(r[1]) / sum0 * 100).toFixed(1) + '%' : ''}</i></span>
    </div>`).join('');
  if (onClick) $$('.brow', d).forEach(b => b.onclick = () => onClick(rows[+b.dataset.n]));
  parent.appendChild(d);
  return d;
}

/* ---------- טבלה ---------- */
/* cols: [{k, t, n:מספרי, w:גולש, f:(v,row)=>html, sortV, cls}] */
export function table(parent, cols, rows, opt = {}) {
  const st = { sort: opt.sort ?? cols.findIndex(c => c.n), asc: opt.asc ?? false, page: 0, size: opt.size || 25 };
  const wrap = EL('div');
  const tw = EL('div', { class: 'tblwrap' });
  const tbl = EL('table');
  tw.appendChild(tbl);
  const foot = EL('div', { class: 'statusbar' });
  wrap.append(tw, foot);
  parent.appendChild(wrap);

  function draw() {
    const c = cols[st.sort];
    let r = rows.slice();
    if (c) {
      const key = c.k;
      r.sort((a, b) => {
        let x = c.sortV ? c.sortV(a) : a[key], y = c.sortV ? c.sortV(b) : b[key];
        if (typeof x === 'string' || typeof y === 'string') return String(x ?? '').localeCompare(String(y ?? ''), 'he-IL') * (st.asc ? 1 : -1);
        return ((x ?? -Infinity) - (y ?? -Infinity)) * (st.asc ? 1 : -1);
      });
    }
    const tot = r.length, pages = Math.max(1, Math.ceil(tot / st.size));
    st.page = Math.max(0, Math.min(st.page, pages - 1));
    const view = opt.all ? r : r.slice(st.page * st.size, (st.page + 1) * st.size);
    tbl.innerHTML = '<thead><tr>' + cols.map((c2, n) =>
      `<th class="${c2.n ? 'num ' : ''}sortable${n === st.sort ? ' on' + (st.asc ? ' asc' : '') : ''}" data-c="${n}">${esc(c2.t)}</th>`).join('') + '</tr></thead><tbody>' +
      view.map(row => `<tr${opt.onRow ? ' class="click"' : ''}>` + cols.map(c2 => {
        const v = c2.f ? c2.f(row[c2.k], row) : (c2.n ? num(row[c2.k]) : esc(row[c2.k] ?? '—'));
        return `<td class="${c2.n ? 'num' : ''}${c2.w ? ' wrap' : ''}${c2.cls ? ' ' + c2.cls : ''}">${v}</td>`;
      }).join('') + '</tr>').join('') + '</tbody>';

    foot.innerHTML = '';
    foot.appendChild(EL('span', { html: `<b>${num(tot)}</b> שורות${opt.all ? '' : ` · עמוד ${st.page + 1} מתוך ${pages}`}` }));
    const g = EL('span', { class: 'inline-form', style: 'margin-inline-start:auto' });
    if (!opt.all && pages > 1) {
      g.append(
        EL('button', { class: 'btn sm', text: '◀ הקודם', onclick: () => { st.page--; draw(); } }),
        EL('button', { class: 'btn sm', text: 'הבא ▶', onclick: () => { st.page++; draw(); } })
      );
    }
    g.appendChild(EL('button', { class: 'btn sm', text: '⤓ ייצוא', onclick: () => exportRows(opt.name || 'spend', cols, r) }));
    foot.appendChild(g);

    $$('th', tbl).forEach(th => th.onclick = () => {
      const n = +th.dataset.c;
      if (n === st.sort) st.asc = !st.asc; else { st.sort = n; st.asc = false; }
      draw();
    });
    if (opt.onRow) $$('tbody tr', tbl).forEach((tr, n) => tr.onclick = () => opt.onRow(view[n]));
  }
  draw();
  return { redraw: draw, el: wrap };
}

export function barCell(v, max, fmt) {
  const w = max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0;
  return `<span class="cellbar"><i style="width:${w.toFixed(1)}%"></i></span><span>${fmt ? fmt(v) : money(v)}</span>`;
}

/* ---------- ייצוא ---------- */
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
export async function exportRows(name, cols, rows) {
  try {
    const XLSX = await loadXlsx();
    const head = cols.map(c => c.t);
    const body = rows.map(r => cols.map(c => {
      let v = c.x ? c.x(r[c.k], r) : r[c.k];
      if (v && typeof v === 'object') v = String(v);
      return v ?? '';
    }));
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'נתונים');
    XLSX.writeFile(wb, name + '.xlsx');
  } catch (e) { toast('הייצוא נכשל: ' + (e.message || e)); }
}

/* ---------- מגירת פירוט ---------- */
let SCRIM = null, DRAWER = null;
function ensureDrawer() {
  if (DRAWER) return;
  SCRIM = EL('div', { class: 'scrim', onclick: closeDrawer });
  DRAWER = EL('div', { class: 'drawer spend-drawer', role: 'dialog', 'aria-modal': 'true' });
  document.body.append(SCRIM, DRAWER);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
}
export function closeDrawer() {
  if (!DRAWER) return;
  DRAWER.classList.remove('on');
  SCRIM.classList.remove('on');
  if (DRAWER._charts) { DRAWER._charts.forEach(c => { try { c.dispose(); } catch {} }); DRAWER._charts = []; }
}
export function drawer(title, sub, build) {
  ensureDrawer();
  DRAWER._charts = [];
  DRAWER.innerHTML = '';
  const h = EL('div', { class: 'dh' });
  h.appendChild(EL('div', {}, `<h3>${esc(title)}</h3>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}`));
  h.appendChild(EL('button', { class: 'x', text: '×', 'aria-label': 'סגור', onclick: closeDrawer }));
  const b = EL('div', { class: 'db' });
  DRAWER.append(h, b);
  SCRIM.classList.add('on');
  DRAWER.classList.add('on');
  build(b, DRAWER._charts);
  b.scrollTop = 0;
  return b;
}
export function grp(parent, title) {
  const g = EL('div', { class: 'grp' });
  if (title) g.appendChild(EL('h4', { text: title }));
  parent.appendChild(g);
  return g;
}
export function kv(parent, pairs) {
  parent.appendChild(EL('dl', { class: 'kv' },
    pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')));
}

/* ---------- שורות הזמנה ---------- */
export const LINE_COLS = () => [
  { k: 'po', t: 'הזמנת רכש' }, { k: 'ln', t: 'שורה', n: true },
  { k: 'dt', t: 'ת. הזמנה', sortV: r => r.d },
  { k: 'sup', t: 'ספק', w: true }, { k: 'styp', t: 'סוג ספק' },
  { k: 'item', t: 'מק״ט' }, { k: 'idesc', t: 'תאור מוצר', w: true },
  { k: 'q', t: 'כמות', n: true, f: v => num(v, 2) }, { k: 'unit', t: 'יח׳' },
  { k: 'up', t: 'מחיר ליחידה', n: true, f: (v, r) => price(v) + ' ' + r.cur },
  { k: 'a', t: 'סכום ₪', n: true, f: v => money(v) },
  { k: 'stat', t: 'סטטוס' }, { k: 'ptyp', t: 'סוג הזמנה' },
  { k: 'oq', t: 'יתרה לאספקה', n: true, f: v => v ? num(v, 2) : '—' },
  { k: 'oils', t: 'שווי יתרה ₪', n: true, f: v => v ? money(v) : '—' },
  { k: 'ddt', t: 'ת. אספקה', sortV: r => r.dd }, { k: 'buyer', t: 'לטיפול' }
];
export function lineRows(idx, cap) {
  const n = Math.min(idx.length, cap || 4000), out = [];
  for (let j = 0; j < n; j++) {
    const k = idx[j];
    out.push({
      _k: k, po: M.dims.po[M.p[k]], ln: M.ln[k], dt: dstr(M.d[k]), d: M.d[k],
      sup: SUPN(M.s[k]), item: ITEM(M.i[k]), idesc: IDESC(M.i[k]),
      styp: M.dims.styp[M.styp[k]], q: M.q[k], unit: UNIT(M.u[k]), up: M.up[k],
      cur: CUR(M.c[k]), a: M.a[k], stat: STAT(M.st[k]), ptyp: PTYP(M.pt[k]),
      oq: M.oq[k], oils: M.openILS[k], ddt: dstr(M.dd[k]), dd: M.dd[k], buyer: BUY(M.b[k])
    });
  }
  return out;
}
export function drill(title, idx, sub) {
  drawer(title, sub || `${num(idx.length)} שורות הזמנה`, b => {
    const g = grp(b);
    const tot = sum(idx, M.a), op = sum(idx, M.openILS);
    g.innerHTML = `<div class="tiles">
      ${tileHtml({ k: 'סכום', v: moneyC(tot), d: money(tot) })}
      ${tileHtml({ k: 'שורות', v: num(idx.length), d: '' })}
      ${tileHtml({ k: 'הזמנות', v: num(nuniq(idx, M.p)), d: '' })}
      ${tileHtml({ k: 'ספקים', v: num(nuniq(idx, M.s)), d: '' })}
      ${tileHtml({ k: 'מק״טים', v: num(nuniq(idx, M.i)), d: '' })}
      ${tileHtml({ k: 'יתרה לאספקה', v: moneyC(op), d: 'שווי משוער' })}</div>`;
    const g2 = grp(b, 'שורות ההזמנה');
    if (idx.length > 4000) g2.appendChild(EL('p', { class: 'banner warn', text: `מוצגות 4,000 השורות הראשונות מתוך ${num(idx.length)}. צמצם את הסינון לרשימה מלאה.` }));
    table(g2, LINE_COLS(), lineRows(idx), { size: 15, name: 'שורות הזמנה', sort: 10 });
  });
}
