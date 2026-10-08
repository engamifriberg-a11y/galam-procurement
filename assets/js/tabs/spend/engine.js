// מנוע הניתוח של SPEND. כל החישובים יושבים כאן, בנפרד מהתצוגה, כדי
// שאפשר יהיה להריץ אותם מול הקובץ האמיתי ולהשוות לחישוב עצמאי — וכדי
// שכל מסך ישאב מאותם מספרים בדיוק.
//
// ראייה רוחבית: הפונקציות כאן מסכמות את כל תיק הרכש, ולא בודקות פריט
// בודד. פריט בודד נפתח בכרטיס, ורק כשלוחצים עליו.
import {
  M, sum, nuniq, sumBy, idxWhere, itemAgg, supAgg, wapMap,
  ITEM, IDESC, UNIT, SUPN, SUPID, MEASURABLE
} from './model.js';

/* ---------- ריכוזיות ---------- */
// HHI הוא מדד הריכוזיות המקובל בעולם הרכש וברגולציה: סכום ריבועי
// הנתחים כפול 10,000. מתחת ל-1500 שוק מפוזר, מעל 2500 שוק מרוכז.
export function concentration(values) {
  const tot = values.reduce((a, b) => a + b, 0);
  if (!tot) return { hhi: 0, top1: 0, top5: 0, top10: 0, n80: 0, n: values.length, tot: 0 };
  const sorted = values.slice().sort((a, b) => b - a);
  let hhi = 0;
  for (const v of sorted) { const s = v / tot; hhi += s * s; }
  const share = n => sorted.slice(0, n).reduce((a, b) => a + b, 0) / tot * 100;
  let run = 0, n80 = 0;
  for (const v of sorted) { run += v; n80++; if (run >= tot * 0.8) break; }
  return { hhi: Math.round(hhi * 10000), top1: share(1), top5: share(5), top10: share(10), n80, n: sorted.length, tot };
}

export const hhiLabel = h => h >= 2500 ? 'מרוכז מאוד' : h >= 1500 ? 'ריכוזיות בינונית' : 'מפוזר';

/* ---------- פער מחירים בתוך אותו חודש ----------
   ההחלטה המרכזית במנוע. סוכר סלק ירד ב-2025 מ-2,668 ₪ לטון בינואר
   ל-1,839 ₪ בדצמבר; השוואת כל השנה למחיר הנמוך הייתה מייצרת "חיסכון"
   של מיליונים שאינו קיים — זו תנועת שוק, לא כישלון רכש. פער בין שתי
   רכישות של אותו חודש, לעומת זאת, הוא שאלה אמיתית לספק. */
const SIGNIFICANT = 0.05;

function monthGap(rows) {
  const byMonth = new Map();
  for (const r of rows) {
    if (!byMonth.has(r.ym)) byMonth.set(r.ym, []);
    byMonth.get(r.ym).push(r);
  }
  let saving = 0, gap = 0, months = 0, worst = null;
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
    saving += s; months++;
    gap = Math.max(gap, wapm / lo.p - 1);
    if (!worst || s > worst.saving) worst = { ym, saving: s, paid: wapm, best: lo.p, sup: lo.s, d: lo.d };
  }
  return { saving, gap: gap * 100, months, worst };
}

