// הניתוחים שמייצרים מסקנה ולא רק סכום: פערי מחיר, התייקרויות, התראות
// והזדמנויות חיסכון.
//
// הנקודה החשובה בקובץ הזה היא שער ההשוואה. חישוב נאיבי של פערי מחיר על כל
// המק"טים מפיק "פוטנציאל חיסכון" של מאות מיליונים, כי הוא משווה מחיר יחידה
// בקודים כמו "רכוש קבוע כללי פרוייקטים" או "אנרגיה-גז", שבהם הכמות היא 1
// והמחיר הוא פשוט סכום החשבונית. המספר הזה חסר ערך ומסוכן להציג אותו.
// לכן כל ניתוח מחיר כאן עובר דרך itemComparable ו-itemCatchAll.

import {
  M, F, IDX, idxWhere, scanWindow, priorYearIdx, curWindow, fkey, agg, sumBy, sum, nuniq,
  topMap, poAgg, openIdx, wapOf, wapMap, lastPrice, monthly, dstr, price, money, moneyC, num,
  SUPN, SUPID, ITEM, IDESC, UNIT, PTYP, STAT, CATN, MEASURABLE
} from './model.js';

/* ---------- פערי מחיר בין ספקים לאותו מק"ט ויחידה ---------- */
const _pgCache = new Map();
export function priceGaps(idx, opt = {}) {
  const ck = fkey() + '|' + idx.length + '|' + JSON.stringify(opt);
  if (_pgCache.has(ck)) return _pgCache.get(ck);
  const r = calcGaps(idx, opt);
  if (_pgCache.size > 24) _pgCache.clear();
  _pgCache.set(ck, r);
  return r;
}
export function clearAnalyticsCache() { _pgCache.clear(); }

function calcGaps(idx, opt = {}) {
  const minSup = opt.minSup || 2, minPo = opt.minPo || 2;
  const g = new Map();                       // מק"ט×יחידה → ספק → {כמות, סכום, הזמנות}
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j], it = M.i[k];
    if (!M.itemComparable[it] || M.itemCatchAll[it]) continue;
    if (!(M.q[k] > 0) || !(M.a[k] > 0)) continue;
    const key = it * 16 + M.u[k];
    let s = g.get(key);
    if (!s) { s = new Map(); g.set(key, s); }
    let o = s.get(M.s[k]);
    if (!o) { o = { q: 0, a: 0, pos: new Set(), last: -1 }; s.set(M.s[k], o); }
    o.q += M.q[k]; o.a += M.a[k]; o.pos.add(M.p[k]);
    if (M.d[k] > o.last) o.last = M.d[k];
  }
  const out = [];
  for (const [key, s] of g) {
    const it = Math.floor(key / 16), u = key % 16;
    const sups = [...s.entries()].map(([si, o]) => ({ si, wap: o.a / o.q, q: o.q, a: o.a, npo: o.pos.size, last: o.last }));
    // ספק ייחוס חייב כמה הזמנות, אחרת מחיר חד-פעמי נמוך הופך ל"יעד"
    const cred = sups.filter(x => x.npo >= minPo);
    if (cred.length < minSup) continue;
    const target = cred.reduce((m, x) => x.wap < m.wap ? x : m, cred[0]);
    let save = 0, gapMax = 0;
    const rows = [];
    for (const x of sups) {
      const gap = x.wap - target.wap;
      if (gap <= 0) continue;
      const sv = gap * x.q;
      if (sv <= 0) continue;
      save += sv; gapMax = Math.max(gapMax, gap / x.wap * 100);
      rows.push({ ...x, gap, sv, gapPct: gap / x.wap * 100 });
    }
    if (save <= 0) continue;
    const spend = sups.reduce((s2, x) => s2 + x.a, 0);
    const conf = (gapMax <= 40 && target.npo >= 3 && MEASURABLE.has(UNIT(u))) ? 'גבוהה'
      : (gapMax <= 60 && target.npo >= 2) ? 'בינונית' : 'נמוכה';
    out.push({ it, u, unit: UNIT(u), nsup: sups.length, ncred: cred.length, target, save, spend, rows, conf, gapPct: gapMax, measurable: MEASURABLE.has(UNIT(u)) });
  }
  out.sort((a, b) => b.save - a.save);
  return out;
}

