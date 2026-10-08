// כרטיס ספק וכרטיס מק״ט. שניהם נפתחים מכל מקום במערכת — מעמודה בגרף,
// משורה בטבלה או מחיפוש — ומראים את אותה תמונה: כמה כסף, על מה, מתי,
// ובאיזה מחיר. כל המספרים מחושבים על כל ההיסטוריה, לא רק על התקופה
// שנבחרה, כי כשמנהל רכש פותח כרטיס ספק הוא רוצה את הסיפור המלא.
import { esc } from '../../core/base.js';
import {
  M, ALL, idxWhere, sum, nuniq, money, moneyC, num, price, pct, dstr,
  SUPN, SUPID, ITEM, IDESC, UNIT, STAT, PTYP, BUY, MEASURABLE,
  itemAgg, supAgg, wapOf, lastPrice, monthly
} from './model.js';
import { EL, drawer, grp, kv, tiles, tileHtml, table, barRows, trend, deltaOf, drill } from './ui.js';
import { lines } from './charts.js';
import { yearSpan } from './period.js';

const yearIdx = (base, y) => idxWhere(k => M.y[k] === y, base);

/* ---------- כרטיס ספק ---------- */
export function supplierCard(si) {
  const all = idxWhere(k => M.s[k] === si, ALL());
  const info = M.dims.supInfo[si] || {};
  const years = M.years.filter(y => yearIdx(all, y).length);
  const lastY = years[years.length - 1];
  const cur = lastY != null ? yearIdx(all, lastY) : all;
  const prv = lastY != null ? yearIdx(all, lastY - 1) : null;

  drawer(SUPN(si), `${SUPID(si)} · ${info.typeDesc || 'ללא סיווג'}`, (b, bag) => {
    const spend = sum(all, M.a);
    const cs = sum(cur, M.a), ps = prv ? sum(prv, M.a) : null;
    const g = grp(b);
    tiles(g, [
      { k: `מחזור ${lastY ?? ''}`, v: moneyC(cs), d: money(cs), lead: true },
      { k: `לעומת ${(lastY ?? 0) - 1}`, v: ps ? trend(deltaOf(cs, ps)) : '—', d: ps ? moneyC(ps) : 'אין נתוני השוואה' },
      { k: 'מחזור מצטבר', v: moneyC(spend), d: `${years[0] ?? ''}–${lastY ?? ''}` },
      { k: 'הזמנות', v: num(nuniq(all, M.p)), d: `${num(all.length)} שורות` },
      { k: 'מק״טים', v: num(nuniq(all, M.i)), d: '' },
      { k: 'יתרה לאספקה', v: moneyC(sum(all, M.openILS)), d: 'שווי משוער' }
    ]);

    // מחזור לפי שנה — התמונה שמנהל רכש מחפש ראשונה
    const gy = grp(b, 'מחזור לפי שנה');
    barRows(gy, years.map(y => [String(y) + (yearSpan(y).partial ? ' (חלקי)' : ''), sum(yearIdx(all, y), M.a)]));

    const gm = grp(b, 'מגמה חודשית');
    const mm = monthly(all);
    lines(gm, mm.x, [{ name: 'הוצאה', data: mm.v, area: true }], { height: '200px', bag });

    const gi = grp(b, `מה קונים ממנו — ${lastY ?? ''}`);
    const rows = [...itemAgg(cur).entries()].map(([it, o]) => ({
      it, item: ITEM(it), desc: IDESC(it), spend: o.spend, qty: o.qty,
      unit: UNIT(M.itemUnit[it]), lines: o.lines
    })).sort((a, b2) => b2.spend - a.spend).slice(0, 40);
    if (rows.length) {
      table(gi, [
        { k: 'item', t: 'מק״ט' },
        { k: 'desc', t: 'תאור', w: true },
        { k: 'qty', t: 'כמות', n: true, f: (v, r) => num(v, v < 10 ? 2 : 0) + ' ' + esc(r.unit) },
        { k: 'spend', t: 'עלות', n: true, f: v => money(v) },
        { k: 'lines', t: 'שורות', n: true }
      ], rows, { size: 10, name: 'מק״טים של ' + SUPN(si), sort: 3, onRow: r => itemCard(r.it) });
    }

    const ga = grp(b, 'פעילות');
    kv(ga, [
      ['הזמנה ראשונה', dstr(Math.min(...Array.from(all, k => M.d[k])))],
      ['הזמנה אחרונה', dstr(Math.max(...Array.from(all, k => M.d[k])))],
      ['קניינים', [...new Set(Array.from(all, k => BUY(M.b[k])))].slice(0, 6).map(esc).join(' · ')],
      ['סוגי הזמנה', [...new Set(Array.from(all, k => PTYP(M.pt[k])))].slice(0, 6).map(esc).join(' · ')]
    ]);
    ga.appendChild(EL('button', { class: 'btn', text: 'כל שורות ההזמנה', onclick: () => drill(SUPN(si), all) }));
  });
}