/* ---------- תיק המק"טים ---------- */
export function itemStats(idx, prevIdx) {
  const agg = itemAgg(idx);
  const wCur = wapMap(idx);
  const wPrv = prevIdx ? wapMap(prevIdx) : null;
  const sPrv = prevIdx ? sumBy(prevIdx, M.i, M.a) : null;
  const tot = sum(idx, M.a);

  // שורות המחיר לכל מק"ט, ביחידת המידה העיקרית בלבד
  const lines = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j], it = M.i[k];
    if (M.u[k] !== M.itemUnit[it] || !(M.q[k] > 0) || !(M.ilsU[k] > 0)) continue;
    if (!lines.has(it)) lines.set(it, []);
    lines.get(it).push({ p: M.ilsU[k], q: M.q[k], a: M.a[k], s: M.s[k], d: M.d[k], ym: M.ym[k] });
  }

  const rows = [];
  for (const [it, o] of agg) {
    const unit = UNIT(M.itemUnit[it]);
    const meas = MEASURABLE.has(unit) && !M.itemCatchAll[it];
    const wc = wCur.get(it), wp = wPrv ? wPrv.get(it) : null;
    const wap = wc && wc.q > 0 ? wc.a / wc.q : null;
    const wapPrev = wp && wp.q > 0 ? wp.a / wp.q : null;
    const L = lines.get(it) || [];

    // תנודתיות: סטיית התקן של מחיר החודש ביחס לממוצע, ב-4 חודשים ומעלה
    let vol = null, drift = null, months = 0;
    if (meas && L.length > 2) {
      const byM = new Map();
      for (const r of L) {
        const o2 = byM.get(r.ym) || { q: 0, a: 0 };
        o2.q += r.q; o2.a += r.a; byM.set(r.ym, o2);
      }
      const ks = [...byM.keys()].sort((a, b) => a - b);
      const ps = ks.map(k => byM.get(k).a / byM.get(k).q).filter(x => x > 0);
      months = ps.length;
      if (ps.length >= 4) {
        const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
        const varc = ps.reduce((a, b) => a + (b - mean) ** 2, 0) / ps.length;
        vol = mean > 0 ? Math.sqrt(varc) / mean * 100 : null;
      }
      if (ps.length >= 2) drift = (ps[ps.length - 1] / ps[0] - 1) * 100;
    }

    const g = meas && L.length > 1 ? monthGap(L) : { saving: 0, gap: 0, months: 0, worst: null };
    const was = sPrv ? (sPrv.get(it) || 0) : null;

    rows.push({
      it, item: ITEM(it), desc: IDESC(it), unit, meas,
      spend: o.spend, share: tot ? o.spend / tot * 100 : 0,
      qty: wc ? wc.q : o.qty, wap,
      dspend: was ? (o.spend / was - 1) * 100 : null, was,
      dprice: (meas && wap && wapPrev) ? (wap / wapPrev - 1) * 100 : null,
      vol, drift, priceMonths: months,
      gap: g.months ? g.gap : null, gapSaving: g.saving, gapWorst: g.worst,
      sups: o.sups, pos: o.pos, last: o.last
    });
  }
  rows.sort((a, b) => b.spend - a.spend);

  // סיווג ABC על התקופה הנבחרת, לא על כל ההיסטוריה
  let run = 0;
  for (const r of rows) {
    run += r.spend;
    r.cum = tot ? run / tot * 100 : 0;
    r.abc = r.cum <= 80 ? 'A' : r.cum <= 95 ? 'B' : 'C';
  }
  return rows;
}

/* ---------- תיק הספקים ---------- */
export function supplierStats(idx, prevIdx) {
  const agg = supAgg(idx);
  const prv = prevIdx ? sumBy(prevIdx, M.s, M.a) : null;
  const tot = sum(idx, M.a);
  const rows = [...agg.entries()].map(([s, o]) => {
    const was = prv ? (prv.get(s) || 0) : null;
    return {
      s, sup: SUPN(s), sid: SUPID(s), styp: M.dims.styp[M.supStyp[s]] || 'ללא סיווג',
      spend: o.spend, was, chg: was ? (o.spend / was - 1) * 100 : null,
      share: tot ? o.spend / tot * 100 : 0,
      pos: o.pos, items: o.items, open: o.open, last: o.last, first: o.first
    };
  }).sort((a, b) => b.spend - a.spend);
  let run = 0;
  for (const r of rows) { run += r.spend; r.cum = tot ? run / tot * 100 : 0; }
  return rows;
}

/* ---------- פילוח לפי קטגוריה ----------
   שני עדשות: סוג הזמנת הרכש וסוג הספק. בקובץ של גלעם סוג הספק מסווג
   61% מהכסף כ"אחרים" ולכן אינו מספיק להחלטה, בעוד סוג ההזמנה מפריד
   נקי: תירס וסוכר 50%, תפעול 16%. ברירת המחדל היא לכן סוג ההזמנה. */
export const LENS = {
  ptyp: { key: 'pt', he: 'סוג הזמנת רכש', names: () => M.dims.potype },
  styp: { key: 'styp', he: 'סוג ספק', names: () => M.dims.styp }
};
const VAGUE = new Set(['אחרים', 'ללא סיווג', '(ללא סוג)', 'דגל', '']);