/* ---------- שינוי מחיר בין שתי תקופות, עם הפרדת מחיר מכמות ---------- */
export function priceDelta(curIdx, prvIdx) {
  const out = [], A = wapMap(curIdx), B = wapMap(prvIdx);
  for (const [it, ca] of A) {
    if (M.itemCatchAll[it]) continue;
    const cb = B.get(it);
    if (!cb) continue;
    const a = { wap: ca.a / ca.q, qty: ca.q, amt: ca.a, unit: UNIT(M.itemUnit[it]) };
    const b = { wap: cb.a / cb.q, qty: cb.q, amt: cb.a };
    if (!(b.wap > 0)) continue;
    out.push({
      it, cur: a.wap, prv: b.wap, delta: (a.wap / b.wap - 1) * 100,
      qty: a.qty, spend: a.amt, prvSpend: b.amt, unit: a.unit,
      priceEffect: (a.wap - b.wap) * a.qty,     // שינוי מחיר × כמות נוכחית
      volEffect: (a.qty - b.qty) * b.wap,       // שינוי כמות × מחיר בסיס
      comparable: !!M.itemComparable[it]
    });
  }
  return out;
}

/* ---------- התראות ---------- */
export const ACFG = { priceJump: 15, qtyJump: 50, openAge: 120, minSpend: 50000, concShare: 35, dupDays: 14 };

export function findDuplicates(idx) {
  const m = new Map(), out = [];
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    if (!(M.a[k] > 1000)) continue;
    const key = M.s[k] + '|' + M.i[k] + '|' + M.q[k].toFixed(3) + '|' + M.up[k].toFixed(4);
    let a = m.get(key);
    if (!a) { a = []; m.set(key, a); }
    a.push(k);
  }
  for (const a of m.values()) {
    if (a.length < 2) continue;
    a.sort((x, y) => M.d[x] - M.d[y]);
    for (let n = 1; n < a.length; n++) {
      if (M.p[a[n]] === M.p[a[n - 1]]) continue;
      if (M.d[a[n]] - M.d[a[n - 1]] <= ACFG.dupDays) out.push({ k1: a[n - 1], k2: a[n], a: M.a[a[n]] });
    }
  }
  return out.sort((x, y) => y.a - x.a).slice(0, 300);
}

