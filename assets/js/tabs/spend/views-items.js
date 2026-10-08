// מסך — הוצאות לפי מק״ט.
//
// השאלה: על מה הכסף הולך. אותה שפה כמו מסך הספקים — עוגה, עמודות וטבלה —
// ובנוסף הכמות שנצרכה והמחיר הממוצע, כי במק״ט אלה שני הצירים שקובעים.
import { esc } from '../../core/base.js';
import {
  M, money, moneyC, num, price, dstr, sum, nuniq, sumBy, topMap,
  ITEM, IDESC, UNIT, MEASURABLE, itemAgg, wapMap
} from './model.js';
import { EL, panel, tiles, table, barCell, trend, deltaOf, note, seg } from './ui.js';
import { pair, pairNote } from './period.js';
import { itemCard } from './cards.js';
import { pieAndBars } from './viz.js';

const label = it => (IDESC(it) || ITEM(it)).slice(0, 40) + ' · ' + ITEM(it);

export function viewItems(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const cur = itemAgg(idx);
  const wCur = wapMap(idx);
  const wPrv = p.prev ? wapMap(p.prev) : null;
  const sPrv = p.prev ? sumBy(p.prev, M.i, M.a) : null;
  const byItem = sumBy(idx, M.i, M.a);
  const view = ctx.state('itemsView', { meas: false });

  const rows = [...cur.entries()].map(([it, o]) => {
    const u = UNIT(M.itemUnit[it]);
    const meas = MEASURABLE.has(u);
    const wc = wCur.get(it), wp = wPrv ? wPrv.get(it) : null;
    const wap = wc && wc.q > 0 ? wc.a / wc.q : null;
    const wapPrev = wp && wp.q > 0 ? wp.a / wp.q : null;
    const was = sPrv ? (sPrv.get(it) || 0) : null;
    return {
      it, item: ITEM(it), desc: IDESC(it), unit: u, meas,
      qty: wc ? wc.q : o.qty, spend: o.spend, was,
      chg: was ? (o.spend / was - 1) * 100 : null,
      share: tot ? o.spend / tot * 100 : 0,
      wap, dprice: (wap && wapPrev) ? (wap / wapPrev - 1) * 100 : null,
      dqty: (wc && wp && wp.q > 0) ? (wc.q / wp.q - 1) * 100 : null,
      sups: o.sups, pos: o.pos, last: o.last
    };
  }).sort((a, b) => b.spend - a.spend);

  const measN = rows.filter(r => r.meas).length;

  const head = panel(root, 'הוצאות לפי מק״ט', pairNote(p));
  tiles(head, [
    { k: 'סך הוצאה', v: moneyC(tot), d: money(tot), lead: true },
    { k: 'מק״טים', v: num(rows.length), d: 'פריטים שנרכשו בתקופה' },
    { k: 'המק״ט הגדול', v: rows[0] ? moneyC(rows[0].spend) : '—', d: rows[0] ? (rows[0].desc || rows[0].item) : '' },
    { k: '20 הגדולים', v: tot ? (rows.slice(0, 20).reduce((a, b) => a + b.spend, 0) / tot * 100).toFixed(0) + '%' : '—', d: 'מסך ההוצאה' },
    { k: 'מרובי ספקים', v: num(rows.filter(r => r.sups > 1).length), d: 'אותו פריט מיותר מספק אחד' },
    { k: 'ספק יחיד', v: num(rows.filter(r => r.sups === 1).length), d: 'תלות מלאה בספק אחד' }
  ]);

  /* ---------- עוגה ועמודות ---------- */
  pieAndBars(root, {
    title: 'חלוקת ההוצאה בין המק״טים', sub: 'שמונת הגדולים, והשאר מקובצים. לחיצה פותחת כרטיס מק״ט',
    barTitle: '12 המק״טים הגדולים', barSub: 'לחיצה פותחת כרטיס מק״ט מלא',
    map: byItem, nameOf: label, onPick: it => itemCard(it)
  });

  /* ---------- הטבלה ---------- */
  const ctrl = EL('div', { class: 'inline-form' });
  const q = EL('input', { class: 'inp', type: 'search', placeholder: 'חיפוש מק״ט או תאור…', style: 'width:min(300px,100%);text-align:start' });
  ctrl.append(seg([[false, 'כל המק״טים'], [true, `רק מדידים (${num(measN)})`]], view.meas, v => { view.meas = v; ctx.redraw(); }), q);

  const body = panel(root, 'כל המק״טים', 'מיון בלחיצה על כותרת · שורה פותחת כרטיס · ⤓ מייצא לאקסל', ctrl);
  note(body, 'כמות ומחיר ממוצע הם מספרים אמיתיים רק ביחידות מדידות — ק״ג, טון, ליטר, מטר. ב-EAC הכמות היא לרוב 1 '
    + 'והמחיר הוא סכום החשבונית, ולכן שם "מחיר ממוצע" אינו מחיר יחידה. ההוצאה עצמה נכונה תמיד.');
  const host = EL('div');
  body.appendChild(host);
  const max = rows[0]?.spend || 1;

  const cols = [
    { k: 'item', t: 'מק״ט' },
    { k: 'desc', t: 'תאור', w: true },
    { k: 'spend', t: 'הוצאה', n: true, f: v => barCell(v, max, moneyC) },
    { k: 'share', t: '% מההוצאה', n: true, f: v => v.toFixed(1) + '%' },
    { k: 'was', t: 'תקופה מקבילה', n: true, f: v => v == null ? '—' : moneyC(v) },
    { k: 'chg', t: 'שינוי הוצאה', n: true, f: v => trend(v) },
    { k: 'qty', t: 'כמות', n: true, f: (v, r) => (v == null ? '—' : num(v, v < 10 ? 2 : 0)) + `<span class="sub">${esc(r.unit)}</span>` },
    { k: 'dqty', t: 'שינוי כמות', n: true, f: v => trend(v) },
    { k: 'wap', t: 'מחיר ממוצע', n: true, f: (v, r) => v == null ? '—' : (r.meas ? price(v) : `<span class="sub">${esc(price(v))}</span>`) },
    { k: 'dprice', t: 'שינוי מחיר', n: true, f: (v, r) => r.meas ? trend(v) : '<span class="flat">—</span>' },
    { k: 'sups', t: 'ספקים', n: true },
    { k: 'last', t: 'קנייה אחרונה', n: true, f: v => dstr(v), sortV: r => r.last }
  ];
  const paint = () => {
    const s = q.value.trim().toLowerCase();
    host.innerHTML = '';
    let list = view.meas ? rows.filter(r => r.meas) : rows;
    if (s) list = list.filter(r => r.item.toLowerCase().includes(s) || (r.desc || '').toLowerCase().includes(s));
    table(host, cols, list, { size: 25, name: 'הוצאות לפי מק״ט', sort: 2, onRow: r => itemCard(r.it) });
  };
  let t = null;
  q.oninput = () => { clearTimeout(t); t = setTimeout(paint, 180); };
  paint();
}
