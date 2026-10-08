// מודל הנתונים ומנוע הסינון של לשונית SPEND.
//
// מערך ההזמנות מגיע מ-/api/spend כעמודות מקבילות ולא כרשימת אובייקטים:
// 42 אלף שורות × 16 שדות כאובייקטים הן עשרות מגה בזיכרון ומאיטות כל סינון.
// כמערכים מוקלדים זה כמה מגה, וסינון מלא רץ במילישניות בודדות.
//
// כל מסך בלשונית שואב את השורות שלו מ-IDX() ומ-scanWindow(), כך שאין מסך
// שמחשב על קבוצת שורות אחרת — וזה מה שמונע אי-התאמה בין המספרים במסכים.

export const HE = 'he-IL';
export const NIS = ' ₪';
export const MON = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const MONS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
export const ABCN = ['A', 'B', 'C'];

/* יחידות שאפשר להשוות עליהן מחיר. EAC/EA הן "יחידה" גנרית ולכן לא נכנסות. */
export const MEASURABLE = new Set(['KG', 'T', 'LT', 'M', 'M3', 'HR']);

/* ---------- מספרים ותאריכים ---------- */
// הסימן ₪ נכתב אחרי המספר: בטקסט עברי הדפדפן מסדר "₪1.25 מיליארד" הפוך
// ומציג "1.25₪ מיליארד".
export const num = (v, d = 0) => (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString(HE, { minimumFractionDigits: d, maximumFractionDigits: d });
export const money = v => (v == null || !isFinite(v)) ? '—' : Math.round(v).toLocaleString(HE) + NIS;
export const moneyC = v => {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1e9) return s + (a / 1e9).toLocaleString(HE, { maximumFractionDigits: 2 }) + ' מיליארד' + NIS;
  if (a >= 1e6) return s + (a / 1e6).toLocaleString(HE, { maximumFractionDigits: 1 }) + ' מ׳' + NIS;
  if (a >= 1e4) return s + (a / 1e3).toLocaleString(HE, { maximumFractionDigits: 0 }) + ' א׳' + NIS;
  return s + a.toLocaleString(HE, { maximumFractionDigits: 0 }) + NIS;
};
export const pct = (v, d = 1) => (v == null || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + v.toLocaleString(HE, { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
export const price = v => (v == null || !isFinite(v)) ? '—' : v.toLocaleString(HE, { maximumFractionDigits: v < 10 ? 3 : 2 }) + NIS;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const safeDiv = (a, b) => (b && isFinite(b)) ? a / b : null;

let EPOCH_MS = 0;
export const toDate = d => new Date(EPOCH_MS + d * 864e5);
export const dstr = d => d < 0 ? '—' : (() => {
  const t = toDate(d);
  return `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`;
})();
export const ymstr = (y, m) => MONS[m - 1] + ' ' + String(y).slice(2);
export const dayOf = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - EPOCH_MS) / 864e5);
export const isoOf = d => toDate(d).toISOString().slice(0, 10);
export const fromIso = s => { const [a, b, c] = s.split('-').map(Number); return dayOf(a, b, c); };
export const shiftYear = (day, k) => { const t = toDate(day); return dayOf(t.getUTCFullYear() + k, t.getUTCMonth() + 1, t.getUTCDate()); };

/* ---------- המודל ---------- */
export const M = {};

export const CAT_DEFAULT = {
  'ספקי תירס/סוכר': 'חומרי גלם',
  'חומרי גלם לעמילן / נמסים': 'חומרי גלם',
  'אנזימים': 'חומרי גלם',
  'פחם פעיל / פרליט / אדמה דיאטומית': 'חומרי גלם',
  'כימיקלים ושרפים': 'כימיקלים',
  'שקים': 'אריזות',
  'משטחים, שרינקים ואריזות קשיחות': 'אריזות',
  'אנרגיה': 'אנרגיה',
  'הובלות יבשתיות': 'הובלות ולוגיסטיקה',
  'משלחים': 'הובלות ולוגיסטיקה',
  'רכש טכני': 'אחזקה, ציוד וחלקי חילוף',
  'קבמ': 'שירותים וקבלנים',
  'רכש עקיף': 'רכש עקיף ושירותים',
  'אחרים': 'אחרים',
  'דגל': 'אחרים',
  '': 'לא מסווג'
};

export const LS = (k, v) => {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem('spend.' + k));
    localStorage.setItem('spend.' + k, JSON.stringify(v));
  } catch { return null; }
};