export function buildAlerts(idx) {
  const out = [], w = curWindow();
  if (!w) return out;
  const prv = priorYearIdx(), tot = sum(idx, M.a);
  const i2s = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    let s = i2s.get(M.i[k]);
    if (!s) { s = new Set(); i2s.set(M.i[k], s); }
    s.add(M.s[k]);
  }

  const pd = priceDelta(idx, prv);
  pd.filter(x => x.comparable && x.spend >= ACFG.minSpend && x.delta >= ACFG.priceJump)
    .sort((a, b) => b.priceEffect - a.priceEffect).slice(0, 12).forEach(x => out.push({
      sev: x.delta >= 30 ? 'crit' : 'warn', t: `עליית מחיר ב${IDESC(x.it) || ITEM(x.it)}`,
      p: `המחיר הממוצע המשוקלל עלה מ-${price(x.prv)} ל-${price(x.cur)} ל${x.unit} — ${x.delta.toFixed(1)}%. השפעת המחיר על ההוצאה: ${money(x.priceEffect)}.`,
      src: 'מחיר משוקלל לפי כמות, יחידת המידה העיקרית בלבד, מול התקופה המקבילה בשנה קודמת',
      act: 'פתיחת משא ומתן על המק״ט, בדיקת חלופות וסגירת מחיר לתקופה.', go: { item: x.it }
    }));

  const qc = sumBy(idx, M.i, M.q), qp = sumBy(prv, M.i, M.q), sp = sumBy(idx, M.i, M.a);
  for (const [it, q] of qc) {
    const p = qp.get(it);
    if (!p || !(sp.get(it) >= ACFG.minSpend)) continue;
    const d = (q / p - 1) * 100;
    if (d < ACFG.qtyJump) continue;
    out.push({
      sev: d > 150 ? 'warn' : 'info', t: `גידול חריג בכמות — ${IDESC(it) || ITEM(it)}`,
      p: `הכמות שנרכשה עלתה מ-${num(p, 1)} ל-${num(q, 1)} ${UNIT(M.itemUnit[it])} (+${d.toFixed(0)}%), בהוצאה של ${money(sp.get(it))}.`,
      src: 'השוואת כמויות מול התקופה המקבילה בשנה הקודמת',
      act: 'בדיקה אם מדובר בגידול ייצור, בניית מלאי או רכישה כפולה. שקול הסכם כמות.', go: { item: it }
    });
  }

  const sc = sumBy(idx, M.s, M.a), spv = sumBy(prv, M.s, M.a);
  [...sc.entries()].filter(([si, v]) => v >= ACFG.minSpend * 4 && spv.get(si) > 0 && v / spv.get(si) - 1 >= 1)
    .sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([si, v]) => out.push({
      sev: 'info', t: `פעילות גבוהה מהרגיל — ${SUPN(si)}`,
      p: `היקף הרכש מהספק גדל מ-${moneyC(spv.get(si))} ל-${moneyC(v)} (+${((v / spv.get(si) - 1) * 100).toFixed(0)}%).`,
      src: 'השוואה לתקופה המקבילה בשנה הקודמת',
      act: 'אימות מול תוכנית הרכש ובחינת תנאים מסחריים מחדש.', go: { sup: si }
    }));

  const top = topMap(sc, 1)[0];
  if (top && top[1] / tot * 100 >= ACFG.concShare) out.push({
    sev: 'warn', t: 'ריכוז הזמנות אצל ספק יחיד',
    p: `${SUPN(top[0])} מהווה ${(top[1] / tot * 100).toFixed(1)}% מהרכש בתקופה (${moneyC(top[1])}).`,
    src: 'חלוקת סך ההוצאה בתקופה לפי ספק',
    act: 'מיפוי ספקים חלופיים והערכת סיכון המשכיות.', go: { sup: top[0] }
  });

  const op = openIdx(idx);
  const oldOp = idxWhere(k => M.today - M.d[k] >= ACFG.openAge, op);
  if (oldOp.length) out.push({
    sev: 'warn', t: 'הזמנות פתוחות ישנות',
    p: `${num(nuniq(oldOp, M.p))} הזמנות פתוחות מעל ${ACFG.openAge} יום, בשווי יתרה של ${moneyC(sum(oldOp, M.openILS))}.`,
    src: 'שורות עם יתרה לאספקה בסטטוס שאינו סגורה',
    act: 'ניקוי הזמנות שאינן רלוונטיות וסגירת יתרות מול הספקים.', go: { drill: ['הזמנות פתוחות ישנות', oldOp] }
  });

  const late = idxWhere(k => M.dd[k] >= 0 && M.dd[k] < M.today, op);
  if (late.length) out.push({
    sev: 'crit', t: 'הזמנות שמועד האספקה שלהן חלף',
    p: `${num(nuniq(late, M.p))} הזמנות באיחור, שווי יתרה ${moneyC(sum(late, M.openILS))}.`,
    src: 'ת. אספקה קודם לתאריך היום, יתרה לאספקה גדולה מאפס',
    act: 'בירור מול הספקים ועדכון מועדי אספקה בהזמנה.', go: { drill: ['הזמנות באיחור', late] }
  });

  const dup = findDuplicates(idx);
  if (dup.length) out.push({
    sev: 'warn', t: 'רכישות כפולות חשודות',
    p: `${num(dup.length)} זוגות שורות עם אותו ספק, מק״ט, כמות ומחיר בהזמנות שונות בטווח ${ACFG.dupDays} יום — ${moneyC(dup.reduce((s, x) => s + x.a, 0))}.`,
    src: 'התאמה מדויקת של ספק+מק״ט+כמות+מחיר ליחידה בין הזמנות שונות',
    act: 'בדיקה מול הקניין אם מדובר בכפל הזמנה.', go: { dup }
  });

  const ex = priceGaps(idx).reduce((s, x) => s + x.save, 0);
  if (ex > 0) out.push({
    sev: 'info', t: 'חשיפה לפערי מחיר',
    p: `פער מצטבר של ${moneyC(ex)} בין המחיר ששולם בפועל לבין המחיר הטוב ביותר שהושג באותה תקופה, על מק״טים בני-השוואה.`,
    src: 'מחיר משוקלל לכל ספק ברמת מק״ט ויחידת מידה, אחרי סינון קודי מרכז-עלות',
    act: 'מיקוד משא ומתן ב-20 המק״טים המובילים ברשימת ההזדמנויות.', go: { tab: 'save' }
  });

  const zp = idxWhere(k => !(M.up[k] > 0), idx);
  if (zp.length) out.push({
    sev: 'info', t: 'שורות ללא מחיר',
    p: `${num(zp.length)} שורות עם מחיר יחידה אפס או שלילי. הן נכללות בסך ההוצאה אך מוחרגות מכל ניתוח מחירים.`,
    src: 'עמודת מחיר ליחידה',
    act: 'תיקון במערכת הרכש או סימון כשורות התאמה.', go: { drill: ['שורות ללא מחיר', zp] }
  });

  const ord = { crit: 0, warn: 1, info: 2 };
  out.sort((a, b) => ord[a.sev] - ord[b.sev]);
  return out;
}

