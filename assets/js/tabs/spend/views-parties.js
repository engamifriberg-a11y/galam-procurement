// מסך 2 — מחזור ספקים, ומסך 3 — מק״טים לפי כמות ועלות.
//
// שתי טבלאות שמחזיקות את עיקר העבודה היומית: מי מקבל מאיתנו כסף וכמה,
// ומה אנחנו צורכים ובאיזה מחיר. שתיהן ממוינות, ניתנות לחיפוש, לייצוא,
// ולחיצה על שורה פותחת את הכרטיס המלא.
import { esc } from '../../core/base.js';
import {
  M, money, moneyC, num, price, pct, dstr, sum, nuniq, sumBy, idxWhere,
  SUPN, SUPID, ITEM, IDESC, UNIT, MEASURABLE, supAgg, itemAgg, wapMap, lastPrice
} from './model.js';
import { EL, panel, tiles, table, trend, deltaOf, note, seg, barCell } from './ui.js';
import { pair, pairNote } from './period.js';
import { supplierCard, itemCard } from './cards.js';

/* ======================= ספקים ======================= */
export function viewSuppliers(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const cur = supAgg(idx);
  const prv = p.prev ? sumBy(p.prev, M.s, M.a) : null;

  const rows = [...cur.entries()].map(([s, o]) => {
    const was = prv ? (prv.get(s) || 0) : null;
    return {
      s, sup: SUPN(s), sid: SUPID(s), styp: M.dims.styp[M.supStyp[s]] || 'ללא סיווג',
      spend: o.spend, was, chg: was ? (o.spend / was - 1) * 100 : null,
      share: tot ? o.spend / tot * 100 : 0,
      pos: o.pos, items: o.items, open: o.open, last: o.last
    };
  }).sort((a, b) => b.spend - a.spend);

  // מצטבר, כדי לראות איפה עובר הקו של 80%
  let run = 0;
  rows.forEach(r => { run += r.spend; r.cum = tot ? run / tot * 100 : 0; });

  const top = panel(root, 'מחזור ספקים', pairNote(p));
  const newN = prv ? rows.filter(r => !r.was).length : null;
  tiles(top, [
    { k: 'ספקים פעילים', v: num(rows.length), d: 'בתקופה הנבחרת', lead: true },
    { k: 'סך מחזור', v: moneyC(tot), d: money(tot) },
    { k: 'הספק הגדול', v: rows[0] ? moneyC(rows[0].spend) : '—', d: rows[0] ? rows[0].sup : '' },
    { k: 'ריכוזיות 10 הגדולים', v: tot ? pct(rows.slice(0, 10).reduce((a, b) => a + b.spend, 0) / tot * 100, 0).replace('+', '') : '—', d: 'מסך הרכש' },
    { k: 'ספקים חדשים', v: newN == null ? '—' : num(newN), d: 'לא הופיעו בתקופה המקבילה' },
    { k: 'יתרה לאספקה', v: moneyC(rows.reduce((a, b) => a + b.open, 0)), d: 'הוזמן וטרם סופק' }
  ]);

  /* אותו ספק תחת שני מספרים — המחזור שלו מפוצל, וגם כוח המיקוח */
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
    note(top, `${dupes.length} ${dupes.length === 1 ? 'ספק מופיע' : 'ספקים מופיעים'} תחת יותר ממספר ספק אחד, ולכן המחזור שלהם מפוצל בין שורות: `
      + dupes.slice(0, 4).map(d => `${d.name} (${d.ids.join(', ')} · ${moneyC(d.spend)} יחד)`).join(' · ')
      + '. איחוד הכרטיסים במערכת יראה את הנפח האמיתי מול הספק.', 'warn');
  }

  const q = EL('input', { class: 'inp', type: 'search', placeholder: 'חיפוש ספק לפי שם או מספר…', style: 'width:min(340px,100%);text-align:start' });
  const body = panel(root, 'כל הספקים', 'לחיצה על שורה פותחת כרטיס ספק · ⤓ מייצא לאקסל', q);
  const host = EL('div');
  body.appendChild(host);
  const max = rows[0]?.spend || 1;

  const cols = [
    { k: 'sup', t: 'ספק', w: true, f: (v, r) => `${esc(v)}<span class="sub">${esc(r.sid)} · ${esc(r.styp)}</span>` },
    { k: 'spend', t: 'מחזור', n: true, f: v => barCell(v, max, moneyC) },
    { k: 'was', t: 'תקופה מקבילה', n: true, f: v => v == null ? '—' : moneyC(v) },
    { k: 'chg', t: 'שינוי', n: true, f: v => trend(v) },
    { k: 'share', t: '% מהרכש', n: true, f: (v, r) => `${v.toFixed(1)}%<span class="sub">מצטבר ${r.cum.toFixed(0)}%</span>` },
    { k: 'pos', t: 'הזמנות', n: true },
    { k: 'items', t: 'מק״טים', n: true },
    { k: 'open', t: 'יתרה לאספקה', n: true, f: v => v ? moneyC(v) : '—' },
    { k: 'last', t: 'הזמנה אחרונה', n: true, f: v => dstr(v), sortV: r => r.last }
  ];
  const paint = () => {
    const s = q.value.trim().toLowerCase();
    host.innerHTML = '';
    const list = s ? rows.filter(r => r.sup.toLowerCase().includes(s) || String(r.sid).includes(s)) : rows;
    table(host, cols, list, { size: 25, name: 'מחזור ספקים', sort: 1, onRow: r => supplierCard(r.s) });
  };
  let t = null;
  q.oninput = () => { clearTimeout(t); t = setTimeout(paint, 180); };
  paint();
}