function bucket(arr, n) {
  const c = new Int32Array(n + 1);
  for (let k = 0; k < arr.length; k++) c[arr[k] + 1]++;
  for (let k = 0; k < n; k++) c[k + 1] += c[k];
  const out = new Int32Array(arr.length), pos = c.slice();
  for (let k = 0; k < arr.length; k++) out[pos[arr[k]]++] = k;
  return { off: c, idx: out, get(v) { return this.idx.subarray(this.off[v], this.off[v + 1]); } };
}

export function buildModel(D) {
  EPOCH_MS = Date.parse(D.meta.epoch + 'T00:00:00Z');
  const r = D.rows, N = D.meta.rows;
  M.meta = D.meta; M.N = N; M.dims = D.dims;
  const I = k => Int32Array.from(r[k]), Fl = k => Float64Array.from(r[k]);
  M.s = I('s'); M.i = I('i'); M.p = I('p'); M.b = I('b'); M.st = I('st');
  M.pt = I('pt'); M.u = I('u'); M.c = I('c'); M.ln = I('ln'); M.d = I('d'); M.dd = I('dd');
  M.q = Fl('q'); M.up = Fl('up'); M.a = Fl('a'); M.oq = Fl('oq');

  M.y = new Int16Array(N); M.mo = new Int8Array(N); M.qt = new Int8Array(N); M.ym = new Int32Array(N);
  M.openILS = new Float64Array(N); M.ilsU = new Float64Array(N); M.fx = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const t = toDate(M.d[k]), y = t.getUTCFullYear(), mo = t.getUTCMonth() + 1;
    M.y[k] = y; M.mo[k] = mo; M.qt[k] = Math.ceil(mo / 3); M.ym[k] = y * 12 + (mo - 1);
    const q = M.q[k];
    M.ilsU[k] = q > 0 ? M.a[k] / q : NaN;
    M.fx[k] = (q > 0 && M.up[k] > 0) ? M.a[k] / (q * M.up[k]) : NaN;
    // יתרה לאספקה היא כמות. השווי הוא החלק היחסי של אותה שורה.
    M.openILS[k] = (q > 0 && M.oq[k] > 0) ? M.a[k] * (M.oq[k] / q) : 0;
  }

  const info = D.dims.supInfo;
  const styps = [...new Set(info.map(x => x.typeDesc || ''))].sort((a, b) => a.localeCompare(b, HE));
  M.dims.styp = styps.map(x => x || 'ללא סיווג');
  const stypIdx = new Map(styps.map((v, n) => [v, n]));
  M.supStyp = Int32Array.from(info.map(x => stypIdx.get(x.typeDesc || '')));
  M.styp = new Int32Array(N);
  for (let k = 0; k < N; k++) M.styp[k] = M.supStyp[M.s[k]];

  M.statClosed = M.dims.status.indexOf('סגורה');
  M.statDraft = M.dims.status.indexOf('טיוטא');
  M.openStat = new Uint8Array(M.dims.status.length);
  M.dims.status.forEach((s, n) => { M.openStat[n] = (n === M.statClosed || n === M.statDraft) ? 0 : 1; });

  M.rowsByItem = bucket(M.i, M.dims.item.length);

  // יחידת המידה העיקרית של כל מק"ט, לפי היקף כספי
  M.itemUnit = new Int32Array(M.dims.item.length).fill(-1);
  M.itemSpend = new Float64Array(M.dims.item.length);
  const uc = new Map();
  for (let k = 0; k < N; k++) {
    if (M.st[k] === M.statDraft) continue;
    M.itemSpend[M.i[k]] += M.a[k];
    const key = M.i[k] * 16 + M.u[k];
    uc.set(key, (uc.get(key) || 0) + M.a[k]);
  }
  const bestU = new Float64Array(M.dims.item.length);
  for (const [key, v] of uc) {
    const it = Math.floor(key / 16), u = key % 16;
    if (v >= bestU[it]) { bestU[it] = v; M.itemUnit[it] = u; }
  }

  // שער ההשוואה. בלעדיו כל ניתוח מחירים נשען על קודים כמו
  // "רכוש קבוע כללי פרוייקטים", שבהם הכמות היא 1 והמחיר הוא סכום החשבונית,
  // ומפיק פוטנציאל חיסכון דמיוני בסדר גודל של מאות מיליונים.
  M.itemComparable = new Uint8Array(M.dims.item.length);
  M.itemCatchAll = new Uint8Array(M.dims.item.length);
  {
    const n = M.dims.item.length;
    const mn = new Float64Array(n).fill(Infinity), mx = new Float64Array(n), cnt = new Int32Array(n);
    for (let k = 0; k < N; k++) {
      if (M.st[k] === M.statDraft) continue;
      const v = M.ilsU[k];
      if (!(v > 0)) continue;
      const it = M.i[k];
      if (v < mn[it]) mn[it] = v;
      if (v > mx[it]) mx[it] = v;
      cnt[it]++;
    }
    for (let it = 0; it < n; it++) {
      const meas = MEASURABLE.has(M.dims.unit[M.itemUnit[it]] || '');
      const ratio = (mn[it] > 0 && isFinite(mn[it])) ? mx[it] / mn[it] : Infinity;
      M.itemComparable[it] = (meas || (ratio <= 5 && cnt[it] >= 3)) ? 1 : 0;
      M.itemCatchAll[it] = (!meas && ratio > 10 && cnt[it] >= 5) ? 1 : 0;
    }
  }

  M.catMap = Object.assign({}, CAT_DEFAULT, LS('catmap') || {});
  M.catBasis = LS('catbasis') || 'styp';
  rebuildCats();
  recomputeABC(80, 95);
  M.minD = D.meta.minDate; M.maxD = D.meta.maxDate;
  M.years = [...new Set([...M.y])].sort();
  M.today = Math.max(M.maxD, Math.round((Date.now() - EPOCH_MS) / 864e5));
  return M;
}

