// מסכי המחירים והקטגוריות: מודיעין מחירים, השוואה בין שנים, ניהול קטגוריות,
// השוואת ספקים והתייקרויות.
import { esc } from '../../core/base.js';
import {
  M, F, IDX, idxWhere, scanWindow, priorYearIdx, curWindow, yoyUsable, invalidate,
  agg, sumBy, sum, nuniq, topMap, monthly, openIdx, wapOf, wapMap, lastPrice,
  dayOf, dstr, money, moneyC, num, pct, price, toDate, rebuildCats, LS, CAT_DEFAULT,
  SUPN, SUPID, ITEM, IDESC, UNIT, PTYP, CATN, MONS
} from './model.js';
import { priceGaps, priceDelta } from './analytics.js';
import { EL, panel, tiles, table, barRows, barCell, trend, note, grp, kv, seg } from './ui.js';
import { hbar, lines, scatter, heatmap, waterfall, cssv } from './charts.js';
import { supplierCard, itemCard, YOY_NOTE } from './views-core.js';

/* ======================= 05 · מודיעין מחירים ======================= */
export function viewPrice(root, idx, ctx) {
  const st = ctx.state('price', { thr: 5, mode: 'yoy' });
  const prv = priorYearIdx(), w = curWindow();
  if (!yoyUsable() && st.mode === 'yoy') note(root, YOY_NOTE, 'warn');

  const ctl = panel(root, 'הגדרות השוואה', 'כל המחירים משוקללים לפי כמות, ביחידת המידה העיקרית של המק״ט');
  const r = EL('div', { class: 'inline-form' });
  r.append(EL('label', { class: 'flbl', text: 'בסיס השוואה' }),
    seg([['yoy', 'תקופה מקבילה בשנה קודמת'], ['hist', 'כל ההיסטוריה שלפני התקופה']], st.mode, v => { st.mode = v; ctx.redraw(); }),
    EL('label', { class: 'flbl', text: 'סף התייקרות' }),
    EL('input', { class: 'inp', type: 'number', value: st.thr, min: 0, max: 100, step: 1, onchange: e => { st.thr = +e.target.value || 0; ctx.redraw(); } }),
    EL('span', { text: '%' }));
  ctl.appendChild(r);

  const basis = st.mode === 'yoy' ? prv : scanWindow(null, w.from - 1);
  const pd = priceDelta(idx, basis).filter(x => x.comparable);
  if (!pd.length) { note(root, 'אין בסיס השוואה תקין: לא נמצאו מק״טים בני-השוואה שנרכשו גם בתקופה הנבחרת וגם בתקופת הבסיס, באותה יחידת מידה. ההשוואה אינה זמינה בסינון הזה.', 'warn'); return; }

  const up = pd.filter(x => x.delta >= st.thr).sort((a, b) => b.priceEffect - a.priceEffect);
  const down = pd.filter(x => x.delta <= -st.thr).sort((a, b) => a.priceEffect - b.priceEffect);
  const priceEff = pd.reduce((s, x) => s + x.priceEffect, 0);
  const volEff = pd.reduce((s, x) => s + x.volEffect, 0);

  tiles(root, [
    { k: 'מק״טים שהתייקרו', v: num(up.length), d: `השפעת מחיר ${moneyC(up.reduce((s, x) => s + x.priceEffect, 0))}`, lead: true },
    { k: 'מק״טים שהוזלו', v: num(down.length), d: `השפעת מחיר ${moneyC(down.reduce((s, x) => s + x.priceEffect, 0))}` },
    { k: 'השפעת מחיר נטו', v: moneyC(priceEff), d: 'שינוי מחיר × כמות התקופה', hint: '(מחיר נוכחי − מחיר בסיס) × כמות שנרכשה כעת' },
    { k: 'השפעת כמות נטו', v: moneyC(volEff), d: 'שינוי כמות × מחיר בסיס' },
    { k: 'בסיס ההשוואה', v: num(pd.length) + ' מק״טים', d: `${num(basis.length)} שורות בתקופת הבסיס` }
  ]);
  note(root, 'מק״טים שסומנו כקודי מרכז-עלות — יחידה שאינה מדידה ופיזור מחירים מעל פי 10 — מוחרגים מכל הניתוח הזה. מחיר יחידה עליהם אינו נתון בר-השוואה.');

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'המק״טים שתרמו הכי הרבה להתייקרות', 'השפעת מחיר בשקלים — לא באחוזים');
    hbar(b, up.slice(0, 14).map(x => [IDESC(x.it) || ITEM(x.it), x.priceEffect, x.it]), { labelW: 165, color: cssv('--up'), onClick: q => itemCard(q[2]) });
  }
  {
    const b = panel(g, 'המק״טים שהוזלו', 'חיסכון שנצבר בפועל');
    if (!down.length) b.appendChild(EL('p', { class: 'note', text: 'לא נמצאו הוזלות מעל הסף.' }));
    else hbar(b, down.slice(0, 14).map(x => [IDESC(x.it) || ITEM(x.it), -x.priceEffect, x.it]), { labelW: 165, color: cssv('--down'), onClick: q => itemCard(q[2]) });
  }
  {
    const b = panel(g, 'ספקים שמעלים מחירים בעקביות', 'שיעור המק״טים שהתייקרו אצל כל ספק, מתוך המק״טים בני-ההשוואה שלו');
    const sg = new Map(), i2s = new Map();
    for (let j = 0; j < idx.length; j++) {
      const k = idx[j];
      let s = i2s.get(M.i[k]);
      if (!s) { s = new Set(); i2s.set(M.i[k], s); }
      s.add(M.s[k]);
    }
    for (const x of pd) for (const si of (i2s.get(x.it) || [])) {
      let o = sg.get(si);
      if (!o) { o = { n: 0, up: 0, eff: 0 }; sg.set(si, o); }
      o.n++; if (x.delta >= st.thr) o.up++; o.eff += x.priceEffect;
    }
    const rows = [...sg.entries()].filter(([, o]) => o.n >= 3).map(([si, o]) => ({ _si: si, sup: SUPN(si), n: o.n, up: o.up, rate: o.up / o.n * 100, eff: o.eff })).sort((a, b2) => b2.eff - a.eff).slice(0, 15);
    if (!rows.length) b.appendChild(EL('p', { class: 'note', text: 'אין ספקים עם לפחות 3 מק״טים בני-השוואה בתקופה.' }));
    else table(b, [
      { k: 'sup', t: 'ספק', w: true }, { k: 'n', t: 'מק״טים בהשוואה', n: true }, { k: 'up', t: 'מהם התייקרו', n: true },
      { k: 'rate', t: 'שיעור', n: true, f: v => `<span class="${v > 60 ? 'up' : v < 30 ? 'down' : 'flat'}">${v.toFixed(0)}%</span>` },
      { k: 'eff', t: 'השפעת מחיר', n: true, f: v => money(v) }
    ], rows, { all: true, sort: 4, name: 'ספקים מעלי מחירים', onRow: r2 => supplierCard(r2._si) });
  }
  {
    const b = panel(g, 'מחיר אחרון מול ממוצע היסטורי', 'מק״טים שבהם ההזמנה האחרונה יקרה מהממוצע המשוקלל של כל ההיסטוריה');
    const histAll = wapMap(scanWindow(null, null));
    const spendNow = sumBy(idx, M.i, M.a);
    const lastNow = new Map();
    for (let j = 0; j < idx.length; j++) {
      const k = idx[j];
      if (!(M.ilsU[k] > 0)) continue;
      const o = lastNow.get(M.i[k]);
      if (!o || M.d[k] > o.d) lastNow.set(M.i[k], { d: M.d[k], p: M.ilsU[k], s: M.s[k] });
    }
    const rows = [];
    for (const [it, lp] of lastNow) {
      if (!M.itemComparable[it] || M.itemCatchAll[it]) continue;
      const h = histAll.get(it);
      if (!h || !(h.q > 0)) continue;
      const hw = h.a / h.q;
      if (!(hw > 0)) continue;
      const d = (lp.p / hw - 1) * 100;
      if (d < st.thr) continue;
      rows.push({ _it: it, desc: IDESC(it) || ITEM(it), hist: hw, last: lp.p, d, sup: SUPN(lp.s), when: dstr(lp.d), spend: spendNow.get(it) || 0 });
    }
    rows.sort((a, b2) => b2.spend * b2.d - a.spend * a.d);
    if (!rows.length) b.appendChild(EL('p', { class: 'note', text: 'אין מק״טים שבהם המחיר האחרון חורג מהממוצע ההיסטורי מעל הסף.' }));
    else table(b, [
      { k: 'desc', t: 'מק״ט', w: true },
      { k: 'hist', t: 'ממוצע היסטורי', n: true, f: v => price(v) },
      { k: 'last', t: 'מחיר אחרון', n: true, f: v => price(v) },
      { k: 'd', t: 'פער', n: true, f: v => `<span class="up">${pct(v, 0)}</span>` },
      { k: 'sup', t: 'ספק אחרון', w: true }, { k: 'when', t: 'מתי' },
      { k: 'spend', t: 'הוצאה בתקופה', n: true, f: v => money(v) }
    ], rows.slice(0, 60), { size: 10, sort: 6, name: 'מחיר אחרון מול היסטורי', onRow: r2 => itemCard(r2._it) });
  }
  {
    const b = panel(g, 'פערי מחיר לאותו מק״ט בין ספקים', 'יחידת מידה זהה, לפחות שני ספקים עם 2 הזמנות ומעלה');
    const gaps = priceGaps(idx).slice(0, 20);
    if (!gaps.length) b.appendChild(EL('p', { class: 'note', text: 'לא נמצאו פערים בני-השוואה.' }));
    else table(b, [
      { k: 'desc', t: 'מק״ט', w: true }, { k: 'unit', t: 'יח׳' }, { k: 'nsup', t: 'ספקים', n: true },
      { k: 'best', t: 'המחיר הטוב', n: true, f: v => price(v) },
      { k: 'worst', t: 'הגבוה', n: true, f: v => price(v) },
      { k: 'gapPct', t: 'פער', n: true, f: v => `<span class="up">${v.toFixed(0)}%</span>` },
      { k: 'save', t: 'פוטנציאל', n: true, f: v => `<b>${money(v)}</b>` },
      { k: 'conf', t: 'ביטחון', f: v => `<span class="pill ${v === 'גבוהה' ? 'ok' : v === 'בינונית' ? 'medium' : 'low'}">${v}</span>` }
    ], gaps.map(x => ({ _it: x.it, desc: IDESC(x.it) || ITEM(x.it), unit: x.unit, nsup: x.nsup, best: x.target.wap, worst: Math.max(...x.rows.map(y => y.wap)), gapPct: x.gapPct, save: x.save, conf: x.conf })),
    { size: 10, sort: 6, name: 'פערי מחיר', onRow: r2 => itemCard(r2._it) });
  }

  const t = panel(root, 'כל שינויי המחיר', 'מק״טים בני-השוואה שנרכשו בשתי התקופות');
  table(t, [
    { k: 'desc', t: 'מק״ט', w: true }, { k: 'unit', t: 'יח׳' },
    { k: 'prv', t: 'מחיר בבסיס', n: true, f: v => price(v) },
    { k: 'cur', t: 'מחיר בתקופה', n: true, f: v => price(v) },
    { k: 'delta', t: 'שינוי', n: true, f: v => trend(v) },
    { k: 'qty', t: 'כמות', n: true, f: v => num(v, 1) },
    { k: 'priceEffect', t: 'השפעת מחיר', n: true, f: v => money(v) },
    { k: 'volEffect', t: 'השפעת כמות', n: true, f: v => money(v) },
    { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) }
  ], pd.map(x => ({ ...x, desc: IDESC(x.it) || ITEM(x.it) })), { size: 20, sort: 6, name: 'שינויי מחיר', onRow: r2 => itemCard(r2.it) });
}

