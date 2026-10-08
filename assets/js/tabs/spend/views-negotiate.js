// מסך — יעדי משא ומתן.
//
// השאלה של עמי במילים שלו: "מה המק״טים הכי יקרים ונצרכים שלי כדי שאנהל
// עבורם מו״מ". תשובה לשאלה הזו היא לא רשימת הפריטים היקרים — היקר ביותר
// יכול להיות פריט שנקנה פעם אחת במחיר שוק. יעד טוב הוא פריט שיש בו גם
// כסף, גם חזרתיות, וגם סימן שאפשר לשלם עליו פחות.
//
// הציון כאן מורכב מארבעה דברים גלויים, וכל שורה אומרת למה היא ברשימה.
import { esc } from '../../core/base.js';
import {
  M, money, moneyC, num, price, pct, dstr, sum, sumBy, topMap, nuniq,
  ITEM, IDESC, UNIT, SUPN, MEASURABLE, itemAgg, wapMap
} from './model.js';
import { EL, panel, tiles, table, barCell, trend, note } from './ui.js';
import { pair, pairNote, monLabel } from './period.js';
import { itemCard } from './cards.js';
import { pieAndBars } from './viz.js';

/* מחיר ששולם בעסקה בעלת משקל. עסקה זעירה במחיר חריג הייתה מייצרת
   "חיסכון" שאין לו כיסוי במציאות. */
const SIGNIFICANT = 0.05;

/* הפער נמדד בתוך אותו חודש בלבד, וזו ההחלטה המרכזית במסך הזה.
   סוכר סלק ירד ב-2025 מ-2,668 ₪ לטון בינואר ל-1,839 ₪ בדצמבר. השוואה של
   כל השנה למחיר הנמוך ביותר הייתה מייצרת "חיסכון" של כ-10 מיליון ₪ שאינו
   קיים — זו תנועת שוק, לא כישלון רכש. לעומת זאת ב-2 בינואר נקנה אותו
   סוכר מספק אחד ב-2,668 ומספק אחר ב-2,315 באותו יום, וזה פער אמיתי
   שאפשר לשאול עליו. לכן נספר רק פער בין רכישות של אותו חודש. */
function sameMonthGap(it, rows) {
  const byMonth = new Map();
  for (const r of rows) {
    if (!byMonth.has(r.ym)) byMonth.set(r.ym, []);
    byMonth.get(r.ym).push(r);
  }
  let saving = 0, base = 0, gap = 0, months = 0, worst = null;
  for (const [ym, L] of byMonth) {
    if (L.length < 2) continue;
    const qm = L.reduce((a, b) => a + b.q, 0);
    const am = L.reduce((a, b) => a + b.a, 0);
    if (!(qm > 0) || !(am > 0)) continue;
    const big = L.filter(x => x.q >= qm * SIGNIFICANT);
    if (big.length < 2) continue;
    const lo = big.reduce((a, b) => b.p < a.p ? b : a);
    const wapm = am / qm;
    if (!(lo.p > 0) || wapm <= lo.p) continue;
    const s = qm * (wapm - lo.p);
    saving += s;
    base += am;
    gap = Math.max(gap, wapm / lo.p - 1);
    months++;
    // החודש שתורם הכי הרבה לפער — הוא זה שמוצג בשורה, כדי שהמספרים
    // שמוצגים זה לצד זה יהיו מאותו חודש ולא ממוצע שנתי מול מחיר נקודתי
    if (!worst || s > worst.saving) worst = { ym, saving: s, paid: wapm, best: lo.p, sup: lo.s, d: lo.d, qty: qm };
  }
  return { saving, base, gap: gap * 100, months, worst };
}