/* ======================= מק״טים ======================= */
export function viewItems(root, idx, ctx) {
  const p = pair();
  const onlyMeas = ctx.state('itemsMeas', { on: false });
  const tot = sum(idx, M.a);

  const cur = itemAgg(idx);
  const wCur = wapMap(idx);
  const wPrv = p.prev ? wapMap(p.prev) : null;
  const sPrv = p.prev ? sumBy(p.prev, M.i, M.a) : null;

  let rows = [...cur.entries()].map(([it, o]) => {
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
      wap, dprice: (wap && wapPrev) ? (wap / wapPrev - 1) * 100 : null,
      dqty: (wc && wp && wp.q > 0) ? (wc.q / wp.q - 1) * 100 : null,
      sups: o.sups, pos: o.pos, last: o.last
    };
  }).sort((a, b) => b.spend - a.spend);

  const measN = rows.filter(r => r.meas).length;
  const head = panel(root, 'מק״טים — כמות ועלות', pairNote(p));
  tiles(head, [
    { k: 'מק״טים', v: num(rows.length), d: 'נרכשו בתקופה', lead: true },
    { k: 'סך עלות', v: moneyC(tot), d: money(tot) },
    { k: 'המק״ט הגדול', v: rows[0] ? moneyC(rows[0].spend) : '—', d: rows[0] ? (rows[0].desc || rows[0].item) : '' },
    { k: 'מק״טים מדידים', v: num(measN), d: 'ק״ג, טון, ליטר, מטר — שם הכמות אמיתית' },
    { k: 'מרובי ספקים', v: num(rows.filter(r => r.sups > 1).length), d: 'אותו פריט מיותר מספק אחד' },
    { k: 'ספק יחיד', v: num(rows.filter(r => r.sups === 1).length), d: 'תלות מלאה בספק אחד' }
  ]);
  note(head, 'כמות היא מספר אמיתי רק כשיחידת המידה מדידה. ב-EAC/EA הכמות היא לרוב 1 והמחיר הוא סכום החשבונית, '
    + 'ולכן "מחיר ממוצע" שם אינו מחיר יחידה. העלות הכוללת נכונה תמיד.');

  const ctrl = EL('div', { class: 'inline-form' });
  const q = EL('input', { class: 'inp', type: 'search', placeholder: 'חיפוש מק״ט או תאור…', style: 'width:min(300px,100%);text-align:start' });
  ctrl.append(seg([[false, 'כל המק״טים'], [true, `רק מדידים (${measN})`]], onlyMeas.on, v => { onlyMeas.on = v; ctx.redraw(); }), q);

  const body = panel(root, 'כל המק״טים', 'לחיצה על שורה פותחת כרטיס מק״ט · ⤓ מייצא לאקסל', ctrl);
  const host = EL('div');
  body.appendChild(host);
  const max = rows[0]?.spend || 1;

  const cols = [
    { k: 'item', t: 'מק״ט' },
    { k: 'desc', t: 'תאור', w: true },
    { k: 'qty', t: 'כמות', n: true, f: (v, r) => (v == null ? '—' : num(v, v < 10 ? 2 : 0)) + `<span class="sub">${esc(r.unit)}</span>` },
    { k: 'dqty', t: 'שינוי כמות', n: true, f: v => trend(v) },
    { k: 'spend', t: 'עלות', n: true, f: v => barCell(v, max, moneyC) },
    { k: 'chg', t: 'שינוי עלות', n: true, f: v => trend(v) },
    { k: 'wap', t: 'מחיר ממוצע', n: true, f: (v, r) => v == null ? '—' : (r.meas ? price(v) : `<span class="sub">${esc(price(v))}</span>`) },
    { k: 'dprice', t: 'שינוי מחיר', n: true, f: (v, r) => r.meas ? trend(v) : '<span class="flat">—</span>' },
    { k: 'sups', t: 'ספקים', n: true },
    { k: 'last', t: 'קנייה אחרונה', n: true, f: v => dstr(v), sortV: r => r.last }
  ];
  const paint = () => {
    const s = q.value.trim().toLowerCase();
    host.innerHTML = '';
    let list = onlyMeas.on ? rows.filter(r => r.meas) : rows;
    if (s) list = list.filter(r => r.item.toLowerCase().includes(s) || (r.desc || '').toLowerCase().includes(s));
    table(host, cols, list, { size: 25, name: 'מק״טים', sort: 4, onRow: r => itemCard(r.it) });
  };
  let t = null;
  q.oninput = () => { clearTimeout(t); t = setTimeout(paint, 180); };
  paint();
}