export function rebuildCats() {
  const basis = M.catBasis;
  let names, rowCat;
  if (basis === 'ptyp') { names = M.dims.potype.slice(); rowCat = M.pt; }
  else if (basis === 'styp') { names = M.dims.styp.slice(); rowCat = M.styp; }
  else {
    const set = [...new Set(M.dims.styp.map(s => M.catMap[s === 'ללא סיווג' ? '' : s] || 'אחרים'))];
    names = set;
    const idx = new Map(set.map((v, n) => [v, n]));
    const m = Int32Array.from(M.dims.styp.map(s => idx.get(M.catMap[s === 'ללא סיווג' ? '' : s] || 'אחרים')));
    rowCat = new Int32Array(M.N);
    for (let k = 0; k < M.N; k++) rowCat[k] = m[M.styp[k]];
  }
  M.dims.cat = names; M.cat = rowCat;
}

function classify(vals, aT, bT) {
  const n = vals.length;
  const ord = Array.from({ length: n }, (_, k) => k).filter(k => vals[k] > 0).sort((x, y) => vals[y] - vals[x]);
  const tot = ord.reduce((s, k) => s + vals[k], 0), out = new Int8Array(n).fill(2);
  let c = 0;
  for (const k of ord) { c += vals[k]; const p = tot ? c / tot * 100 : 0; out[k] = p <= aT ? 0 : (p <= bT ? 1 : 2); }
  return out;
}

export function recomputeABC(aT, bT) {
  M.abcT = [aT, bT];
  const si = new Float64Array(M.dims.item.length), ss = new Float64Array(M.dims.sup.length);
  for (let k = 0; k < M.N; k++) {
    if (M.st[k] === M.statDraft) continue;
    si[M.i[k]] += M.a[k]; ss[M.s[k]] += M.a[k];
  }
  M.itemABC = classify(si, aT, bT); M.supABC = classify(ss, aT, bT);
  M.abc = new Int8Array(M.N);
  for (let k = 0; k < M.N; k++) M.abc[k] = M.itemABC[M.i[k]];
}