export function targets(idx, prevIdx) {
  const agg = itemAgg(idx);
  const wCur = wapMap(idx);
  const wPrv = prevIdx ? wapMap(prevIdx) : null;
  const tot = sum(idx, M.a);

  // שורות המחיר של כל מק״ט, ביחידת המידה העיקרית בלבד
  const lines = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j], it = M.i[k];
    if (M.u[k] !== M.itemUnit[it] || !(M.q[k] > 0) || !(M.ilsU[k] > 0)) continue;
    if (!lines.has(it)) lines.set(it, []);
    lines.get(it).push({ p: M.ilsU[k], q: M.q[k], a: M.a[k], s: M.s[k], d: M.d[k], ym: M.ym[k] });
  }

  const out = [];
  for (const [it, o] of agg) {
    const unit = UNIT(M.itemUnit[it]);
    const meas = MEASURABLE.has(unit) && !M.itemCatchAll[it];
    const wc = wCur.get(it), wp = wPrv ? wPrv.get(it) : null;
    const wap = wc && wc.q > 0 ? wc.a / wc.q : null;
    const wapPrev = wp && wp.q > 0 ? wp.a / wp.q : null;
    // שינוי מחיר הוא מספר בעל משמעות רק ביחידה מדידה
    const dprice = (meas && wap && wapPrev) ? (wap / wapPrev - 1) * 100 : null;

    const L = lines.get(it) || [];
    const g = meas && L.length > 1 ? sameMonthGap(it, L) : { saving: 0, base: 0, gap: 0, best: null, months: 0 };

    // מגמת המחיר בתוך התקופה: החודש הראשון מול האחרון. הקשר שוק, לא חיסכון.
    let drift = null;
    if (meas && L.length > 2) {
      const byM = new Map();
      for (const r of L) {
        const o2 = byM.get(r.ym) || { q: 0, a: 0 };
        o2.q += r.q; o2.a += r.a; byM.set(r.ym, o2);
      }
      const ks = [...byM.keys()].sort((a, b) => a - b);
      if (ks.length >= 2) {
        const f = byM.get(ks[0]), l = byM.get(ks[ks.length - 1]);
        if (f.q > 0 && l.q > 0) drift = ((l.a / l.q) / (f.a / f.q) - 1) * 100;
      }
    }

    // ציון גלוי: כסף, חזרתיות, פער באותו חודש, והתייקרות מול אשתקד
    const sMoney = tot ? Math.min(1, Math.log10(1 + o.spend / tot * 100) / 1.3) : 0;
    const sRepeat = Math.min(1, Math.log10(1 + o.pos) / 1.5);
    const sGap = Math.min(1, g.gap / 15);
    const sRise = dprice == null ? 0 : Math.min(1, Math.max(0, dprice) / 15);
    const score = Math.round((sMoney * 0.5 + sRepeat * 0.2 + sGap * 0.2 + sRise * 0.1) * 100);

    const why = [];
    if (o.spend >= tot * 0.01) why.push('מעל 1% מסך הרכש');
    if (g.gap >= 5) why.push(`פער ${g.gap.toFixed(0)}% בין מחירים ששולמו באותו חודש`);
    if (dprice != null && dprice >= 5) why.push(`המחיר עלה ${dprice.toFixed(0)}% מול התקופה המקבילה`);
    if (o.pos >= 12) why.push(`${o.pos} הזמנות בתקופה — מועמד להסכם מסגרת`);
    if (o.sups === 1 && o.spend >= tot * 0.005) why.push('ספק יחיד — כדאי לבחון חלופה לפני המו״מ');
    if (o.sups > 2) why.push(`${o.sups} ספקים מספקים אותו — יש מול מי להשוות`);

    out.push({
      it, item: ITEM(it), desc: IDESC(it), unit, meas,
      spend: o.spend, share: tot ? o.spend / tot * 100 : 0,
      qty: wc ? wc.q : o.qty, wap,
      paidMo: g.worst ? g.worst.paid : null,
      best: g.worst ? g.worst.best : null, bestSup: g.worst ? g.worst.sup : null, bestD: g.worst ? g.worst.d : -1,
      worstMo: g.worst ? g.worst.ym : null,
      spread: g.months ? g.gap : null, saving: g.saving, gapMonths: g.months,
      dprice, drift, sups: o.sups, pos: o.pos, last: o.last, score,
      why: why.join(' · ') || 'היקף כספי בלבד'
    });
  }
  return out.sort((a, b) => b.score - a.score || b.spend - a.spend);
}