export function typeStats(idx, prevIdx, lens = 'ptyp') {
  const L = LENS[lens] || LENS.ptyp;
  const arr = M[L.key], names = L.names();
  const cur = sumBy(idx, arr, M.a);
  const prv = prevIdx ? sumBy(prevIdx, arr, M.a) : null;
  const tot = sum(idx, M.a);
  return [...cur.entries()].map(([k, v]) => {
    const ix = idxWhere(r => arr[r] === k, idx);
    const sups = [...sumBy(ix, M.s, M.a).values()];
    const was = prv ? (prv.get(k) || 0) : null;
    const name = names[k] || 'ללא סיווג';
    return {
      k, lens, name, vague: VAGUE.has(name), spend: v, was,
      chg: was ? (v / was - 1) * 100 : null,
      share: tot ? v / tot * 100 : 0,
      sups: sups.length, items: nuniq(ix, M.i), pos: nuniq(ix, M.p),
      conc: concentration(sups)
    };
  }).sort((a, b) => b.spend - a.spend);
}

/* כמה מהכסף נופל לסיווג שאינו אומר כלום */
export const vagueShare = rows => rows.filter(r => r.vague).reduce((a, b) => a + b.share, 0);

/* ---------- מנוע ההמלצות ----------
   כל המלצה נשענת על מספרים שחושבו מהקובץ, ואומרת במפורש על מה היא
   נשענת. היכן שהערך תלוי בהנחה — ההנחה כתובה, ולא מוצגת כעובדה. */
