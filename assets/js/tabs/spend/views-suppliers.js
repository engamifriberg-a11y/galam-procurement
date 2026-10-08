// מסך — הוצאות לפי ספק.
//
// השאלה: אצל מי הכסף יושב. עוגה, עמודות, עקומת פארטו וטבלה מלאה, וכל
// אחד מהם מוביל לכרטיס הספק עם ההיסטוריה המלאה שלו.
import { esc } from '../../core/base.js';
import {
  M, money, moneyC, num, pct, dstr, sum, nuniq, sumBy, topMap,
  SUPN, SUPID, supAgg
} from './model.js';
import { EL, panel, tiles, table, barCell, trend, deltaOf, note } from './ui.js';
import { pareto } from './charts.js';
import { pair, pairNote } from './period.js';
import { supplierCard } from './cards.js';
import { pieAndBars } from './viz.js';

export function viewSuppliers(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const cur = supAgg(idx);
  const prv = p.prev ? sumBy(p.prev, M.s, M.a) : null;
  const bySup = sumBy(idx, M.s, M.a);

  const rows = [...cur.entries()].map(([s, o]) => {
    const was = prv ? (prv.get(s) || 0) : null;
    return {
      s, sup: SUPN(s), sid: SUPID(s), styp: M.dims.styp[M.supStyp[s]] || 'ללא סיווג',
      spend: o.spend, was, chg: was ? (o.spend / was - 1) * 100 : null,
      share: tot ? o.spend / tot * 100 : 0,
      pos: o.pos, items: o.items, open: o.open, last: o.last
    };
  }).sort((a, b) => b.spend - a.spend);
  let run = 0;
  rows.forEach(r => { run += r.spend; r.cum = tot ? run / tot * 100 : 0; });

  const n80 = rows.findIndex(r => r.cum >= 80) + 1;
  const top10 = rows.slice(0, 10).reduce((a, b) => a + b.spend, 0);

  /* ---------- המספרים ---------- */
  const head = panel(root, 'הוצאות לפי ספק', pairNote(p));
  tiles(head, [
    { k: 'סך הוצאה', v: moneyC(tot), d: money(tot), lead: true },
    { k: 'לעומת התקופה המקבילה', v: p.prev ? trend(deltaOf(tot, sum(p.prev, M.a))) : '—',
      d: p.prev ? moneyC(sum(p.prev, M.a)) : 'אין שנה קודמת' },
    { k: 'ספקים', v: num(rows.length), d: 'שעבדנו איתם בתקופה' },
    { k: 'הספק הגדול', v: rows[0] ? moneyC(rows[0].spend) : '—', d: rows[0] ? rows[0].sup : '' },
    { k: '10 הגדולים', v: tot ? (top10 / tot * 100).toFixed(0) + '%' : '—', d: moneyC(top10) },
    { k: 'ממוצע לספק', v: moneyC(rows.length ? tot / rows.length : 0), d: `${num(nuniq(idx, M.p))} הזמנות` }
  ]);
  if (rows.length) {
    note(head, `${num(n80)} ספקים מתוך ${num(rows.length)} מחזיקים 80% מההוצאה. שם נמצא הכסף, ושם גם כוח המיקוח — `
      + 'מול ספק שמקבל מאיתנו מיליונים יש מה להציע בתמורה להנחה.');
  }

  /* אותו ספק תחת שני מספרים — המחזור שלו מפוצל, ואיתו כוח המיקוח */
  const byName = new Map();
  rows.forEach(r => {
    const n = r.sup.trim();
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(r);
  });
  const dupes = [...byName.entries()].filter(([, a]) => a.length > 1)
    .map(([name, a]) => ({ name, ids: a.map(x => x.sid), spend: a.reduce((s, x) => s + x.spend, 0) }))
    .sort((a, b) => b.spend - a.spend);
  if (dupes.length) {
    note(head, `${dupes.length} ${dupes.length === 1 ? 'ספק מופיע' : 'ספקים מופיעים'} תחת יותר ממספר ספק אחד, ולכן ההוצאה מולם מפוצלת בין שורות: `
      + dupes.slice(0, 4).map(d => `${d.name} (${d.ids.join(', ')} · ${moneyC(d.spend)} יחד)`).join(' · ')
      + '. איחוד הכרטיסים במערכת יראה את הנפח האמיתי מול הספק.', 'warn');
  }

  /* ---------- עוגה ועמודות ---------- */
  pieAndBars(root, {
    title: 'חלוקת ההוצאה בין הספקים', sub: 'שמונת הגדולים, והשאר מקובצים. לחיצה פותחת כרטיס ספק',
    barTitle: '12 הספקים הגדולים', barSub: 'לחיצה פותחת כרטיס ספק מלא',
    map: bySup, nameOf: SUPN, onPick: s => supplierCard(s)
  });

  /* ---------- פארטו ---------- */
  const pp = panel(root, 'עקומת פארטו', 'כל עמודה היא ספק, מהגדול לקטן. הקו העולה הוא ההוצאה המצטברת באחוזים, והקו האופקי הוא 80%.');
  const top60 = rows.slice(0, 60);
  pareto(pp, top60.map(r => r.sup), top60.map(r => r.spend), top60.map(r => r.cum), {
    height: '300px',
    marks: [{ yAxis: 80, lineStyle: { color: 'rgba(156,107,14,.75)' }, label: { formatter: '80%' } }],
    onClick: e => { const r = top60[e.dataIndex]; if (r) supplierCard(r.s); }
  });

  /* ---------- הטבלה המלאה ---------- */
  const q = EL('input', { class: 'inp', type: 'search', placeholder: 'חיפוש ספק לפי שם או מספר…', style: 'width:min(340px,100%);text-align:start' });
  const body = panel(root, 'כל הספקים', 'מיון בלחיצה על כותרת · שורה פותחת כרטיס · ⤓ מייצא לאקסל', q);
  const host = EL('div');
  body.appendChild(host);
  const max = rows[0]?.spend || 1;

  const cols = [
    { k: 'sup', t: 'ספק', w: true, f: (v, r) => `${esc(v)}<span class="sub">${esc(r.sid)} · ${esc(r.styp)}</span>` },
    { k: 'spend', t: 'הוצאה', n: true, f: v => barCell(v, max, moneyC) },
    { k: 'was', t: 'תקופה מקבילה', n: true, f: v => v == null ? '—' : moneyC(v) },
    { k: 'chg', t: 'שינוי', n: true, f: v => trend(v) },
    { k: 'share', t: '% מההוצאה', n: true, f: (v, r) => `${v.toFixed(1)}%<span class="sub">מצטבר ${r.cum.toFixed(0)}%</span>` },
    { k: 'pos', t: 'הזמנות', n: true },
    { k: 'items', t: 'מק״טים', n: true },
    { k: 'open', t: 'יתרה לאספקה', n: true, f: v => v ? moneyC(v) : '—' },
    { k: 'last', t: 'הזמנה אחרונה', n: true, f: v => dstr(v), sortV: r => r.last }
  ];
  const paint = () => {
    const s = q.value.trim().toLowerCase();
    host.innerHTML = '';
    const list = s ? rows.filter(r => r.sup.toLowerCase().includes(s) || String(r.sid).includes(s)) : rows;
    table(host, cols, list, { size: 25, name: 'הוצאות לפי ספק', sort: 1, onRow: r => supplierCard(r.s) });
  };
  let t = null;
  q.oninput = () => { clearTimeout(t); t = setTimeout(paint, 180); };
  paint();
}