/* ---------- כרטיס מק״ט ---------- */
export function itemCard(ii) {
  const all = idxWhere(k => M.i[k] === ii, ALL());
  const unit = UNIT(M.itemUnit[ii]);
  const meas = MEASURABLE.has(unit);
  const years = M.years.filter(y => yearIdx(all, y).length);
  const lastY = years[years.length - 1];

  drawer(ITEM(ii) + (IDESC(ii) ? ' · ' + IDESC(ii) : ''), `יחידת מידה ${unit}${meas ? '' : ' · כמות לא מדידה'}`, (b, bag) => {
    const cur = lastY != null ? yearIdx(all, lastY) : all;
    const prv = lastY != null ? yearIdx(all, lastY - 1) : null;
    const wc = wapOf(cur, ii), wp = prv ? wapOf(prv, ii) : null;
    const lp = lastPrice(all, ii);

    const g = grp(b);
    tiles(g, [
      { k: `עלות ${lastY ?? ''}`, v: moneyC(sum(cur, M.a)), d: money(sum(cur, M.a)), lead: true },
      { k: 'כמות', v: wc ? num(wc.qty, wc.qty < 10 ? 2 : 0) + ' ' + esc(unit) : '—', d: prv && wp ? `אשתקד ${num(wp.qty, 0)}` : '' },
      { k: 'מחיר ממוצע', v: wc ? price(wc.wap) : '—', d: wp ? `אשתקד ${price(wp.wap)}` : 'משוקלל לפי כמות' },
      { k: 'שינוי מחיר', v: (wc && wp) ? trend(deltaOf(wc.wap, wp.wap)) : '—', d: `${lastY ?? ''} מול ${(lastY ?? 0) - 1}` },
      { k: 'מחיר אחרון', v: lp ? price(lp.p) : '—', d: lp ? `${dstr(lp.d)} · ${SUPN(lp.s)}` : '' },
      { k: 'ספקים', v: num(nuniq(all, M.s)), d: `${num(nuniq(all, M.p))} הזמנות` }
    ]);
    if (!meas) {
      b.appendChild(EL('p', {
        class: 'banner warn',
        text: `יחידת המידה היא ${unit}, ולכן הכמות אינה מידה פיזית והשוואת מחיר ליחידה כאן אינה אמינה. העלות הכוללת תקפה.`
      }));
    }

    const gy = grp(b, 'לפי שנה');
    const yr = years.map(y => {
      const ix = yearIdx(all, y), w = wapOf(ix, ii);
      return { y: String(y) + (yearSpan(y).partial ? ' (חלקי)' : ''), spend: sum(ix, M.a), qty: w ? w.qty : null, wap: w ? w.wap : null, lines: ix.length };
    });
    table(gy, [
      { k: 'y', t: 'שנה' },
      { k: 'qty', t: 'כמות', n: true, f: v => v == null ? '—' : num(v, v < 10 ? 2 : 0) },
      { k: 'spend', t: 'עלות', n: true, f: v => money(v) },
      { k: 'wap', t: 'מחיר ממוצע', n: true, f: v => v == null ? '—' : price(v) },
      { k: 'lines', t: 'שורות', n: true }
    ], yr, { all: true, name: 'מק״ט ' + ITEM(ii), sort: 0, asc: true });

    const gs = grp(b, 'מי מספק ובאיזה מחיר');
    const bySup = [...supAgg(all).entries()].map(([s, o]) => {
      const ix = idxWhere(k => M.s[k] === s, all), w = wapOf(ix, ii), l = lastPrice(ix, ii);
      return { sup: SUPN(s), s, spend: o.spend, qty: w ? w.qty : null, wap: w ? w.wap : null, last: l ? l.p : null, lastD: l ? l.d : -1 };
    }).sort((a, b2) => b2.spend - a.spend);
    table(gs, [
      { k: 'sup', t: 'ספק', w: true },
      { k: 'qty', t: 'כמות', n: true, f: v => v == null ? '—' : num(v, v < 10 ? 2 : 0) },
      { k: 'spend', t: 'עלות', n: true, f: v => money(v) },
      { k: 'wap', t: 'מחיר ממוצע', n: true, f: v => v == null ? '—' : price(v) },
      { k: 'last', t: 'מחיר אחרון', n: true, f: (v, r) => v == null ? '—' : price(v) + `<span class="sub">${esc(dstr(r.lastD))}</span>` }
    ], bySup, { size: 10, name: 'ספקים של ' + ITEM(ii), sort: 2, onRow: r => supplierCard(r.s) });

    const gm = grp(b, 'מגמה חודשית');
    const mm = monthly(all);
    lines(gm, mm.x, [{ name: 'עלות', data: mm.v, area: true }], { height: '200px', bag });

    gm.appendChild(EL('button', { class: 'btn', text: 'כל שורות ההזמנה', onclick: () => drill(ITEM(ii), all) }));
  });
}