/* ---------- הזדמנויות חיסכון ---------- */
export const oid = s => String(s).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 90);
const oppKey = (type, a) => oid(type + '_' + a);

export function buildOpportunities(idx, track = {}) {
  const out = [], tot = sum(idx, M.a);
  const i2c = new Map(), i2s = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    if (!i2c.has(M.i[k])) i2c.set(M.i[k], M.cat[k]);
    let s = i2s.get(M.i[k]);
    if (!s) { s = new Set(); i2s.set(M.i[k], s); }
    s.add(M.s[k]);
  }
  const catOf = it => CATN(i2c.get(it)) || '—';

  /* א. פער מחיר בין ספקים — מחושב ממחירים ששולמו בפועל */
  priceGaps(idx).forEach(x => {
    const worst = x.rows.reduce((m, y) => y.sv > m.sv ? y : m, x.rows[0]);
    out.push({
      id: oppKey('gap', ITEM(x.it)), kind: 'פער מחיר בין ספקים', _it: x.it, _si: worst.si,
      sup: SUPN(worst.si), item: (IDESC(x.it) || ITEM(x.it)) + ' · ' + x.unit, cat: catOf(x.it), spend: x.spend,
      issue: `${x.nsup} ספקים לאותו מק״ט ויחידה; פער של ${x.gapPct.toFixed(0)}% בין הגבוה למחיר הטוב (${price(x.target.wap)} אצל ${SUPN(x.target.si)})`,
      act: `יישור כל הכמות למחיר הטוב שהושג בפועל, או מכרז מחודש בין ${x.nsup} הספקים`,
      save: x.save, conf: x.conf, basis: 'מחושב',
      assume: `מחיר משוקלל לכל ספק ביחידה ${x.unit}; חיסכון = (מחיר הספק − המחיר הטוב) × הכמות שנרכשה ממנו בתקופה. ספק הייחוס עם ${x.target.npo} הזמנות ומעלה.`
    });
  });

  /* ב. ריבוי הזמנות קטנות — אומדן עלות תהליך, לא מחיר סחורה */
  {
    const pa = poAgg(idx);
    const bySup = new Map();
    for (const o of pa.values()) {
      if (o.spend >= 2000) continue;
      let x = bySup.get(o.sup);
      if (!x) { x = { n: 0, v: 0 }; bySup.set(o.sup, x); }
      x.n++; x.v += o.spend;
    }
    [...bySup.entries()].filter(([, x]) => x.n >= 12).sort((a, b) => b[1].n - a[1].n).forEach(([si, x]) => out.push({
      id: oppKey('small', SUPID(si)), kind: 'איחוד הזמנות קטנות', _si: si, sup: SUPN(si), item: '— רוחבי —',
      cat: M.catMap[(M.dims.supInfo[si] || {}).typeDesc || ''] || 'אחרים', spend: x.v,
      issue: `${x.n} הזמנות מתחת ל-2,000 ₪ אצל אותו ספק, בסך ${money(x.v)}`,
      act: 'הסכם מסגרת או הזמנה פתוחה לספק, וריכוז דרישות לפעימה חודשית',
      save: x.n * 120, conf: 'אומדן', basis: 'אומדן',
      assume: 'אומדן עלות טיפול של 120 ₪ להזמנה — עלות תהליך, לא מחיר הסחורה. הנתון אינו בקובץ ויש לכייל אותו לנתוני גלעם.'
    }));
  }

  /* ג. ספק יחיד בהיקף מהותי */
  {
    const ia = agg(idx, M.i, { spend: [M.a, 'sum'], pos: [M.p, 'nuniq'], sups: [M.s, 'nuniq'] });
    [...ia.entries()].filter(([it, o]) => o.sups === 1 && o.spend >= 5e5 && !M.itemCatchAll[it])
      .sort((a, b) => b[1].spend - a[1].spend).slice(0, 40).forEach(([it, o]) => {
        const si = [...i2s.get(it)][0];
        out.push({
          id: oppKey('single', ITEM(it)), kind: 'הגדלת תחרות / ספק יחיד', _it: it, _si: si, sup: SUPN(si),
          item: IDESC(it) || ITEM(it), cat: catOf(it), spend: o.spend,
          issue: `כל הרכש של המק״ט מספק אחד, ב-${o.pos} הזמנות — אין בסיס להשוואת מחיר`,
          act: 'הוצאה לתחרות מול 2–3 ספקים חלופיים והקמת ספק גיבוי',
          save: o.spend * 0.04, conf: 'אומדן', basis: 'אומדן',
          assume: 'אומדן שמרני של 4% מהיקף המק״ט כתועלת מהגדלת תחרות. אין בקובץ מחיר חלופי, ולכן זה אינו חיסכון מחושב.'
        });
      });
  }

  /* ד. רכש חוזר בלי מסגרת מחיר */
  {
    const g = agg(idx, M.i, { spend: [M.a, 'sum'], pos: [M.p, 'nuniq'] });
    [...g.entries()].filter(([it, o]) => o.pos >= 14 && o.spend >= 2e5 && !M.itemCatchAll[it])
      .sort((a, b) => b[1].pos - a[1].pos).slice(0, 30).forEach(([it, o]) => out.push({
        id: oppKey('annual', ITEM(it)), kind: 'מעבר להסכם שנתי', _it: it, _si: [...i2s.get(it)][0],
        sup: [...i2s.get(it)].map(SUPN).slice(0, 2).join(' / '), item: IDESC(it) || ITEM(it), cat: catOf(it), spend: o.spend,
        issue: `${o.pos} הזמנות נפרדות לאותו מק״ט בתקופה — רכש חוזר בלי מסגרת מחיר`,
        act: 'הסכם שנתי עם מחיר קבוע או נוסחת הצמדה, ומשיכות לפי צורך',
        save: o.spend * 0.03, conf: 'אומדן', basis: 'אומדן',
        assume: 'אומדן של 3% מהיקף המק״ט כתועלת מסגירת מחיר שנתי. אין בקובץ נתוני הסכם, ולכן זה אומדן ולא חישוב.'
      }));
  }

  for (const o of out) {
    const t = track[o.id] || {};
    o.owner = t.owner || ''; o.status = t.status || 'זוהתה';
    o.approved = Number(t.approved) || 0; o.realized = Number(t.realized) || 0; o.note = t.note || '';
  }
  out.sort((a, b) => b.save - a.save);
  return { out, tot };
}