/* ---------- שמות ---------- */
export const SUP = i => M.dims.supInfo[i];
export const SUPN = i => (M.dims.supInfo[i] && M.dims.supInfo[i].name) || M.dims.sup[i];
export const SUPID = i => M.dims.sup[i];
export const ITEM = i => M.dims.item[i];
export const IDESC = i => M.dims.itemDesc[i] || '';
export const UNIT = i => M.dims.unit[i] || '';
export const CUR = i => M.dims.cur[i];
export const STAT = i => M.dims.status[i];
export const PTYP = i => M.dims.potype[i];
export const BUY = i => M.dims.buyer[i];
export const CATN = i => M.dims.cat[i];

/* ---------- מנוע הסינון ---------- */
export const F = {
  years: new Set(), qs: new Set(), months: new Set(), from: null, to: null,
  sup: new Set(), styp: new Set(), item: new Set(), cat: new Set(), buyer: new Set(),
  cur: new Set(), stat: new Set(), ptyp: new Set(), abc: new Set(), unit: new Set(),
  openOnly: false, noDrafts: true
};

let _idx = null, _idxKey = '';
export function fkey() {
  return JSON.stringify([[...F.years], [...F.qs], [...F.months], F.from, F.to, [...F.sup], [...F.styp],
    [...F.item], [...F.cat], [...F.buyer], [...F.cur], [...F.stat], [...F.ptyp], [...F.abc], [...F.unit],
    F.openOnly, F.noDrafts, M.catBasis, M.abcT]);
}
export function invalidate() { _idx = null; _idxKey = ''; }

export function IDX() {
  const k = fkey();
  if (k === _idxKey && _idx) return _idx;
  _idxKey = k;
  const out = new Uint32Array(M.N);
  let n = 0;
  const hy = F.years.size, hq = F.qs.size, hm = F.months.size, hs = F.sup.size, hst = F.styp.size,
    hi = F.item.size, hc = F.cat.size, hb = F.buyer.size, hcu = F.cur.size, hss = F.stat.size,
    hp = F.ptyp.size, ha = F.abc.size, hu = F.unit.size;
  for (let k2 = 0; k2 < M.N; k2++) {
    if (F.noDrafts && M.st[k2] === M.statDraft) continue;
    if (F.openOnly && !(M.openStat[M.st[k2]] && M.oq[k2] > 0)) continue;
    if (hy && !F.years.has(M.y[k2])) continue;
    if (hq && !F.qs.has(M.qt[k2])) continue;
    if (hm && !F.months.has(M.mo[k2])) continue;
    if (F.from != null && M.d[k2] < F.from) continue;
    if (F.to != null && M.d[k2] > F.to) continue;
    if (hs && !F.sup.has(M.s[k2])) continue;
    if (hst && !F.styp.has(M.styp[k2])) continue;
    if (hi && !F.item.has(M.i[k2])) continue;
    if (hc && !F.cat.has(M.cat[k2])) continue;
    if (hb && !F.buyer.has(M.b[k2])) continue;
    if (hcu && !F.cur.has(M.c[k2])) continue;
    if (hss && !F.stat.has(M.st[k2])) continue;
    if (hp && !F.ptyp.has(M.pt[k2])) continue;
    if (ha && !F.abc.has(M.abc[k2])) continue;
    if (hu && !F.unit.has(M.u[k2])) continue;
    out[n++] = k2;
  }
  _idx = out.subarray(0, n);
  return _idx;
}

export function idxWhere(test, base) {
  const b = base || IDX(), out = new Uint32Array(b.length);
  let n = 0;
  for (let j = 0; j < b.length; j++) { const k = b[j]; if (test(k)) out[n++] = k; }
  return out.subarray(0, n);
}

export const ALL = () => { const a = new Uint32Array(M.N); for (let k = 0; k < M.N; k++) a[k] = k; return a; };

export function resetF() {
  for (const k of ['years', 'qs', 'months', 'sup', 'styp', 'item', 'cat', 'buyer', 'cur', 'stat', 'ptyp', 'abc', 'unit']) F[k].clear();
  F.from = F.to = null; F.openOnly = false; F.noDrafts = true;
  invalidate();
}
export function clearPeriod() {
  F.years.clear(); F.qs.clear(); F.months.clear(); F.from = null; F.to = null;
  invalidate();
}

