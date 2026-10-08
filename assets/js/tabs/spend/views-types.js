// מסך — ניתוח לפי סוג ספק.
//
// השאלה שמנהל רכש שואל לפני שהוא נכנס לפרטים: באיזו פעילות הכסף יושב —
// חומרי גלם, אנרגיה, אריזות, אחזקה, הובלות. בחירת סוג פותחת מיד את
// הספקים והמק״טים שבתוכו, בלי לעבור מסך.
import { esc } from '../../core/base.js';
import {
  M, F, money, moneyC, num, sum, nuniq, sumBy, topMap, idxWhere, invalidate,
  SUPN, ITEM, IDESC
} from './model.js';
import { EL, panel, tiles, table, barRows, barCell, trend, deltaOf, note } from './ui.js';
import { donut } from './charts.js';
import { pair, pairNote } from './period.js';
import { supplierCard, itemCard } from './cards.js';
import { slices } from './viz.js';

export function viewTypes(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const sel = ctx.state('typeSel', { k: null });

  const curT = sumBy(idx, M.styp, M.a);
  const prvT = p.prev ? sumBy(p.prev, M.styp, M.a) : null;

  const rows = [...curT.entries()].map(([k, v]) => {
    const ix = idxWhere(r => M.styp[r] === k, idx);
    const was = prvT ? (prvT.get(k) || 0) : null;
    return {
      k, name: M.dims.styp[k] || 'ללא סיווג', spend: v, was,
      chg: was ? (v / was - 1) * 100 : null,
      share: tot ? v / tot * 100 : 0,
      sups: nuniq(ix, M.s), items: nuniq(ix, M.i), pos: nuniq(ix, M.p)
    };
  }).sort((a, b) => b.spend - a.spend);

  const head = panel(root, 'ניתוח לפי סוג ספק', pairNote(p));
  tiles(head, [
    { k: 'סך הוצאה', v: moneyC(tot), d: money(tot), lead: true },
    { k: 'סוגי ספק', v: num(rows.length), d: 'פעילויות רכש שונות' },
    { k: 'הסוג הגדול', v: rows[0] ? moneyC(rows[0].spend) : '—', d: rows[0] ? rows[0].name : '' },
    { k: 'חלקו', v: rows[0] && tot ? (rows[0].share).toFixed(0) + '%' : '—', d: 'מסך ההוצאה' },
    { k: 'שלושת הגדולים', v: tot ? (rows.slice(0, 3).reduce((a, b) => a + b.spend, 0) / tot * 100).toFixed(0) + '%' : '—',
      d: rows.slice(0, 3).map(r => r.name).join(' · ') },
    { k: 'ספקים', v: num(nuniq(idx, M.s)), d: `${num(nuniq(idx, M.i))} מק״טים` }
  ]);

  /* ---------- עוגה ועמודות ---------- */
  const row = EL('div', { class: 'grid2' });
  root.appendChild(row);
  const p1 = panel(row, 'חלוקת ההוצאה לפי סוג ספק', 'לחיצה על פלח בוחרת את הסוג ופותחת אותו למטה');
  donut(p1, slices(curT, k => M.dims.styp[k], 9), { onClick: e => { if (e.data._k != null) { sel.k = e.data._k; ctx.redraw(); } } });

  const p2 = panel(row, 'כל סוגי הספק', 'לחיצה בוחרת סוג');
  barRows(p2, rows.map(r => [r.name, r.spend, r.k]), { onClick: r => { sel.k = r[2]; ctx.redraw(); } });

  /* ---------- טבלת הסוגים ---------- */
  const tp = panel(root, 'השוואה בין סוגי הספק', 'כמה כל פעילות עולה, מול התקופה המקבילה · לחיצה על שורה בוחרת סוג');
  const max = rows[0]?.spend || 1;
  table(tp, [
    { k: 'name', t: 'סוג ספק', w: true },
    { k: 'spend', t: 'הוצאה', n: true, f: v => barCell(v, max, moneyC) },
    { k: 'share', t: '% מההוצאה', n: true, f: v => v.toFixed(1) + '%' },
    { k: 'was', t: 'תקופה מקבילה', n: true, f: v => v == null ? '—' : moneyC(v) },
    { k: 'chg', t: 'שינוי', n: true, f: v => trend(v) },
    { k: 'sups', t: 'ספקים', n: true },
    { k: 'items', t: 'מק״טים', n: true },
    { k: 'pos', t: 'הזמנות', n: true }
  ], rows, { all: true, name: 'לפי סוג ספק', sort: 1, onRow: r => { sel.k = r.k; ctx.redraw(); } });

  /* ---------- מה יש בתוך הסוג שנבחר ---------- */
  if (sel.k == null) {
    note(tp, 'בחר סוג ספק — בעוגה, בעמודות או בטבלה — כדי לראות מיד את הספקים והמק״טים שבתוכו.');
    return;
  }
  const ix = idxWhere(k => M.styp[k] === sel.k, idx);
  const name = M.dims.styp[sel.k] || 'ללא סיווג';
  const inTot = sum(ix, M.a);

  const close = EL('button', { class: 'btn sm', text: '✕ נקה בחירה', onclick: () => { sel.k = null; ctx.redraw(); } });
  const dp = panel(root, `בתוך ${name}`,
    `${moneyC(inTot)} · ${(tot ? inTot / tot * 100 : 0).toFixed(1)}% מההוצאה · ${num(nuniq(ix, M.s))} ספקים · ${num(nuniq(ix, M.i))} מק״טים`, close);
  dp.appendChild(EL('button', {
    class: 'btn', text: `לצמצם את כל המסכים ל-${name}`,
    onclick: () => { F.styp.clear(); F.styp.add(sel.k); invalidate(); ctx.refresh(); }
  }));

  const two = EL('div', { class: 'grid2' });
  root.appendChild(two);
  const sp = panel(two, `הספקים הגדולים ב${name === 'ללא סיווג' ? '-' : '-'}${name}`, 'לחיצה פותחת כרטיס ספק');
  barRows(sp, topMap(sumBy(ix, M.s, M.a), 12).map(([s, v]) => [SUPN(s), v, s]), { onClick: r => supplierCard(r[2]) });

  const ip = panel(two, `המק״טים הגדולים ב-${name}`, 'לחיצה פותחת כרטיס מק״ט');
  barRows(ip, topMap(sumBy(ix, M.i, M.a), 12).map(([it, v]) => [(IDESC(it) || ITEM(it)).slice(0, 40) + ' · ' + ITEM(it), v, it]),
    { onClick: r => itemCard(r[2]) });
}