export function viewNegotiate(root, idx, ctx) {
  const p = pair();
  const rows = targets(idx, p.prev);
  const tot = sum(idx, M.a);
  const save = rows.reduce((a, b) => a + b.saving, 0);
  const withSave = rows.filter(r => r.saving > 1000).length;
  const top30 = rows.slice(0, 30);

  const head = panel(root, 'יעדי משא ומתן', pairNote(p));
  tiles(head, [
    { k: 'פער מחירים באותו חודש', v: moneyC(save), d: 'מה שנחסך אם כל רכישות אותו חודש היו במחיר הטוב באותו חודש', lead: true },
    { k: 'מק״טים עם פער', v: num(withSave), d: 'אותו פריט, אותו חודש, שני מחירים' },
    { k: 'סך הרכש בתקופה', v: moneyC(tot), d: money(tot) },
    { k: 'היעד הראשון', v: top30[0] ? moneyC(top30[0].spend) : '—', d: top30[0] ? (top30[0].desc || top30[0].item) : '' },
    { k: '30 היעדים', v: tot ? (top30.reduce((a, b) => a + b.spend, 0) / tot * 100).toFixed(0) + '%' : '—', d: 'מסך הרכש — שם שווה להשקיע זמן' },
    { k: 'הזמנות', v: num(nuniq(idx, M.p)), d: `${num(rows.length)} מק״טים` }
  ]);
  note(head, 'הפער נמדד רק בין רכישות של אותו חודש, וזו החלטה מכוונת. סוכר סלק ירד ב-2025 מ-2,668 ₪ לטון בינואר '
    + 'ל-1,839 ₪ בדצמבר — השוואה של כל השנה למחיר הנמוך הייתה מייצרת "חיסכון" של כ-10 מיליון ₪ שאינו קיים, כי זו '
    + 'תנועת שוק ולא כישלון רכש. פער בתוך אותו חודש, לעומת זאת, הוא שאלה אמיתית לספק. גם אותו צריך לבדוק: '
    + 'הוא יכול לנבוע מתנאי אספקה, מקור או מועד הזמנה. מחושב רק ביחידות מדידות ורק מעסקאות של לפחות 5% מהכמות.');

  /* ---------- היקרים והנצרכים ---------- */
  pieAndBars(root, {
    title: 'המק״טים היקרים ביותר', sub: 'לפי סך ההוצאה בתקופה. לחיצה פותחת כרטיס מק״ט',
    barTitle: '12 היקרים ביותר', barSub: 'כאן יושב הכסף',
    map: sumBy(idx, M.i, M.a), nameOf: it => (IDESC(it) || ITEM(it)).slice(0, 40) + ' · ' + ITEM(it),
    onPick: it => itemCard(it)
  });

  const measRows = rows.filter(r => r.meas && r.qty > 0);
  if (measRows.length) {
    const byQty = panel(root, 'המק״טים הנצרכים ביותר', 'לפי כמות שנרכשה, ביחידות מדידות בלבד — טון, ק״ג, ליטר, מטר. '
      + 'פריט שנצרך בכמות גדולה הוא המועמד הטבעי להסכם מסגרת ולהנחת כמות.');
    const topQ = measRows.slice().sort((a, b) => b.qty - a.qty).slice(0, 15);
    const maxQ = topQ[0]?.qty || 1;
    table(byQty, [
      { k: 'desc', t: 'מק״ט', w: true, f: (v, r) => `${esc(v || r.item)}<span class="sub">${esc(r.item)}</span>` },
      { k: 'qty', t: 'כמות', n: true, f: (v, r) => barCell(v, maxQ, x => num(x, x < 10 ? 2 : 0) + ' ' + r.unit) },
      { k: 'spend', t: 'הוצאה', n: true, f: v => moneyC(v) },
      { k: 'wap', t: 'מחיר ממוצע', n: true, f: v => v == null ? '—' : price(v) },
      { k: 'dprice', t: 'שינוי מחיר', n: true, f: v => trend(v) },
      { k: 'sups', t: 'ספקים', n: true }
    ], topQ, { all: true, name: 'הנצרכים ביותר', sort: 1, onRow: r => itemCard(r.it) });
  }

  /* ---------- רשימת היעדים ---------- */
  const body = panel(root, '30 יעדי המו״מ הראשונים',
    'הציון משקלל כסף (50%), חזרתיות (20%), פער מחירים באותו חודש (20%) והתייקרות מול אשתקד (10%). שורה פותחת כרטיס מק״ט מלא.');
  const maxS = top30[0]?.spend || 1;
  table(body, [
    { k: 'score', t: 'ציון', n: true, f: v => `<b>${v}</b>` },
    { k: 'desc', t: 'מק״ט', w: true, f: (v, r) => `${esc(v || r.item)}<span class="sub">${esc(r.item)} · ${esc(r.unit)}</span>` },
    { k: 'spend', t: 'הוצאה', n: true, f: v => barCell(v, maxS, moneyC) },
    { k: 'qty', t: 'כמות', n: true, f: (v, r) => r.meas ? num(v, v < 10 ? 2 : 0) : '—' },
    { k: 'wap', t: 'מחיר ממוצע', n: true, f: (v, r) => (v == null || !r.meas) ? '—' : price(v) },
    { k: 'best', t: 'באותו חודש: שילמנו / הטוב ביותר', n: true, f: (v, r) => v == null ? '—'
      : `${price(r.paidMo)} / <b>${price(v)}</b><span class="sub">${esc(monLabel(r.worstMo))} · ${esc(SUPN(r.bestSup))}</span>` },
    { k: 'spread', t: 'פער', n: true, f: v => v == null ? '—' : `<span class="${v >= 8 ? 'up' : 'flat'}">${v.toFixed(0)}%</span>` },
    { k: 'saving', t: 'פער בשקלים', n: true, f: v => v > 0 ? `<b>${moneyC(v)}</b>` : '—' },
    { k: 'dprice', t: 'מול אשתקד', n: true, f: v => trend(v) },
    { k: 'drift', t: 'מגמה בתקופה', n: true, f: v => v == null ? '—' : `<span class="${v > 2 ? 'up' : v < -2 ? 'down' : 'flat'}">${pct(v, 0)}</span>` },
    { k: 'sups', t: 'ספקים', n: true },
    { k: 'pos', t: 'הזמנות', n: true },
    { k: 'why', t: 'למה זה יעד', w: true }
  ], top30, { all: true, name: 'יעדי מו״מ', sort: 0, onRow: r => itemCard(r.it) });

  const more = rows.filter(r => r.saving > 1000).sort((a, b) => b.saving - a.saving).slice(0, 20);
  if (more.length) {
    const sp = panel(root, 'אותו פריט, אותו חודש, שני מחירים',
      'כאן לא צריך מו״מ חדש אלא שאלה: למה באותו חודש שילמנו שני מחירים על אותו מק״ט. '
      + 'לפני פנייה לספק כדאי לוודא שלא מדובר בתנאי אספקה או מקור שונים.');
    table(sp, [
      { k: 'desc', t: 'מק״ט', w: true, f: (v, r) => `${esc(v || r.item)}<span class="sub">${esc(r.item)}</span>` },
      { k: 'spend', t: 'הוצאה', n: true, f: v => moneyC(v) },
      { k: 'paidMo', t: 'שילמנו באותו חודש', n: true, f: (v, r) => `${price(v)}<span class="sub">${esc(monLabel(r.worstMo))}</span>` },
      { k: 'best', t: 'הטוב ביותר באותו חודש', n: true, f: (v, r) => `${price(v)}<span class="sub">${esc(SUPN(r.bestSup))} · ${esc(dstr(r.bestD))}</span>` },
      { k: 'spread', t: 'פער', n: true, f: v => v == null ? '—' : v.toFixed(0) + '%' },
      { k: 'gapMonths', t: 'חודשים עם פער', n: true },
      { k: 'saving', t: 'פער בשקלים', n: true, f: v => `<b>${moneyC(v)}</b>` },
      { k: 'sups', t: 'ספקים', n: true }
    ], more, { all: true, name: 'חיסכון מיידי', sort: 5, onRow: r => itemCard(r.it) });
  }
}