/* ======================= 06 · השוואה בין שנים ======================= */
export function viewYoY(root, idx, ctx) {
  const ys = M.years;
  const st = ctx.state('yoy', { a: ys[ys.length - 2] ?? ys[0], b: ys[ys.length - 1], dim: 'sup' });
  const ctl = panel(root, 'בחירת תקופות', 'ההשוואה נחתכת לאותו חלק מהשנה בשתי התקופות, כדי ששנה חלקית לא תיראה כירידה');
  const r = EL('div', { class: 'inline-form' });
  const mkSel = (v, on) => {
    const s = EL('select', { class: 'inp', style: 'width:auto', onchange: e => on(+e.target.value) });
    ys.forEach(y => s.appendChild(EL('option', { value: y, selected: y === v ? 'selected' : null, text: String(y) })));
    return s;
  };
  r.append(EL('label', { class: 'flbl', text: 'תקופה א׳' }), mkSel(st.a, v => { st.a = v; ctx.redraw(); }),
    EL('label', { class: 'flbl', text: 'תקופה ב׳' }), mkSel(st.b, v => { st.b = v; ctx.redraw(); }),
    EL('label', { class: 'flbl', text: 'פילוח' }),
    seg([['sup', 'ספק'], ['styp', 'סוג ספק'], ['cat', 'קטגוריה'], ['item', 'מק״ט'], ['ptyp', 'סוג הזמנה']], st.dim, v => { st.dim = v; ctx.redraw(); }));
  ctl.appendChild(r);

  const inB = scanWindow(dayOf(st.b, 1, 1), dayOf(st.b, 12, 31));
  let lastB = dayOf(st.b, 1, 1);
  for (let j = 0; j < inB.length; j++) if (M.d[inB[j]] > lastB) lastB = M.d[inB[j]];
  const tB = toDate(lastB), cutM = tB.getUTCMonth() + 1, cutD = tB.getUTCDate();
  const A = scanWindow(dayOf(st.a, 1, 1), dayOf(st.a, cutM, cutD));
  const B = scanWindow(dayOf(st.b, 1, 1), dayOf(st.b, cutM, cutD));
  const sA = sum(A, M.a), sB = sum(B, M.a);
  ctl.appendChild(EL('p', { class: 'note', text: `ההשוואה מוגבלת ל-1 בינואר עד ${cutD}/${cutM} בכל אחת מהשנים.` }));

  tiles(root, [
    { k: `רכש ${st.a}`, v: moneyC(sA), d: `${num(nuniq(A, M.p))} הזמנות · ${num(A.length)} שורות` },
    { k: `רכש ${st.b}`, v: moneyC(sB), d: `${num(nuniq(B, M.p))} הזמנות · ${num(B.length)} שורות`, lead: true },
    { k: 'שינוי באחוזים', v: `<span class="${sB > sA ? 'up' : 'down'}">${pct(sA ? (sB / sA - 1) * 100 : null)}</span>`, d: 'מתקופה א׳ לתקופה ב׳' },
    { k: 'שינוי בשקלים', v: moneyC(sB - sA), d: sB > sA ? 'גידול בהוצאה' : 'קיטון בהוצאה' },
    { k: 'ספקים', v: `${num(nuniq(A, M.s))} ← ${num(nuniq(B, M.s))}`, d: 'מספר ספקים פעילים' },
    { k: 'מק״טים', v: `${num(nuniq(A, M.i))} ← ${num(nuniq(B, M.i))}`, d: 'מספר מק״טים' }
  ]);

  const pd = priceDelta(B, A).filter(x => x.comparable);
  const pe = pd.reduce((s, x) => s + x.priceEffect, 0);
  const ve = pd.reduce((s, x) => s + x.volEffect, 0);
  const cov = pd.reduce((s, x) => s + x.spend, 0);
  const mixed = (sB - sA) - pe - ve;

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'מאיפה בא השינוי', 'פירוק ההפרש בין התקופות: מחיר, כמות ותמהיל');
    waterfall(b, [`רכש ${st.a}`, 'השפעת מחיר', 'השפעת כמות', 'תמהיל ומק״טים חדשים', `רכש ${st.b}`], [pe, ve, mixed], sA, sB);
    b.appendChild(EL('p', { class: 'banner', html: `השפעת מחיר <b>${money(pe)}</b> והשפעת כמות <b>${money(ve)}</b> מחושבות על ${num(pd.length)} מק״טים בני-השוואה שנרכשו בשתי התקופות (${(cov / sB * 100).toFixed(0)}% מהרכש בתקופה ב׳). היתרה (${money(mixed)}) היא תמהיל: מק״טים שנכנסו או יצאו, וקודי מרכז-עלות שלא ניתן לפרק.` }));
  }
  {
    const b = panel(g, 'מגמה חודשית בשתי התקופות');
    const mA = monthly(A), mB = monthly(B);
    lines(b, MONS.slice(0, Math.max(mA.x.length, mB.x.length)), [
      { name: String(st.a), data: mA.v, color: cssv('--ink3') },
      { name: String(st.b), data: mB.v, area: true, color: cssv('--accent') }
    ], { height: '280px' });
  }

  const dims = {
    sup: { arr: M.s, name: SUPN, lbl: 'ספק', click: supplierCard },
    styp: { arr: M.styp, name: n => M.dims.styp[n], lbl: 'סוג ספק' },
    cat: { arr: M.cat, name: CATN, lbl: 'קטגוריה' },
    item: { arr: M.i, name: it => IDESC(it) || ITEM(it), lbl: 'מק״ט', click: itemCard },
    ptyp: { arr: M.pt, name: PTYP, lbl: 'סוג הזמנה' }
  }[st.dim];
  const a = sumBy(A, dims.arr, M.a), b2 = sumBy(B, dims.arr, M.a);
  const qa = sumBy(A, dims.arr, M.q), qb = sumBy(B, dims.arr, M.q);
  const keys = [...new Set([...a.keys(), ...b2.keys()])];
  const rows = keys.map(k => {
    const x = a.get(k) || 0, y = b2.get(k) || 0;
    return { _g: k, name: dims.name(k), a: x, b: y, abs: y - x, pct: x ? (y / x - 1) * 100 : null, qa: qa.get(k) || 0, qb: qb.get(k) || 0, qpct: qa.get(k) ? ((qb.get(k) || 0) / qa.get(k) - 1) * 100 : null };
  }).sort((x, y) => Math.abs(y.abs) - Math.abs(x.abs));

  {
    const b = panel(g, 'הגדלות וקיטונים מובילים', `${dims.lbl} · 16 השינויים הגדולים בשקלים`);
    hbar(b, rows.slice(0, 16).map(x => [x.name, x.abs, x._g]), { labelW: 155, color: cssv('--c2'), onClick: dims.click ? q => dims.click(q[2]) : null });
  }
  {
    const b = panel(g, 'השוואת מחירי יחידה', 'מק״טים בני-השוואה מעל 100 אלף ₪ הוצאה');
    const big = pd.filter(x => x.spend > 1e5).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 16);
    if (!big.length) b.appendChild(EL('p', { class: 'note', text: 'אין מק״טים העונים על התנאים.' }));
    else hbar(b, big.map(x => [IDESC(x.it) || ITEM(x.it), x.delta, x.it]), { labelW: 165, fmt: v => pct(v, 0), color: cssv('--c5'), onClick: q => itemCard(q[2]) });
  }

  const t = panel(root, `השוואה מלאה לפי ${dims.lbl}`);
  table(t, [
    { k: 'name', t: dims.lbl, w: true },
    { k: 'a', t: `רכש ${st.a}`, n: true, f: v => money(v) },
    { k: 'b', t: `רכש ${st.b}`, n: true, f: v => money(v) },
    { k: 'abs', t: 'שינוי ₪', n: true, f: v => money(v) },
    { k: 'pct', t: 'שינוי %', n: true, f: v => trend(v) },
    { k: 'qa', t: `כמות ${st.a}`, n: true, f: v => num(v, 1) },
    { k: 'qb', t: `כמות ${st.b}`, n: true, f: v => num(v, 1) },
    { k: 'qpct', t: 'שינוי כמות', n: true, f: v => trend(v) }
  ], rows, { size: 20, sort: 3, name: 'השוואה בין שנים', onRow: dims.click ? r2 => dims.click(r2._g) : null });
}