/* ---------- תחזית ---------- */
export function forecast(histIdx, horizon = 12) {
  const mo = monthly(histIdx);
  const n = mo.v.length;
  if (n < 4) return null;
  const useN = Math.min(24, Math.max(6, n - 1));
  const ser = mo.v.slice(Math.max(0, n - useN - 1), n - 1);   // החודש הנוכחי חלקי, לא נכנס
  if (ser.length < 3) return null;
  const xbar = (ser.length - 1) / 2, ybar = ser.reduce((s, v) => s + v, 0) / ser.length;
  let nu = 0, de = 0;
  ser.forEach((y, i) => { nu += (i - xbar) * (y - ybar); de += Math.pow(i - xbar, 2); });
  const slope = de ? nu / de : 0, intercept = ybar - slope * xbar;
  const seas = new Array(12).fill(0), sc = new Array(12).fill(0);
  mo.keys.slice(0, n - 1).forEach((k, i) => { const mi = k % 12; seas[mi] += mo.v[i]; sc[mi]++; });
  const seasAvg = seas.map((v, i) => sc[i] ? v / sc[i] : 0);
  const grand = seasAvg.reduce((s, v) => s + v, 0) / 12;
  const seasIdx = seasAvg.map(v => grand ? v / grand : 1);
  const lastK = mo.keys[n - 2];
  const fc = [];
  for (let i = 1; i <= horizon; i++) {
    const k = lastK + i;
    fc.push({ k, v: Math.max(0, (intercept + slope * (ser.length - 1 + i)) * seasIdx[k % 12]) });
  }
  return { mo, fc, slope, n };
}

