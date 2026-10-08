// מסך 3 — ספקים ומחזורים, בראייה רוחבית.
//
// השאלה: איך בנוי מצבת הספקים — מי גדול, כמה מרוכז התיק, ואיפה יש תלות.
// הפילוח לפי סוג ספק וסוג הזמנה יושב כאן, כי זה החתך שבו מחליטים על
// מכרז, על איחוד ועל פתיחת מעגל מציעים.
import { esc } from '../../core/base.js';
import {
  M, money, moneyC, num, dstr, sum, sumBy, topMap, idxWhere, SUPN, ITEM, IDESC
} from './model.js';
import { EL, panel, tiles, table, barRows, barCell, trend, note, seg } from './ui.js';
import { donut } from './charts.js';
import { pair, pairNote } from './period.js';
import { supplierCard, itemCard } from './cards.js';
import { slices } from './viz.js';
import { supplierStats, typeStats, concentration, hhiLabel, vagueShare } from './engine.js';

export function viewVendors(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const rows = ctx.cache('sups', () => supplierStats(idx, p.prev));
  const conc = concentration(rows.map(r => r.spend));
  const view = ctx.state('vn', { lens: 'ptyp', pick: null });
  const cats = ctx.cache('cats:' + view.lens, () => typeStats(idx, p.prev, view.lens));

  /* ---------- KPI ---------- */
  const head = panel(root, 'מצבת הספקים', pairNote(p));
  tiles(head, [
    { k: 'ספקים פעילים', v: num(rows.length), d: 'בתקופה הנבחרת', lead: true },
    { k: 'סך מחזור', v: moneyC(tot), d: money(tot) },
    { k: 'מדד ריכוזיות', v: String(conc.hhi), d: hhiLabel(conc.hhi) + ' · HHI' },
    { k: 'הספק הגדול', v: conc.top1.toFixed(1) + '%', d: rows[0] ? rows[0].sup : '' },
    { k: 'עשרת הגדולים', v: conc.top10.toFixed(0) + '%', d: `${num(conc.n80)} ספקים = 80% מההוצאה` },
    { k: 'ספקים חדשים', v: p.prev ? num(rows.filter(r => !r.was).length) : '—', d: 'לא היו בתקופה המקבילה' }
  ]);
  note(head, `מדד HHI הוא סכום ריבועי הנתחים כפול 10,000, המדד המקובל למדידת ריכוזיות. מתחת ל-1,500 התיק מפוזר, `
    + `מעל 2,500 הוא מרוכז. כאן הוא ${conc.hhi} — ${hhiLabel(conc.hhi)}. ריכוזיות נמוכה אינה בהכרח טובה: `
    + 'היא גם אומרת שאין נפח מרוכז שאפשר להמיר להנחה.');

  /* ---------- פילוח קטגוריות ---------- */
  const lensSeg = seg([['ptyp', 'לפי סוג הזמנת רכש'], ['styp', 'לפי סוג ספק']], view.lens,
    v => { view.lens = v; view.pick = null; ctx.redraw(); });
  const two = EL('div', { class: 'grid2' });
  root.appendChild(two);

  const d1 = panel(two, 'חלוקת ההוצאה לפי קטגוריה', 'לחיצה על פלח בוחרת קטגוריה ופותחת אותה למטה', lensSeg);
  donut(d1, slices(sumBy(idx, view.lens === 'ptyp' ? M.pt : M.styp, M.a),
    k => (view.lens === 'ptyp' ? M.dims.potype : M.dims.styp)[k], 8),
    { onClick: e => { if (e.data._k != null) { view.pick = e.data._k; ctx.redraw(); } } });
  if (view.lens === 'styp') {
    const vague = vagueShare(cats);
    if (vague >= 20) note(d1, `${vague.toFixed(0)}% מההוצאה כאן הם "אחרים" או ללא סיווג. לקבלת החלטות עדיף הפילוח לפי סוג הזמנת רכש.`, 'warn');
  }

  const t1 = panel(two, 'ריכוזיות בתוך כל קטגוריה', 'ככל שהמדד נמוך יותר, ההוצאה מפוזרת על יותר ספקים — ושם יש מקום לאיחוד');
  table(t1, [
    { k: 'name', t: 'קטגוריה', w: true },
    { k: 'spend', t: 'הוצאה', n: true, f: v => moneyC(v) },
    { k: 'share', t: '%', n: true, f: v => v.toFixed(1) + '%' },
    { k: 'sups', t: 'ספקים', n: true },
    { k: 'hhi', t: 'ריכוזיות', n: true, sortV: r => r.conc.hhi, f: (v, r) => `${r.conc.hhi}<span class="sub">${hhiLabel(r.conc.hhi)}</span>` },
    { k: 'top5', t: '5 הגדולים', n: true, sortV: r => r.conc.top5, f: (v, r) => r.conc.top5.toFixed(0) + '%' },
    { k: 'chg', t: 'מול אשתקד', n: true, f: v => trend(v) }
  ], cats, { all: cats.length <= 16, size: 16, name: 'קטגוריות', sort: 1, onRow: r => { view.pick = r.k; ctx.redraw(); } });

  /* ---------- מה בתוך הקטגוריה שנבחרה ---------- */
  if (view.pick != null) {
    const arr = view.lens === 'ptyp' ? M.pt : M.styp;
    const names = view.lens === 'ptyp' ? M.dims.potype : M.dims.styp;
    const ix = idxWhere(k => arr[k] === view.pick, idx);
    const name = names[view.pick] || 'ללא סיווג';
    const inTot = sum(ix, M.a);
    const close = EL('button', { class: 'btn sm', text: '✕ נקה בחירה', onclick: () => { view.pick = null; ctx.redraw(); } });
    const dp = panel(root, `בתוך ${name}`,
      `${moneyC(inTot)} · ${(tot ? inTot / tot * 100 : 0).toFixed(1)}% מההוצאה`, close);
    const g = EL('div', { class: 'grid2' });
    dp.appendChild(g);
    const sp = panel(g, 'הספקים בקטגוריה', 'לחיצה פותחת כרטיס ספק');
    barRows(sp, topMap(sumBy(ix, M.s, M.a), 12).map(([s, v]) => [SUPN(s), v, s]), { onClick: r => supplierCard(r[2]) });
    const ip = panel(g, 'המק״טים בקטגוריה', 'לחיצה פותחת כרטיס מק״ט');
    barRows(ip, topMap(sumBy(ix, M.i, M.a), 12).map(([it, v]) => [(IDESC(it) || ITEM(it)).slice(0, 38) + ' · ' + ITEM(it), v, it]),
      { onClick: r => itemCard(r[2]) });
  }

  /* ---------- תלות ---------- */
  const dep = rows.filter(r => r.share >= 5);
  if (dep.length) {
    const dpn = panel(root, 'תלות בספקים', 'ספקים שמחזיקים 5% ומעלה מסך הרכש. מול ספק כזה אין מו״מ אמיתי בלי חלופה מאושרת.');
    table(dpn, [
      { k: 'sup', t: 'ספק', w: true, f: (v, r) => `${esc(v)}<span class="sub">${esc(r.sid)} · ${esc(r.styp)}</span>` },
      { k: 'share', t: '% מהרכש', n: true, f: v => `<b>${v.toFixed(1)}%</b>` },
      { k: 'spend', t: 'מחזור', n: true, f: v => moneyC(v) },
      { k: 'items', t: 'מק״טים', n: true },
      { k: 'pos', t: 'הזמנות', n: true },
      { k: 'chg', t: 'מול אשתקד', n: true, f: v => trend(v) }
    ], dep, { all: true, name: 'תלות בספקים', sort: 1, onRow: r => supplierCard(r.s) });
  }

  /* ---------- כל הספקים ---------- */
  const q = EL('input', { class: 'inp', type: 'search', placeholder: 'חיפוש ספק לפי שם או מספר…', style: 'width:min(320px,100%);text-align:start' });
  const body = panel(root, 'כל הספקים', 'מיון בלחיצה על כותרת · שורה פותחת כרטיס · ⤓ מייצא לאקסל', q);
  const host = EL('div');
  body.appendChild(host);
  const max = rows[0]?.spend || 1;
  const cols = [
    { k: 'sup', t: 'ספק', w: true, f: (v, r) => `${esc(v)}<span class="sub">${esc(r.sid)} · ${esc(r.styp)}</span>` },
    { k: 'spend', t: 'מחזור', n: true, f: v => barCell(v, max, moneyC) },
    { k: 'share', t: '% מהרכש', n: true, f: (v, r) => `${v.toFixed(1)}%<span class="sub">מצטבר ${r.cum.toFixed(0)}%</span>` },
    { k: 'was', t: 'תקופה מקבילה', n: true, f: v => v == null ? '—' : moneyC(v) },
    { k: 'chg', t: 'שינוי', n: true, f: v => trend(v) },
    { k: 'pos', t: 'הזמנות', n: true },
    { k: 'items', t: 'מק״טים', n: true },
    { k: 'open', t: 'יתרה לאספקה', n: true, f: v => v ? moneyC(v) : '—' },
    { k: 'last', t: 'הזמנה אחרונה', n: true, f: v => dstr(v), sortV: r => r.last }
  ];
  const paint = () => {
    const s = q.value.trim().toLowerCase();
    host.innerHTML = '';
    const list = s ? rows.filter(r => r.sup.toLowerCase().includes(s) || String(r.sid).includes(s)) : rows;
    table(host, cols, list, { size: 25, name: 'ספקים ומחזורים', sort: 1, onRow: r => supplierCard(r.s) });
  };
  let t = null;
  q.oninput = () => { clearTimeout(t); t = setTimeout(paint, 180); };
  paint();
}