/* ======================= 07 · ניהול קטגוריות ======================= */
export function viewCategories(root, idx, ctx) {
  const ctl = panel(root, 'בסיס הקטגוריה', 'בקובץ המקור אין עמודת קטגוריה. שלושת הבסיסים כאן נגזרים מהשדות שכן קיימים.');
  ctl.appendChild(seg([['map', 'קטגוריות ממופות (מסוג ספק)'], ['styp', 'סוג ספק כפי שהוא'], ['ptyp', 'סוג הזמנת רכש']],
    M.catBasis, v => { M.catBasis = v; LS('catbasis', v); rebuildCats(); invalidate(); ctx.refresh(); }));
  ctl.appendChild(EL('p', { class: 'note', text: 'שני השדות שמאפשרים פילוח הם סוג ספק (כימיקלים ושרפים, שקים, אנרגיה…) וסוג הזמנת רכש (מחסן טכני, אחזקה, פרוייקטים…). הקטגוריות הממופות הן תרגום של סוגי הספקים לקטגוריות רכש, וניתן לערוך אותו בטבלה למטה.' }));

  const tot = sum(idx, M.a), prv = priorYearIdx();
  const ca = agg(idx, M.cat, { spend: [M.a, 'sum'], open: [M.openILS, 'sum'], pos: [M.p, 'nuniq'], sups: [M.s, 'nuniq'], items: [M.i, 'nuniq'] });
  const old = sumBy(prv, M.cat, M.a);
  const gaps = priceGaps(idx);
  const i2c = new Map();
  for (let j = 0; j < idx.length; j++) { const k = idx[j]; if (!i2c.has(M.i[k])) i2c.set(M.i[k], M.cat[k]); }
  const gapByCat = new Map();
  for (const x of gaps) gapByCat.set(i2c.get(x.it), (gapByCat.get(i2c.get(x.it)) || 0) + x.save);

  const rows = [...ca.entries()].map(([ci, o]) => ({
    _c: ci, name: CATN(ci), spend: o.spend, share: o.spend / tot * 100,
    prv: old.get(ci) || 0, delta: old.get(ci) ? (o.spend / old.get(ci) - 1) * 100 : null,
    pos: o.pos, sups: o.sups, items: o.items, open: o.open, save: gapByCat.get(ci) || 0, avg: o.spend / o.pos
  })).sort((a, b) => b.spend - a.spend);

  tiles(root, [
    { k: 'קטגוריות פעילות', v: num(rows.length), d: 'בבסיס שנבחר', lead: true },
    { k: 'הקטגוריה הגדולה', v: rows[0] ? moneyC(rows[0].spend) : '—', d: rows[0] ? rows[0].name : '' },
    { k: 'פוטנציאל התייעלות מזוהה', v: moneyC(rows.reduce((s, r) => s + r.save, 0)), d: 'מפערי מחיר בני-השוואה' },
    { k: 'התחייבויות פתוחות', v: moneyC(rows.reduce((s, r) => s + r.open, 0)), d: 'יתרה לאספקה בכל הקטגוריות' }
  ]);

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'היקף כספי לפי קטגוריה');
    barRows(b, rows.slice(0, 14).map(r => [r.name, r.spend, r._c]), { onClick: r => { F.cat.clear(); F.cat.add(r[2]); ctx.refresh(); } });
  }
  {
    const b = panel(g, 'מגמה לפי קטגוריה', '6 הקטגוריות הגדולות, לפי חודש');
    const top = rows.slice(0, 6).map(r => r._c);
    const mo = monthly(idx);
    const perCat = new Map();
    for (let j = 0; j < idx.length; j++) {
      const k = idx[j];
      if (!top.includes(M.cat[k])) continue;
      let mm = perCat.get(M.cat[k]);
      if (!mm) { mm = new Map(); perCat.set(M.cat[k], mm); }
      mm.set(M.ym[k], (mm.get(M.ym[k]) || 0) + M.a[k]);
    }
    lines(b, mo.x, top.map(ci => ({ name: CATN(ci), data: mo.keys.map(k => (perCat.get(ci) || new Map()).get(k) || 0) })), { height: '280px' });
  }
  {
    const b = panel(g, 'מפת החום של הקטגוריות', 'הוצאה לפי קטגוריה וחודש');
    const top = rows.slice(0, 12);
    const mo = monthly(idx);
    const perCat = new Map();
    for (let j = 0; j < idx.length; j++) {
      const k = idx[j];
      let mm = perCat.get(M.cat[k]);
      if (!mm) { mm = new Map(); perCat.set(M.cat[k], mm); }
      mm.set(M.ym[k], (mm.get(M.ym[k]) || 0) + M.a[k]);
    }
    const data = [];
    top.forEach((r, yi) => mo.keys.forEach((k, xi) => data.push([xi, yi, (perCat.get(r._c) || new Map()).get(k) || 0])));
    heatmap(b, mo.x, top.map(r => r.name), data);
  }
  {
    const b = panel(g, 'ספקים מרכזיים בכל קטגוריה');
    const out = rows.slice(0, 10).map(r => {
      const sub = idxWhere(k => M.cat[k] === r._c);
      const t3 = topMap(sumBy(sub, M.s, M.a), 3);
      return { name: r.name, spend: r.spend, sups: t3.map(([si, v]) => `${SUPN(si)} (${(v / r.spend * 100).toFixed(0)}%)`).join(' · '), conc: t3.reduce((s, x) => s + x[1], 0) / r.spend * 100 };
    });
    table(b, [
      { k: 'name', t: 'קטגוריה', w: true }, { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) },
      { k: 'sups', t: 'שלושת הספקים המרכזיים', w: true },
      { k: 'conc', t: 'ריכוזיות', n: true, f: v => `<span class="${v > 80 ? 'up' : 'flat'}">${v.toFixed(0)}%</span>` }
    ], out, { all: true, sort: 1, name: 'ספקים לפי קטגוריה' });
  }

  const t = panel(root, 'טבלת הקטגוריות');
  table(t, [
    { k: 'name', t: 'קטגוריה', w: true },
    { k: 'spend', t: 'הוצאה', n: true, f: v => barCell(v, rows[0].spend) },
    { k: 'share', t: 'חלק', n: true, f: v => v.toFixed(1) + '%' },
    { k: 'prv', t: 'תקופה מקבילה', n: true, f: v => v ? money(v) : '—' },
    { k: 'delta', t: 'שינוי', n: true, f: v => trend(v) },
    { k: 'sups', t: 'ספקים', n: true }, { k: 'items', t: 'מק״טים', n: true }, { k: 'pos', t: 'הזמנות', n: true },
    { k: 'avg', t: 'הזמנה ממוצעת', n: true, f: v => money(v) },
    { k: 'open', t: 'יתרה פתוחה', n: true, f: v => v ? money(v) : '—' },
    { k: 'save', t: 'פוטנציאל התייעלות', n: true, f: v => v ? `<b>${money(v)}</b>` : '—' }
  ], rows, { all: true, sort: 1, name: 'קטגוריות', onRow: r => { F.cat.clear(); F.cat.add(r._c); ctx.refresh(); } });

  if (M.catBasis === 'map') {
    const mp = panel(root, 'מפת הקטגוריות', 'כל סוג ספק מהקובץ ממופה לקטגוריית רכש. השינוי נשמר בדפדפן שלך ומשפיע על כל המסכים.');
    const cats = [...new Set([...Object.values(M.catMap), 'חומרי גלם', 'כימיקלים', 'אריזות', 'אנרגיה', 'הובלות ולוגיסטיקה', 'אחזקה, ציוד וחלקי חילוף', 'שירותים וקבלנים', 'רכש עקיף ושירותים', 'השקעות ופרויקטים', 'אחרים', 'לא מסווג'])];
    const spendByStyp = sumBy(scanWindow(null, null), M.styp, M.a);
    const tw = EL('div', { class: 'tblwrap' });
    tw.innerHTML = '<table><thead><tr><th>סוג ספק בקובץ</th><th class="num">הוצאה (כל התקופות)</th><th>קטגוריית רכש</th></tr></thead><tbody>' +
      M.dims.styp.map((s, n) => {
        const key = s === 'ללא סיווג' ? '' : s;
        return `<tr><td>${esc(s)}</td><td class="num">${money(spendByStyp.get(n) || 0)}</td><td><select class="inp" style="width:auto" data-styp="${esc(key)}">${
          cats.map(c2 => `<option${(M.catMap[key] || 'אחרים') === c2 ? ' selected' : ''}>${esc(c2)}</option>`).join('')}</select></td></tr>`;
      }).join('') + '</tbody></table>';
    mp.appendChild(tw);
    const act = EL('div', { class: 'inline-form', style: 'margin-top:12px' });
    act.append(
      EL('button', { class: 'btn primary', text: 'שמור את המיפוי', onclick: () => {
        tw.querySelectorAll('[data-styp]').forEach(s => { M.catMap[s.dataset.styp] = s.value; });
        LS('catmap', M.catMap); rebuildCats(); invalidate(); ctx.refresh();
      } }),
      EL('button', { class: 'btn', text: 'חזרה למפה המוצעת', onclick: () => {
        M.catMap = Object.assign({}, CAT_DEFAULT); LS('catmap', {}); rebuildCats(); invalidate(); ctx.refresh();
      } }));
    mp.appendChild(act);
  }
}