/* ---------- חבילת העובדות ליועץ ---------- */
// נשלחת לשרת במקום הנתונים עצמם: כמה עשרות קילובייט מחושבים, לא 3.5 מגה.
export function factsPack(idx, track) {
  const w = curWindow(), op = openIdx(idx), tot = sum(idx, M.a);
  const prv = priorYearIdx();
  const pd = priceDelta(idx, prv).filter(x => x.comparable);
  const gaps = priceGaps(idx);
  const { out: opps } = buildOpportunities(idx, track || {});
  const ia = agg(idx, M.i, { spend: [M.a, 'sum'], sups: [M.s, 'nuniq'] });
  const single = [...ia.entries()].filter(([, o]) => o.sups === 1);
  const sm = topMap(sumBy(idx, M.s, M.a));
  const R = n => Math.round(n);

  return {
    scope: {
      מתאריך: w ? dstr(w.from) : null, עד_תאריך: w ? dstr(w.to) : null,
      שורות: idx.length, סך_רכש_שח: R(tot), הזמנות: nuniq(idx, M.p),
      ספקים: nuniq(idx, M.s), מקטים: nuniq(idx, M.i),
      התחייבויות_פתוחות_שח: R(sum(op, M.openILS)),
      הערה: 'סכומים מעמודת סכום (ILS) שכבר מומרת לשקלים במקור. הנתונים הם הזמנות רכש, לא חשבוניות או אספקות בפועל.'
    },
    ספקים_גדולים: sm.slice(0, 15).map(([si, v]) => ({ שם: SUPN(si), מספר: SUPID(si), סכום_שח: R(v), אחוז: +(v / tot * 100).toFixed(1) })),
    מקטים_גדולים: topMap(sumBy(idx, M.i, M.a), 15).map(([it, v]) => ({
      תאור: IDESC(it) || ITEM(it), מקט: ITEM(it), יחידה: UNIT(M.itemUnit[it]), סכום_שח: R(v),
      בר_השוואה: M.itemCatchAll[it] ? 'לא — קוד מרכז עלות' : (M.itemComparable[it] ? 'כן' : 'לא')
    })),
    לפי_סוג_ספק: topMap(sumBy(idx, M.styp, M.a), 20).map(([n, v]) => ({ שם: M.dims.styp[n], סכום_שח: R(v) })),
    לפי_קטגוריה: topMap(sumBy(idx, M.cat, M.a), 20).map(([n, v]) => ({ שם: CATN(n), סכום_שח: R(v) })),
    לפי_סוג_הזמנה: topMap(sumBy(idx, M.pt, M.a), 20).map(([n, v]) => ({ שם: PTYP(n), סכום_שח: R(v) })),
    לפי_שנה: topMap(sumBy(idx, M.y, M.a)).sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ שנה: y, סכום_שח: R(v) })),
    שינויי_מחיר: {
      בסיס: 'התקופה המקבילה בשנה קודמת',
      מקטים_בהשוואה: pd.length,
      סך_השפעת_מחיר_שח: R(pd.reduce((s, x) => s + x.priceEffect, 0)),
      סך_השפעת_כמות_שח: R(pd.reduce((s, x) => s + x.volEffect, 0)),
      התייקרו: pd.filter(x => x.delta > 0).sort((a, b) => b.priceEffect - a.priceEffect).slice(0, 12)
        .map(x => ({ תאור: IDESC(x.it) || ITEM(x.it), יחידה: x.unit, מחיר_קודם: +x.prv.toFixed(3), מחיר_נוכחי: +x.cur.toFixed(3), שינוי_אחוז: +x.delta.toFixed(1), השפעת_מחיר_שח: R(x.priceEffect) })),
      הוזלו: pd.filter(x => x.delta < 0).sort((a, b) => a.priceEffect - b.priceEffect).slice(0, 8)
        .map(x => ({ תאור: IDESC(x.it) || ITEM(x.it), שינוי_אחוז: +x.delta.toFixed(1), השפעת_מחיר_שח: R(x.priceEffect) }))
    },
    פערי_מחיר: gaps.slice(0, 20).map(x => ({
      תאור: IDESC(x.it) || ITEM(x.it), מקט: ITEM(x.it), יחידה: x.unit, מספר_ספקים: x.nsup,
      המחיר_הטוב: +x.target.wap.toFixed(3), ספק_הטוב: SUPN(x.target.si),
      פער_אחוז: +x.gapPct.toFixed(1), הוצאה_שח: R(x.spend), פוטנציאל_שח: R(x.save), ביטחון: x.conf
    })),
    הזדמנויות: {
      סך_מחושב_שח: R(opps.filter(o => o.basis === 'מחושב').reduce((s, o) => s + o.save, 0)),
      סך_אומדן_שח: R(opps.filter(o => o.basis === 'אומדן').reduce((s, o) => s + o.save, 0)),
      פירוט: opps.slice(0, 25).map(o => ({
        סוג: o.kind, ספק: o.sup, מקט: o.item, קטגוריה: o.cat, הוצאה_שח: R(o.spend),
        בעיה: o.issue, פעולה: o.act, חיסכון_שח: R(o.save), בסיס: o.basis, ביטחון: o.conf, סטטוס: o.status
      }))
    },
    תלות_בספקים: {
      HHI: R(sm.reduce((s, x) => s + Math.pow(x[1] / tot * 100, 2), 0)),
      חלק_הספק_הגדול_אחוז: sm.length ? +(sm[0][1] / tot * 100).toFixed(1) : null,
      הספק_הגדול: sm.length ? SUPN(sm[0][0]) : null,
      חלק_5_הגדולים_אחוז: +(sm.slice(0, 5).reduce((s, x) => s + x[1], 0) / tot * 100).toFixed(1),
      מקטים_בספק_יחיד: single.length,
      חשיפה_שח: R(single.reduce((s, [, o]) => s + o.spend, 0))
    },
    התחייבויות_פתוחות: (() => {
      const late = idxWhere(k => M.dd[k] >= 0 && M.dd[k] < M.today, op);
      return {
        סך_שח: R(sum(op, M.openILS)), הזמנות: nuniq(op, M.p),
        באיחור_שח: R(sum(late, M.openILS)), הזמנות_באיחור: nuniq(late, M.p),
        לפי_ספק: topMap(sumBy(op, M.s, M.openILS), 8).map(([si, v]) => ({ ספק: SUPN(si), שח: R(v) })),
        הערה: 'יתרה לאספקה היא כמות; השווי = סכום(ILS)×(יתרה/כמות). זו התחייבות, לא הוצאה שהתהוותה.'
      };
    })(),
    איחוד_הזמנות: (() => {
      const pa = poAgg(idx), pos = [...pa.values()];
      const small = pos.filter(o => o.spend < 2000);
      const bySup = new Map();
      small.forEach(o => { let x = bySup.get(o.sup); if (!x) { x = { n: 0, v: 0 }; bySup.set(o.sup, x); } x.n++; x.v += o.spend; });
      return {
        סך_הזמנות: pos.length, מתחת_ל2000: small.length, ערכן_שח: R(small.reduce((s, o) => s + o.spend, 0)),
        ספקים: [...bySup.entries()].filter(([, x]) => x.n >= 8).sort((a, b) => b[1].n - a[1].n).slice(0, 10)
          .map(([si, x]) => ({ ספק: SUPN(si), הזמנות_קטנות: x.n, ערך_שח: R(x.v) }))
      };
    })(),
    התראות: buildAlerts(idx).slice(0, 12).map(a => ({
      חומרה: a.sev === 'crit' ? 'חמורה' : a.sev === 'warn' ? 'בינונית' : 'לידיעה',
      כותרת: a.t, הסבר: a.p, מקור: a.src, פעולה: a.act
    })),
    מגבלות: [
      'אין בקובץ חשבוניות, תשלומים או אספקות בפועל.',
      'אין מרכז עלות, מפעל או מחלקה.',
      'אין קריטיות מק״ט לייצור ואין תנאי הסכם או מחירון.',
      'קודי מרכז-עלות (יחידה לא מדידה ופיזור מחירים מעל פי 10) מוחרגים מכל ניתוח מחיר.'
    ]
  };
}