/* כל הפילטרים הפעילים חוץ מהתקופה, בתוספת חלון תאריכים מפורש.
   זה מה שמאפשר להשוות תקופות בלי לאבד את שאר הסינון. */
export function scanWindow(from, to, extra) {
  const out = new Uint32Array(M.N);
  let n = 0;
  const hs = F.sup.size, hst = F.styp.size, hi = F.item.size, hc = F.cat.size, hb = F.buyer.size,
    hcu = F.cur.size, hss = F.stat.size, hp = F.ptyp.size, ha = F.abc.size, hu = F.unit.size;
  for (let k = 0; k < M.N; k++) {
    if (F.noDrafts && M.st[k] === M.statDraft) continue;
    if (F.openOnly && !(M.openStat[M.st[k]] && M.oq[k] > 0)) continue;
    if (from != null && M.d[k] < from) continue;
    if (to != null && M.d[k] > to) continue;
    if (hs && !F.sup.has(M.s[k])) continue;
    if (hst && !F.styp.has(M.styp[k])) continue;
    if (hi && !F.item.has(M.i[k])) continue;
    if (hc && !F.cat.has(M.cat[k])) continue;
    if (hb && !F.buyer.has(M.b[k])) continue;
    if (hcu && !F.cur.has(M.c[k])) continue;
    if (hss && !F.stat.has(M.st[k])) continue;
    if (hp && !F.ptyp.has(M.pt[k])) continue;
    if (ha && !F.abc.has(M.abc[k])) continue;
    if (hu && !F.unit.has(M.u[k])) continue;
    if (extra && !extra(k)) continue;
    out[n++] = k;
  }
  return out.subarray(0, n);
}

export function curWindow() {
  const idx = IDX();
  if (!idx.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < idx.length; j++) { const d = M.d[idx[j]]; if (d < lo) lo = d; if (d > hi) hi = d; }
  return { from: F.from ?? lo, to: F.to ?? hi };
}

/* חלון ארוך משנה חופף לעצמו אחרי הזזה בשנה, וכל השוואה כזו חסרת משמעות. */
export const YOY_MAX_SPAN = 400;
export function yoyUsable() { const w = curWindow(); return !!w && (w.to - w.from) <= YOY_MAX_SPAN; }
export function priorYearIdx() {
  const w = curWindow();
  if (!w || !yoyUsable()) return new Uint32Array(0);
  return scanWindow(shiftYear(w.from, -1), shiftYear(w.to, -1));
}

/* ---------- אגרגציה ---------- */
export function agg(idx, keyArr, specs) {
  const m = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j], g = keyArr[k];
    let o = m.get(g);
    if (!o) {
      o = { _g: g };
      for (const n in specs) { const t = specs[n][1]; o[n] = t === 'nuniq' ? new Set() : (t === 'min' ? Infinity : (t === 'max' ? -Infinity : 0)); }
      m.set(g, o);
    }
    for (const n in specs) {
      const [a, t] = specs[n];
      if (t === 'sum') o[n] += a[k];
      else if (t === 'count') o[n]++;
      else if (t === 'nuniq') o[n].add(a[k]);
      else if (t === 'min') { const v = a[k]; if (v < o[n]) o[n] = v; }
      else if (t === 'max') { const v = a[k]; if (v > o[n]) o[n] = v; }
    }
  }
  for (const o of m.values()) for (const n in specs) if (specs[n][1] === 'nuniq') o[n] = o[n].size;
  return m;
}
export function sumBy(idx, keyArr, valArr) {
  const m = new Map();
  for (let j = 0; j < idx.length; j++) { const k = idx[j]; m.set(keyArr[k], (m.get(keyArr[k]) || 0) + valArr[k]); }
  return m;
}
export function sum(idx, valArr) { let s = 0; for (let j = 0; j < idx.length; j++) s += valArr[idx[j]]; return s; }
export function nuniq(idx, keyArr) { const s = new Set(); for (let j = 0; j < idx.length; j++) s.add(keyArr[idx[j]]); return s.size; }
export function topMap(m, n, asc) {
  const a = [...m.entries()].filter(e => isFinite(e[1]));
  a.sort(asc ? (x, y) => x[1] - y[1] : (x, y) => y[1] - x[1]);
  return n ? a.slice(0, n) : a;
}