/* ======================= 13 · השוואת ספקים ======================= */
export function viewCompare(root, idx, ctx) {
  const all = topMap(sumBy(idx, M.s, M.a));
  const st = ctx.state('cmp', { sel: all.slice(0, 2).map(x => x[0]) });
  const ctl = panel(root, 'בחירת ספקים', 'עד 4 ספקים · מדורג לפי היקף בתקופה המסוננת');
  const r = EL('div', { class: 'inline-form' });
  for (let n = 0; n < 4; n++) {
    const sel = EL('select', { class: 'inp', style: 'width:auto;max-width:230px', onchange: e => {
      const v = e.target.value === '' ? null : +e.target.value;
      const cur = st.sel.slice();
      cur[n] = v;
      st.sel = [...new Set(cur.filter(x => x != null))].slice(0, 4);
      ctx.redraw();
    } });
    sel.appendChild(EL('option', { value: '', text: '— ללא —' }));
    all.slice(0, 400).forEach(([si, v]) => sel.appendChild(EL('option', { value: si, selected: st.sel[n] === si ? 'selected' : null, text: `${SUPN(si)} · ${moneyC(v)}` })));
    r.appendChild(sel);
  }
  ctl.appendChild(r);

  const sel = st.sel.filter(si => si != null);
  if (sel.length < 2) { note(root, 'בחר לפחות שני ספקים כדי להשוות.'); return; }

  const data = sel.map(si => {
    const sub = idxWhere(k => M.s[k] === si);
    return {
      si, sub, spend: sum(sub, M.a), pos: nuniq(sub, M.p), items: nuniq(sub, M.i), lines: sub.length,
      open: sum(openIdx(sub), M.openILS), avg: sum(sub, M.a) / Math.max(1, nuniq(sub, M.p)),
      styp: M.dims.styp[M.supStyp[si]], terms: (M.dims.supInfo[si] || {}).terms || '—'
    };
  });

  const cmpT = panel(root, 'השוואה כללית');
  const metrics = [
    ['היקף רכש בתקופה', d => money(d.spend)], ['מספר הזמנות', d => num(d.pos)],
    ['שורות הזמנה', d => num(d.lines)], ['שווי הזמנה ממוצע', d => money(d.avg)],
    ['מספר מק״טים', d => num(d.items)], ['יתרה פתוחה', d => d.open ? money(d.open) : '—'],
    ['סוג ספק', d => esc(d.styp)], ['תנאי תשלום', d => esc(d.terms)]
  ];
  const tw = EL('div', { class: 'tblwrap' });
  tw.innerHTML = '<table><thead><tr><th>מדד</th>' + data.map(d => `<th class="num">${esc(SUPN(d.si))}</th>`).join('') + '</tr></thead><tbody>' +
    metrics.map(([n, f]) => `<tr><td>${esc(n)}</td>${data.map(d => `<td class="num">${f(d)}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
  cmpT.appendChild(tw);

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'התפתחות היקף הרכש', 'לפי חודש');
    const mo = monthly(idx);
    lines(b, mo.x, data.map(d => {
      const mm = sumBy(d.sub, M.ym, M.a);
      return { name: SUPN(d.si), data: mo.keys.map(k => mm.get(k) || 0) };
    }), { height: '280px' });
  }
  {
    const b = panel(g, 'פערים כספיים לפי שנה');
    const ys = M.years;
    lines(b, ys.map(String), data.map(d => {
      const mm = sumBy(d.sub, M.y, M.a);
      return { name: SUPN(d.si), type: 'bar', data: ys.map(y => mm.get(y) || 0) };
    }), { height: '280px' });
  }

  // מק"טים משותפים — רק באותה יחידת מידה
  const sets = data.map(d => {
    const s2 = new Map();
    for (let j = 0; j < d.sub.length; j++) {
      const k = d.sub[j];
      if (!(M.q[k] > 0)) continue;
      const key = M.i[k] * 16 + M.u[k];
      let o = s2.get(key);
      if (!o) { o = { q: 0, a: 0 }; s2.set(key, o); }
      o.q += M.q[k]; o.a += M.a[k];
    }
    return s2;
  });
  const shared = [...sets[0].keys()].filter(k => sets.every(s2 => s2.has(k)));
  {
    const b = panel(g, 'מחירים למק״טים משותפים', 'רק מק״טים שנרכשו מכל הספקים שנבחרו באותה יחידת מידה');
    if (!shared.length) b.appendChild(EL('p', { class: 'banner warn', text: 'אין מק״טים משותפים באותה יחידת מידה בין הספקים שנבחרו. השוואת מחירים אינה זמינה — השוואה בין מוצרים במפרט או ביחידות שונים הייתה מטעה.' }));
    else {
      const rows = shared.map(key => {
        const it = Math.floor(key / 16), u = key % 16;
        const o = { _it: it, desc: IDESC(it) || ITEM(it), unit: UNIT(u) };
        let best = Infinity;
        sets.forEach((s2, n) => { const x = s2.get(key); o['p' + n] = x.a / x.q; o['q' + n] = x.q; if (o['p' + n] < best) best = o['p' + n]; });
        o.best = best;
        o.gap = Math.max(...sets.map((_, n) => o['p' + n])) / best - 1;
        o.save = sets.reduce((s2, _, n) => s2 + Math.max(0, (o['p' + n] - best) * o['q' + n]), 0);
        return o;
      }).sort((a, b2) => b2.save - a.save);
      const cols = [{ k: 'desc', t: 'מק״ט', w: true }, { k: 'unit', t: 'יח׳' }];
      data.forEach((d, n) => cols.push({ k: 'p' + n, t: SUPN(d.si), n: true, f: (v, row) => v === row.best ? `<b class="down">${price(v)}</b>` : price(v) }));
      cols.push({ k: 'gap', t: 'פער', n: true, f: v => `<span class="up">${(v * 100).toFixed(0)}%</span>` },
        { k: 'save', t: 'פוטנציאל', n: true, f: v => v > 0 ? `<b>${money(v)}</b>` : '—' });
      table(b, cols, rows, { all: rows.length <= 15, size: 15, sort: cols.length - 1, name: 'מק״טים משותפים', onRow: row => itemCard(row._it) });
      const totSave = rows.reduce((s2, x) => s2 + x.save, 0);
      if (totSave > 0) b.appendChild(EL('p', { class: 'banner', text: `יישור כל המק״טים המשותפים למחיר הטוב מבין הספקים שנבחרו היה חוסך ${money(totSave)} על הכמויות שנרכשו בתקופה.` }));
    }
  }
  {
    const b = panel(g, 'חלופות רכש', 'מק״טים שספק אחד מספק והאחרים לא — מועמדים להרחבת סל אצל ספק קיים');
    const rows = [];
    data.forEach((d, n) => {
      const mine = new Set([...sets[n].keys()].map(k => Math.floor(k / 16)));
      const others = new Set();
      sets.forEach((s2, j) => { if (j !== n) [...s2.keys()].forEach(k => others.add(Math.floor(k / 16))); });
      const uniq = [...mine].filter(it => !others.has(it));
      const sm = sumBy(d.sub, M.i, M.a);
      uniq.sort((a, b2) => (sm.get(b2) || 0) - (sm.get(a) || 0)).slice(0, 8)
        .forEach(it => rows.push({ sup: SUPN(d.si), desc: IDESC(it) || ITEM(it), spend: sm.get(it) || 0, _it: it }));
    });
    if (!rows.length) b.appendChild(EL('p', { class: 'note', text: 'כל המק״טים משותפים לספקים שנבחרו.' }));
    else table(b, [{ k: 'sup', t: 'ספק' }, { k: 'desc', t: 'מק״ט ייחודי', w: true }, { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) }],
      rows, { all: true, sort: 2, name: 'מק״טים ייחודיים', onRow: row => itemCard(row._it) });
  }
}