export function recommendations(items, sups, types, tot, stypes = []) {
  const out = [];
  const push = r => out.push({ ...r, id: `${r.kind}:${r.key}` });

  /* 1. חריגות מחיר — פער בין רכישות של אותו חודש */
  for (const r of items.filter(x => x.gapSaving > 5000).sort((a, b) => b.gapSaving - a.gapSaving).slice(0, 12)) {
    push({
      kind: 'gap', key: r.item, title: `בדיקת פער מחיר: ${r.desc || r.item}`,
      action: 'לברר מול הספקים למה באותו חודש שולמו שני מחירים על אותו פריט',
      value: r.gapSaving, valueKind: 'מחושב',
      facts: [
        `הוצאה בתקופה ${fmt(r.spend)}`,
        `פער של ${r.gap.toFixed(0)}% בין מחירים ששולמו באותו חודש`,
        r.gapWorst ? `החודש הבולט: שולם ${r.gapWorst.paid.toFixed(2)} מול ${r.gapWorst.best.toFixed(2)} אצל ${SUPN(r.gapWorst.sup)}` : '',
        `${r.sups} ספקים · ${r.pos} הזמנות`
      ].filter(Boolean),
      caveat: 'הפער יכול לנבוע מתנאי אספקה, מקור או מועד הזמנה — זו שאלה לבירור, לא חיסכון מובטח.',
      prio: Math.min(100, 40 + r.gapSaving / 20000 + (r.gap || 0))
    });
  }

  /* 2. מכרז על מק"ט מרכזי — כסף גדול, מעט ספקים, מחיר שלא יורד */
  for (const r of items.filter(x => x.abc === 'A' && x.sups <= 2 && x.share >= 0.5 && (x.drift == null || x.drift > -3))
    .sort((a, b) => b.spend - a.spend).slice(0, 10)) {
    push({
      kind: 'tender', key: r.item, title: `מועמד למכרז: ${r.desc || r.item}`,
      action: r.sups === 1 ? 'לאתר ספק חלופי ולצאת להצעות מחיר' : 'להרחיב את מעגל המציעים לפני החידוש',
      value: r.spend * 0.01, valueKind: 'כל 1% הנחה',
      facts: [
        `הוצאה בתקופה ${fmt(r.spend)} — ${r.share.toFixed(1)}% מסך הרכש`,
        `${r.sups === 1 ? 'ספק יחיד' : r.sups + ' ספקים בלבד'}`,
        r.meas && r.qty ? `כמות ${Math.round(r.qty).toLocaleString('he-IL')} ${r.unit}` : '',
        r.drift != null ? `מחיר ${r.drift >= 0 ? 'עלה' : 'ירד'} ${Math.abs(r.drift).toFixed(0)}% לאורך התקופה` : ''
      ].filter(Boolean),
      caveat: 'הערך הוא אריתמטיקה על ההוצאה: כל אחוז הנחה שווה את הסכום הזה. הוא אינו תחזית.',
      prio: Math.min(100, 30 + r.share * 6 + (r.sups === 1 ? 12 : 0))
    });
  }

  /* 3. מו"מ מול הספקים הגדולים */
  for (const r of sups.filter(x => x.share >= 2).slice(0, 10)) {
    push({
      kind: 'negotiate', key: r.sid, title: `מו״מ שנתי: ${r.sup}`,
      action: r.chg != null && r.chg > 10
        ? 'המחזור גדל השנה — זו העילה לבקש מדרגת הנחה חדשה'
        : 'לרכז את כל הפריטים מול הספק לשיחה אחת במקום מו״מ פר הזמנה',
      value: r.spend * 0.01, valueKind: 'כל 1% הנחה',
      facts: [
        `מחזור ${fmt(r.spend)} — ${r.share.toFixed(1)}% מסך הרכש`,
        `${r.pos} הזמנות · ${r.items} מק״טים`,
        r.chg != null ? `${r.chg >= 0 ? 'גדל' : 'קטן'} ${Math.abs(r.chg).toFixed(0)}% מול התקופה המקבילה` : '',
        `סוג ספק: ${r.styp}`
      ].filter(Boolean),
      caveat: 'הערך הוא אריתמטיקה על המחזור ולא הבטחה. ההנחה בפועל תלויה בשוק ובחלופות.',
      prio: Math.min(100, 25 + r.share * 4 + Math.max(0, (r.chg || 0) / 4))
    });
  }

  /* 4. איחוד ספקים בקטגוריה מפוזרת. קטגוריית סל כמו "אחרים" אינה
        קטגוריה אמיתית, ואיחוד ספקים בתוכה חסר משמעות. */
  for (const t of types.filter(x => !x.vague && x.sups >= 8 && x.spend >= tot * 0.01)) {
    const tail = 100 - t.conc.top5;
    if (tail < 25) continue;
    push({
      kind: 'consolidate', key: t.name, title: `איחוד ספקים: ${t.name}`,
      action: `${t.sups} ספקים בקטגוריה אחת. לאחד את הזנב לשניים-שלושה ספקי מסגרת`,
      value: t.spend * (tail / 100) * 0.03, valueKind: 'הנחת ריכוז 3% על הזנב',
      facts: [
        `${fmt(t.spend)} בקטגוריה — ${t.share.toFixed(1)}% מסך הרכש`,
        `${t.sups} ספקים · ${t.pos} הזמנות · ${t.items} מק״טים`,
        `חמשת הגדולים מחזיקים ${t.conc.top5.toFixed(0)}%, והשאר ${tail.toFixed(0)}% מפוזרים`,
        `מדד ריכוזיות ${t.conc.hhi} — ${hhiLabel(t.conc.hhi)}`
      ],
      caveat: 'שלושה אחוזים הם יעד מקובל לאיחוד נפח, לא מדידה. החיסכון התפעולי בהזמנות מצטרף אליו.',
      prio: Math.min(100, 20 + t.share * 3 + tail / 4)
    });
  }

  /* 5. ריכוז יתר — תלות בספק בודד */
  for (const r of sups.filter(x => x.share >= 8).slice(0, 6)) {
    push({
      kind: 'risk', key: 'c' + r.sid, title: `תלות בספק: ${r.sup}`,
      action: 'לבנות ספק חלופי מאושר לפני החידוש הבא, כדי שלא יהיה מו״מ בלי חלופה',
      value: null, valueKind: 'סיכון',
      facts: [
        `${r.share.toFixed(1)}% מסך הרכש מרוכז בספק אחד`,
        `מחזור ${fmt(r.spend)} · ${r.items} מק״טים`,
        'הפסקת אספקה או שינוי מחיר חד-צדדי משפיעים ישירות על הייצור'
      ],
      caveat: '',
      prio: Math.min(100, 30 + r.share * 2.5)
    });
  }

  /* 6. סיווג שלא עוזר להחליט. כשחלק גדול מהכסף יושב ב"אחרים", אי אפשר
        לנהל תיק רכש לפי קטגוריות — וזו עבודה של שעה במערכת, לא פרויקט. */
  {
    const vague = (stypes.length ? stypes : types).filter(t => t.vague).reduce((a, b) => a + b.spend, 0);
    if (tot && vague / tot >= 0.2) {
      const t = (stypes.length ? stypes : types).find(x => x.vague);
      push({
        kind: 'quality', key: 'vague', title: 'הסיווג לא מאפשר לנהל את התיק',
        action: `למפות מחדש את סוג הספק של ${t ? t.name : 'הקטגוריה הכללית'} לקטגוריות אמיתיות`,
        value: null, valueKind: 'איכות נתונים',
        facts: [
          `${fmt(vague)} — ${(vague / tot * 100).toFixed(0)}% מההוצאה — מסווגים כ"אחרים" או בלי סיווג`,
          'כל ניתוח לפי קטגוריה, כל יעד חיסכון וכל השוואה בין פעילויות מתעוותים בגלל זה',
          'הפילוח לפי סוג הזמנת רכש מפריד טוב יותר, והוא ברירת המחדל במסכים'
        ],
        caveat: '',
        prio: 55
      });
    }
  }

  /* 7. מק"ט תנודתי — כסף גדול ומחיר שקופץ */
  for (const r of items.filter(x => x.vol != null && x.vol >= 8 && x.spend >= tot * 0.003)
    .sort((a, b) => b.spend * b.vol - a.spend * a.vol).slice(0, 8)) {
    push({
      kind: 'volatile', key: 'v' + r.item, title: `מחיר תנודתי: ${r.desc || r.item}`,
      action: 'לשקול הסכם מסגרת עם מנגנון מחיר, או עיתוי רכש מול המגמה',
      value: null, valueKind: 'עיתוי',
      facts: [
        `הוצאה ${fmt(r.spend)} · ${r.priceMonths} חודשי רכש`,
        `תנודתיות מחיר ${r.vol.toFixed(0)}% סביב הממוצע`,
        r.drift != null ? `מגמה בתקופה ${r.drift >= 0 ? '+' : ''}${r.drift.toFixed(0)}%` : '',
        `${r.sups} ספקים`
      ].filter(Boolean),
      caveat: 'תנודתיות אינה בהכרח בעיה — בחומרי גלם היא לרוב השוק. היא כן קובעת מתי ואיך לסגור מחיר.',
      prio: Math.min(100, 20 + r.vol + r.share * 2)
    });
  }

  return out.sort((a, b) => b.prio - a.prio);
}