export function monthly(idx, valArr) {
  const m = sumBy(idx, M.ym, valArr || M.a);
  if (!m.size) return { x: [], v: [], keys: [] };
  const ks = [...m.keys()].sort((a, b) => a - b), lo = ks[0], hi = ks[ks.length - 1];
  const x = [], v = [], keys = [];
  for (let k = lo; k <= hi; k++) { const y = Math.floor(k / 12), mo = k % 12 + 1; x.push(ymstr(y, mo)); v.push(m.get(k) || 0); keys.push(k); }
  return { x, v, keys };
}
export function quarterly(idx) {
  const m = new Map();
  for (let j = 0; j < idx.length; j++) { const k = idx[j], key = M.y[k] * 4 + (M.qt[k] - 1); m.set(key, (m.get(key) || 0) + M.a[k]); }
  const ks = [...m.keys()].sort((a, b) => a - b);
  return { x: ks.map(k => `Q${k % 4 + 1}/${String(Math.floor(k / 4)).slice(2)}`), v: ks.map(k => m.get(k)), keys: ks };
}

export const supAgg = idx => agg(idx, M.s, { spend: [M.a, 'sum'], open: [M.openILS, 'sum'], lines: [null, 'count'], pos: [M.p, 'nuniq'], items: [M.i, 'nuniq'], last: [M.d, 'max'], first: [M.d, 'min'] });
export const itemAgg = idx => agg(idx, M.i, { spend: [M.a, 'sum'], qty: [M.q, 'sum'], open: [M.openILS, 'sum'], lines: [null, 'count'], pos: [M.p, 'nuniq'], sups: [M.s, 'nuniq'], last: [M.d, 'max'], first: [M.d, 'min'], pmin: [M.ilsU, 'min'], pmax: [M.ilsU, 'max'] });
export const poAgg = idx => agg(idx, M.p, { spend: [M.a, 'sum'], open: [M.openILS, 'sum'], lines: [null, 'count'], items: [M.i, 'nuniq'], sup: [M.s, 'max'], d: [M.d, 'max'], dd: [M.dd, 'max'], stat: [M.st, 'max'], buyer: [M.b, 'max'], oq: [M.oq, 'sum'] });
export const openIdx = base => idxWhere(k => M.openStat[M.st[k]] && M.oq[k] > 0, base || IDX());

/* מחיר ממוצע משוקלל לפי כמות, רק ביחידת המידה העיקרית של המק"ט.
   ממוצע פשוט של מחירי השורות היה מטעה כשהכמויות שונות בסדר גודל. */
export function wapOf(idx, itemIdx) {
  const u = M.itemUnit[itemIdx];
  let q = 0, a = 0;
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    if (M.i[k] !== itemIdx || M.u[k] !== u || !(M.q[k] > 0)) continue;
    q += M.q[k]; a += M.a[k];
  }
  return q > 0 ? { wap: a / q, qty: q, amt: a, unit: UNIT(u) } : null;
}
/* אותו חישוב לכל המק"טים במעבר אחד — נדרש בכל מסך שמשווה תקופות. */
export function wapMap(idx) {
  const m = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j], it = M.i[k];
    if (M.u[k] !== M.itemUnit[it] || !(M.q[k] > 0)) continue;
    let o = m.get(it);
    if (!o) { o = { q: 0, a: 0 }; m.set(it, o); }
    o.q += M.q[k]; o.a += M.a[k];
  }
  return m;
}
export function lastPrice(idx, itemIdx) {
  let bd = -1, bp = null, bs = null;
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    if (M.i[k] !== itemIdx || !(M.ilsU[k] > 0)) continue;
    if (M.d[k] > bd) { bd = M.d[k]; bp = M.ilsU[k]; bs = M.s[k]; }
  }
  return bp == null ? null : { d: bd, p: bp, s: bs };
}