/* ======================= 14 · התייקרויות ומניעי עלות ======================= */
export function viewInflation(root, idx, ctx) {
  const prv = priorYearIdx();
  if (!yoyUsable()) { note(root, YOY_NOTE, 'warn'); return; }
  const pd = priceDelta(idx, prv).filter(x => x.comparable);
  if (!pd.length) { note(root, 'אין בסיס השוואה: לא נמצאו מק״טים בני-השוואה שנרכשו גם בתקופה הנבחרת וגם בתקופה המקבילה בשנה קודמת.', 'warn'); return; }

  const pe = pd.reduce((s, x) => s + x.priceEffect, 0);
  const ve = pd.reduce((s, x) => s + x.volEffect, 0);
  const base = pd.reduce((s, x) => s + x.prvSpend, 0);
  const cov = pd.reduce((s, x) => s + x.spend, 0);
  const i2c = new Map(), i2s = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    if (!i2c.has(M.i[k])) i2c.set(M.i[k], M.cat[k]);
    let s = i2s.get(M.i[k]);
    if (!s) { s = new Set(); i2s.set(M.i[k], s); }
    s.add(M.s[k]);
  }

  tiles(root, [
    { k: 'שיעור ההתייקרות המשוקלל', v: pct(base ? pe / base * 100 : null), d: 'השפעת המחיר חלקי בסיס ההוצאה', lead: true, hint: 'מחושב רק על מק״טים בני-השוואה שנרכשו בשתי התקופות' },
    { k: 'השפעת מחיר בשקלים', v: moneyC(pe), d: pe > 0 ? 'תוספת עלות מהמחיר' : 'חיסכון מהמחיר' },
    { k: 'השפעת כמות בשקלים', v: moneyC(ve), d: ve > 0 ? 'תוספת מגידול כמותי' : 'קיטון כמותי' },
    { k: 'בסיס החישוב', v: moneyC(cov), d: `${num(pd.length)} מק״טים · ${(cov / sum(idx, M.a) * 100).toFixed(0)}% מהרכש בתקופה` }
  ]);
  note(root, 'השפעת מחיר = (מחיר נוכחי − מחיר בסיס) × כמות נוכחית. השפעת כמות = (כמות נוכחית − כמות בסיס) × מחיר בסיס. היתרה מול השינוי הכולל היא תמהיל — מק״טים שנכנסו או יצאו מהסל.');

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'שיעור ההתייקרות בכל קטגוריה', 'השפעת מחיר חלקי בסיס ההוצאה של אותה קטגוריה');
    const cm = new Map();
    pd.forEach(x => {
      const ci = i2c.get(x.it);
      let o = cm.get(ci);
      if (!o) { o = { pe: 0, ve: 0, base: 0, n: 0 }; cm.set(ci, o); }
      o.pe += x.priceEffect; o.ve += x.volEffect; o.base += x.prvSpend; o.n++;
    });
    const rows = [...cm.entries()].filter(([, o]) => o.base > 0).map(([ci, o]) => ({ _c: ci, name: CATN(ci), rate: o.pe / o.base * 100, pe: o.pe, ve: o.ve, base: o.base, n: o.n })).sort((a, b2) => b2.pe - a.pe);
    hbar(b, rows.slice(0, 12).map(r => [r.name, r.rate, r._c]), { labelW: 150, fmt: v => pct(v, 1), color: cssv('--up'), onClick: r => { F.cat.clear(); F.cat.add(r[2]); ctx.refresh(); } });
    table(b, [
      { k: 'name', t: 'קטגוריה', w: true }, { k: 'rate', t: 'שיעור התייקרות', n: true, f: v => trend(v) },
      { k: 'pe', t: 'השפעת מחיר', n: true, f: v => money(v) }, { k: 've', t: 'השפעת כמות', n: true, f: v => money(v) },
      { k: 'base', t: 'בסיס', n: true, f: v => money(v) }, { k: 'n', t: 'מק״טים', n: true }
    ], rows, { all: true, sort: 2, name: 'התייקרות לפי קטגוריה' });
  }
  {
    const b = panel(g, 'מי הניע את ההוצאה', 'כל נקודה היא מק״ט · אופקי: השפעת מחיר, אנכי: השפעת כמות');
    const pts = pd.filter(x => Math.abs(x.priceEffect) + Math.abs(x.volEffect) > 1e4).slice(0, 600)
      .map(x => [x.priceEffect, x.volEffect, IDESC(x.it) || ITEM(x.it), x.it]);
    scatter(b, pts, {
      xMoney: true, yMoney: true, cross: true,
      fmt: p => `${esc(p.data[2])}<br>השפעת מחיר ${money(p.data[0])}<br>השפעת כמות ${money(p.data[1])}`,
      color: p => p.data[0] > 0 ? (p.data[1] > 0 ? cssv('--up') : cssv('--warn')) : (p.data[1] > 0 ? cssv('--c2') : cssv('--down')),
      onClick: e => itemCard(e.data[3])
    });
    b.appendChild(EL('p', { class: 'note', text: 'ימין-למעלה: גם התייקר וגם גדלה הכמות. ימין-למטה: התייקר אף שהכמות קטנה — שם המשא ומתן הדחוף.' }));
  }
  {
    const b = panel(g, 'המק״טים שתרמו הכי הרבה להתייקרות', 'בשקלים, לא באחוזים');
    hbar(b, pd.filter(x => x.priceEffect > 0).sort((a, b2) => b2.priceEffect - a.priceEffect).slice(0, 14)
      .map(x => [IDESC(x.it) || ITEM(x.it), x.priceEffect, x.it]), { labelW: 165, color: cssv('--up'), onClick: r => itemCard(r[2]) });
  }
  {
    const b = panel(g, 'הספקים שתרמו הכי הרבה להתייקרות', 'השפעת המחיר של המק״טים שלהם, מיוחסת לספק');
    const sm = new Map();
    pd.forEach(x => {
      const sups = i2s.get(x.it) || new Set();
      const n = sups.size || 1;
      for (const si of sups) {
        let o = sm.get(si);
        if (!o) { o = { pe: 0 }; sm.set(si, o); }
        o.pe += x.priceEffect / n;
      }
    });
    const rows = [...sm.entries()].map(([si, o]) => [SUPN(si), o.pe, si]).sort((a, b2) => b2[1] - a[1]).slice(0, 14);
    hbar(b, rows, { labelW: 155, color: cssv('--warn'), onClick: r => supplierCard(r[2]) });
    b.appendChild(EL('p', { class: 'note', text: 'כאשר מק״ט נרכש מכמה ספקים, השפעת המחיר מחולקת ביניהם שווה בשווה. ייחוס מדויק דורש נתוני הסכם שאינם בקובץ.' }));
  }

  const t = panel(root, 'כל ההתייקרויות וההוזלות');
  table(t, [
    { k: 'desc', t: 'מק״ט', w: true }, { k: 'unit', t: 'יח׳' },
    { k: 'prv', t: 'מחיר בסיס', n: true, f: v => price(v) },
    { k: 'cur', t: 'מחיר נוכחי', n: true, f: v => price(v) },
    { k: 'delta', t: 'שינוי מחיר', n: true, f: v => trend(v) },
    { k: 'priceEffect', t: 'השפעת מחיר ₪', n: true, f: v => money(v) },
    { k: 'volEffect', t: 'השפעת כמות ₪', n: true, f: v => money(v) },
    { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) }
  ], pd.map(x => ({ ...x, desc: IDESC(x.it) || ITEM(x.it) })), { size: 20, sort: 5, name: 'התייקרויות', onRow: r => itemCard(r.it) });
}
