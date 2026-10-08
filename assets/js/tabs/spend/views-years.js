// מסך — השוואת שנים.
//
// לא רק "כמה עלה וכמה ירד", אלא גם למה: האם ההוצאה גדלה כי המחיר עלה או
// כי קנינו יותר. הפירוק הזה הוא ההבדל בין דוח לבין טיעון מול ספק.
//
// שנה חלקית נחתכת בשתי השנים באותו יום. בלי זה, 2026 מול 2025 המלאה
// נראית כירידה של 30% שלא קרתה, ועל מספר כזה אי אפשר לנהל משא ומתן.
import { esc } from '../../core/base.js';
import {
  M, money, moneyC, num, price, pct, dstr, sum, nuniq, sumBy, scanWindow,
  dayOf, shiftYear, SUPN, ITEM, IDESC, UNIT, MEASURABLE, wapMap
} from './model.js';
import { EL, panel, tiles, table, trend, deltaOf, note, barRows } from './ui.js';
import { lines } from './charts.js';
import { yearSpan } from './period.js';
import { supplierCard, itemCard } from './cards.js';

export function viewYears(root, idx, ctx) {
  const ys = M.years;
  const st = ctx.state('years', { a: ys[ys.length - 1], b: ys[ys.length - 2] ?? ys[0], align: true });
  if (!ys.includes(st.a)) st.a = ys[ys.length - 1];
  if (!ys.includes(st.b)) st.b = ys[ys.length - 2] ?? ys[0];

  /* ---------- הבקרות ---------- */
  const ctrl = EL('div', { class: 'inline-form' });
  const mk = (val, on) => {
    const s = EL('select', { class: 'inp', style: 'width:auto', onchange: e => { on(+e.target.value); ctx.redraw(); } });
    ys.forEach(y => s.appendChild(EL('option', { value: y, text: String(y), selected: y === val ? 'selected' : null })));
    return s;
  };
  ctrl.append(EL('span', { class: 'flbl', text: 'שנה' }), mk(st.a, v => st.a = v),
    EL('span', { class: 'flbl', text: 'מול' }), mk(st.b, v => st.b = v));

  const spanA = yearSpan(st.a), spanB = yearSpan(st.b);
  const partial = spanA.partial || spanB.partial;
  const cut = spanA.partial ? spanA : (spanB.partial ? spanB : null);
  const align = partial && st.align;
  if (partial) {
    ctrl.appendChild(EL('button', {
      class: 'chip' + (st.align ? ' on' : ''), text: 'חיתוך הוגן — אותו יום בשתי השנים',
      onclick: () => { st.align = !st.align; ctx.redraw(); }
    }));
  }

  // בחיתוך הוגן שתי השנים נחתכות באותו יום־בשנה כמו השנה החלקית
  const winOf = y => {
    const s = yearSpan(y);
    if (!align) return { from: s.from, to: s.to };
    return { from: dayOf(y, 1, 1), to: shiftYear(cut.to, y - cut.y) };
  };
  const wA = winOf(st.a), wB = winOf(st.b);
  const A = scanWindow(wA.from, wA.to), B = scanWindow(wB.from, wB.to);
  const totA = sum(A, M.a), totB = sum(B, M.a);

  const head = panel(root, `${st.a} מול ${st.b}`,
    align ? `שתי השנים נחתכות ב-${dstr(wA.to)} בהתאמה, כדי שההשוואה תהיה על אותו מספר חודשים`
      : 'השוואה על התקופות המלאות כפי שהן בקובץ', ctrl);
  tiles(head, [
    { k: `רכש ${st.a}`, v: moneyC(totA), d: `${dstr(wA.from)} – ${dstr(wA.to)}`, lead: true },
    { k: `רכש ${st.b}`, v: moneyC(totB), d: `${dstr(wB.from)} – ${dstr(wB.to)}` },
    { k: 'שינוי', v: trend(deltaOf(totA, totB)), d: moneyC(totA - totB) },
    { k: 'ספקים', v: `${num(nuniq(A, M.s))} / ${num(nuniq(B, M.s))}`, d: `${st.a} / ${st.b}` },
    { k: 'מק״טים', v: `${num(nuniq(A, M.i))} / ${num(nuniq(B, M.i))}`, d: `${st.a} / ${st.b}` },
    { k: 'הזמנות', v: `${num(nuniq(A, M.p))} / ${num(nuniq(B, M.p))}`, d: `${st.a} / ${st.b}` }
  ]);
  if (partial && !st.align) {
    note(head, `שנה ${cut.y} חלקית ומסתיימת ב-${dstr(cut.to)}. בלי חיתוך הוגן המספרים כאן משווים מספר חודשים `
      + 'שונה, וההפרש אינו מגמה אלא ארטיפקט של הקובץ.', 'warn');
  }

  /* ---------- מחיר מול כמות ---------- */
  const wa = wapMap(A), wb = wapMap(B);
  let priceEff = 0, qtyEff = 0, covered = 0, common = 0;
  for (const [it, a] of wa) {
    const b = wb.get(it);
    if (!b || !(a.q > 0) || !(b.q > 0)) continue;
    if (!MEASURABLE.has(UNIT(M.itemUnit[it])) || M.itemCatchAll[it]) continue;
    const pA = a.a / a.q, pB = b.a / b.q;
    priceEff += a.q * (pA - pB);
    qtyEff += (a.q - b.q) * pB;
    covered += a.a; common++;
  }
  const dec = panel(root, 'למה ההוצאה השתנתה',
    'הפירוק נעשה רק על מק״טים ביחידת מידה מדידה שנקנו בשתי השנים — שם אפשר להפריד מחיר מכמות');
  tiles(dec, [
    { k: 'אפקט המחיר', v: moneyC(priceEff), d: priceEff >= 0 ? 'שילמנו יותר על אותה כמות' : 'שילמנו פחות על אותה כמות', lead: true },
    { k: 'אפקט הכמות', v: moneyC(qtyEff), d: qtyEff >= 0 ? 'קנינו יותר' : 'קנינו פחות' },
    { k: 'מק״טים בפירוק', v: num(common), d: `מכסים ${totA ? (covered / totA * 100).toFixed(0) : 0}% מהרכש ב-${st.a}` },
    { k: 'כל השאר', v: moneyC(totA - totB - priceEff - qtyEff), d: 'פריטים חדשים, פריטים שהופסקו ויחידות לא מדידות' }
  ]);
  if (!common) note(dec, 'אין מק״טים מדידים שנקנו בשתי השנים, ולכן אי אפשר להפריד מחיר מכמות בתקופה הזו.', 'warn');

  /* ---------- מגמה חודשית של שתי השנים ---------- */
  const mp = panel(root, 'חודש מול חודש', 'אותם חודשים בשתי השנים, זה על גבי זה');
  const mA = sumBy(A, M.ym, M.a), mB = sumBy(B, M.ym, M.a);
  const mons = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  const val = (m, y, src) => src.get(y * 12 + m) ?? null;
  lines(mp, mons, [
    { name: String(st.a), data: mons.map((_, m) => val(m, st.a, mA)), area: true },
    { name: String(st.b), data: mons.map((_, m) => val(m, st.b, mB)), dash: true }
  ], { height: '300px' });

  /* ---------- קטגוריות ---------- */
  const cmp = (host, title, keyArr, names) => {
    const a = sumBy(A, keyArr, M.a), b = sumBy(B, keyArr, M.a);
    const rows = [...new Set([...a.keys(), ...b.keys()])].map(k => {
      const va = a.get(k) || 0, vb = b.get(k) || 0;
      return { k, name: names[k] || '—', va, vb, diff: va - vb, chg: vb ? (va / vb - 1) * 100 : null };
    }).sort((x, y) => y.va - x.va);
    const pn = panel(host, title, `${st.a} מול ${st.b}`);
    table(pn, [
      { k: 'name', t: 'שם', w: true },
      { k: 'va', t: String(st.a), n: true, f: v => moneyC(v) },
      { k: 'vb', t: String(st.b), n: true, f: v => moneyC(v) },
      { k: 'diff', t: 'הפרש', n: true, f: v => moneyC(v) },
      { k: 'chg', t: 'שינוי', n: true, f: v => trend(v) }
    ], rows, { all: rows.length <= 14, size: 14, name: title, sort: 1 });
  };
  const g2 = EL('div', { class: 'grid2' });
  root.appendChild(g2);
  cmp(g2, 'לפי סוג הזמנת רכש', M.pt, M.dims.potype);
  cmp(g2, 'לפי סוג ספק', M.styp, M.dims.styp);

  /* ---------- מי עלה ומי ירד ---------- */
  const movers = (host, title, keyArr, label, open, sub) => {
    const a = sumBy(A, keyArr, M.a), b = sumBy(B, keyArr, M.a);
    const rows = [...new Set([...a.keys(), ...b.keys()])].map(k => {
      const va = a.get(k) || 0, vb = b.get(k) || 0;
      return { k, name: label(k), sub: sub ? sub(k) : '', va, vb, diff: va - vb, chg: vb ? (va / vb - 1) * 100 : null };
    });
    const cols = [
      { k: 'name', t: 'שם', w: true, f: (v, r) => `${esc(v)}${r.sub ? `<span class="sub">${esc(r.sub)}</span>` : ''}` },
      { k: 'vb', t: String(st.b), n: true, f: v => moneyC(v) },
      { k: 'va', t: String(st.a), n: true, f: v => moneyC(v) },
      { k: 'diff', t: 'הפרש', n: true, f: v => moneyC(v) },
      { k: 'chg', t: 'שינוי', n: true, f: v => trend(v) }
    ];
    const up = rows.filter(r => r.diff > 0).sort((x, y) => y.diff - x.diff).slice(0, 12);
    const dn = rows.filter(r => r.diff < 0).sort((x, y) => x.diff - y.diff).slice(0, 12);
    const pu = panel(host, `${title} — הגידול הגדול ביותר`, 'הסכומים שגדלו הכי הרבה בשקלים');
    table(pu, cols, up, { all: true, name: title + ' עלייה', sort: 3, onRow: r => open(r.k) });
    const pd = panel(host, `${title} — הירידה הגדולה ביותר`, 'כאן כבר נחסך כסף, או שהפסקנו לקנות');
    table(pd, cols, dn, { all: true, name: title + ' ירידה', sort: 3, asc: true, onRow: r => open(r.k) });
  };
  const g3 = EL('div', { class: 'grid2' });
  root.appendChild(g3);
  movers(g3, 'ספקים', M.s, s => SUPN(s), supplierCard);
  const g4 = EL('div', { class: 'grid2' });
  root.appendChild(g4);
  movers(g4, 'מק״טים', M.i, it => IDESC(it) || ITEM(it), itemCard, it => ITEM(it));
}