const fmt = v => '₪' + Math.round(v).toLocaleString('he-IL');

/* ---------- תובנות הכותרת של הדשבורד ---------- */
export function headlines(items, sups, types, tot, conc) {
  const out = [];
  const topItems = items.slice(0, 10).reduce((a, b) => a + b.spend, 0);
  const a = items.filter(r => r.abc === 'A').length;
  out.push(`${a} מק״טים מתוך ${items.length} מחזיקים 80% מהתקציב. עשרת הגדולים לבדם ${(topItems / tot * 100).toFixed(0)}%.`);
  out.push(`${conc.n80} ספקים מתוך ${conc.n} מחזיקים 80% מההוצאה. מדד הריכוזיות ${conc.hhi} — ${hhiLabel(conc.hhi)}.`);
  if (sups[0]) out.push(`הספק הגדול, ${sups[0].sup}, מרכז ${sups[0].share.toFixed(1)}% מסך הרכש.`);
  const gap = items.reduce((s, r) => s + r.gapSaving, 0);
  if (gap > 0) out.push(`${fmt(gap)} פערי מחיר בין רכישות של אותו חודש — הסכום שעליו אפשר לשאול כבר מחר.`);
  const single = items.filter(r => r.sups === 1 && r.share >= 0.5);
  if (single.length) out.push(`${single.length} מק״טים מרכזיים מסופקים מספק יחיד — ${fmt(single.reduce((s, r) => s + r.spend, 0))} בלי חלופה.`);
  const real = types.find(t => !t.vague);
  if (real) out.push(`הפעילות הגדולה היא ${real.name} עם ${real.share.toFixed(0)}% מההוצאה.`);
  return out;
}
