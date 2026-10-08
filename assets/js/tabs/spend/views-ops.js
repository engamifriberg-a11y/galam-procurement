// מסכי התפעול, ההזדמנויות והסיכונים: חיסכון, מרכז התייעלות, תלות בספקים,
// הזמנות, התחייבויות פתוחות, מגמות ביקוש, יעילות, תחזית והתראות.
import { esc, send, get, clearCache } from '../../core/base.js';
import {
  M, F, IDX, idxWhere, scanWindow, priorYearIdx, curWindow, yoyUsable,
  agg, sumBy, sum, nuniq, topMap, monthly, openIdx, poAgg, supAgg,
  dayOf, dstr, toDate, money, moneyC, num, pct, price, ymstr, MON, MONS, MEASURABLE,
  SUPN, SUPID, ITEM, IDESC, UNIT, PTYP, STAT, BUY, CATN
} from './model.js';
import { priceGaps, buildOpportunities, buildAlerts, findDuplicates, forecast, ACFG, oid } from './analytics.js';
import { EL, panel, tiles, table, barRows, barCell, trend, note, grp, kv, seg, drill, drawer, toast, LINE_COLS, lineRows } from './ui.js';
import { hbar, lines, scatter, cssv, box, draw } from './charts.js';
import { supplierCard, itemCard, YOY_NOTE } from './views-core.js';

const STATUSES = ['זוהתה', 'בבדיקה', 'במשא ומתן', 'אושרה', 'מומשה', 'נדחתה'];
const statusPill = s => `<span class="pill ${s === 'מומשה' ? 'ok' : s === 'אושרה' ? 'wait' : s === 'נדחתה' ? 'off' : s === 'במשא ומתן' ? 'medium' : 'low'}">${esc(s || 'זוהתה')}</span>`;

/* שמירת שורת מעקב. מעדכן מקומית מיד ושולח לשרת ברקע, כמו בלשונית החוזים. */
async function saveTrack(ctx, coll, id, patch) {
  const store = coll === 'targets' ? ctx.track.targets : ctx.track.opps;
  store[id] = { ...(store[id] || {}), ...patch };
  const r = await send(`/api/spend?track=${coll}`, 'PUT', { id, patch });
  clearCache();
  if (!r.ok) toast('השמירה נכשלה — נסה שוב');
  else toast('נשמר');
}
function trackInput(ctx, coll, id, field, val, opts) {
  if (opts) return `<select class="inp" style="width:auto" data-tr="${esc(id)}" data-f="${field}" data-coll="${coll}">${opts.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  return `<input class="inp" style="width:110px;text-align:start" data-tr="${esc(id)}" data-f="${field}" data-coll="${coll}" value="${esc(val ?? '')}">`;
}
function wireTrack(ctx, root) {
  root.querySelectorAll('[data-tr]').forEach(el => {
    el.addEventListener('change', () => saveTrack(ctx, el.dataset.coll, el.dataset.tr, { [el.dataset.f]: el.value }));
    el.addEventListener('click', e => e.stopPropagation());
  });
}

/* ======================= 08 · הזדמנויות חיסכון ======================= */
export function viewSavings(root, idx, ctx) {
  const { out, tot } = buildOpportunities(idx, ctx.track.opps);
  const calc = out.filter(o => o.basis === 'מחושב'), est = out.filter(o => o.basis === 'אומדן');
  const calcSum = calc.reduce((s, o) => s + o.save, 0);

  tiles(root, [
    { k: 'חיסכון מחושב מנתונים', v: moneyC(calcSum), d: `${num(calc.length)} הזדמנויות · פערי מחיר בפועל`, lead: true, hint: 'מבוסס על מחירים שהושגו בפועל אצל ספקים שונים לאותו מק״ט ויחידת מידה' },
    { k: 'אומדן נוסף', v: moneyC(est.reduce((s, o) => s + o.save, 0)), d: `${num(est.length)} הזדמנויות · מבוסס הנחות`, hint: 'אינו נגזר מהקובץ — ראה הנחות החישוב בכל שורה' },
    { k: 'בסיס ההוצאה בתקופה', v: moneyC(tot), d: 'סך הרכש בסינון הנוכחי' },
    { k: 'חיסכון שאושר', v: moneyC(out.reduce((s, o) => s + o.approved, 0)), d: 'הוזן ידנית ואומת' },
    { k: 'חיסכון שמומש', v: moneyC(out.reduce((s, o) => s + o.realized, 0)), d: 'הוזן ידנית' },
    { k: 'שיעור מהבסיס', v: tot ? (calcSum / tot * 100).toFixed(2) + '%' : '—', d: 'חיסכון מחושב מתוך ההוצאה' }
  ]);
  note(root, 'חיסכון מחושב נגזר ממחירים שגלעם שילמה בפועל: ההפרש בין המחיר שנשלם לספק לבין המחיר הטוב ביותר שהושג באותה תקופה לאותו מק״ט ויחידת מידה. אומדן מבוסס על הנחה מוצהרת ולא על נתון בקובץ — אין לדווח עליו כחיסכון מזוהה בלי כיול.');

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'פוטנציאל לפי סוג הזדמנות');
    const k = new Map();
    out.forEach(o => k.set(o.kind, (k.get(o.kind) || 0) + o.save));
    barRows(b, topMap(k).map(([n, v]) => [n, v]));
  }
  {
    const b = panel(g, 'פוטנציאל לפי קטגוריה');
    const k = new Map();
    out.forEach(o => k.set(o.cat, (k.get(o.cat) || 0) + o.save));
    barRows(b, topMap(k, 12).map(([n, v]) => [n, v]));
  }

  const t = panel(root, 'טבלת ההזדמנויות', 'לחיצה על שורה פותחת את הנחות החישוב. אחראי וסטטוס נשמרים בשרת ומשותפים לכל מי שפותח את האתר.');
  const h = table(t, [
    { k: 'sup', t: 'ספק', w: true }, { k: 'item', t: 'מק״ט', w: true }, { k: 'cat', t: 'קטגוריה' },
    { k: 'spend', t: 'הוצאה בתקופה', n: true, f: v => money(v) },
    { k: 'issue', t: 'בעיה שהתגלתה', w: true }, { k: 'act', t: 'פעולה מומלצת', w: true },
    { k: 'save', t: 'חיסכון משוער', n: true, f: v => `<b>${money(v)}</b>` },
    { k: 'conf', t: 'רמת ביטחון', f: v => `<span class="pill ${v === 'גבוהה' ? 'ok' : v === 'בינונית' ? 'medium' : v === 'אומדן' ? 'wait' : 'low'}">${v}</span>` },
    { k: 'owner', t: 'אחראי', f: (v, r) => trackInput(ctx, 'opps', r.id, 'owner', v) },
    { k: 'status', t: 'סטטוס', f: (v, r) => trackInput(ctx, 'opps', r.id, 'status', v, STATUSES) },
    { k: 'approved', t: 'אושר ₪', n: true, f: (v, r) => trackInput(ctx, 'opps', r.id, 'approved', v || '') },
    { k: 'realized', t: 'מומש ₪', n: true, f: (v, r) => trackInput(ctx, 'opps', r.id, 'realized', v || '') }
  ], out, { size: 15, sort: 6, name: 'הזדמנויות חיסכון', onRow: r => oppDrawer(ctx, r) });
  wireTrack(ctx, t);
  const old = h.redraw;
  h.redraw = () => { old(); wireTrack(ctx, t); };
}

function oppDrawer(ctx, o) {
  drawer(o.kind, o.sup, b => {
    const g = grp(b);
    kv(g, [
      ['ספק', esc(o.sup)], ['מק״ט', esc(o.item)], ['קטגוריה', esc(o.cat)],
      ['הוצאה בתקופה', money(o.spend)], ['חיסכון משוער', `<b>${money(o.save)}</b>`],
      ['בסיס', o.basis === 'מחושב' ? '<span class="pill ok">מחושב מנתונים אמיתיים</span>' : '<span class="pill wait">אומדן מבוסס הנחה</span>'],
      ['רמת ביטחון', esc(o.conf)], ['סטטוס', statusPill(o.status)], ['אחראי', esc(o.owner || '—')]
    ]);
    const g1 = grp(b, 'הבעיה שזוהתה');
    g1.appendChild(EL('p', { text: o.issue }));
    const g2 = grp(b, 'הפעולה המומלצת');
    g2.appendChild(EL('p', { text: o.act }));
    const g3 = grp(b, 'הנחות החישוב');
    g3.appendChild(EL('p', { class: 'banner' + (o.basis === 'אומדן' ? ' warn' : ''), text: o.assume }));
    const g4 = grp(b, 'הערות מעקב');
    const ta = EL('textarea', { class: 'inp', style: 'width:100%;min-height:80px;text-align:start' });
    ta.value = o.note || '';
    g4.appendChild(ta);
    g4.appendChild(EL('button', { class: 'btn primary', style: 'margin-top:8px', text: 'שמור הערה', onclick: () => saveTrack(ctx, 'opps', o.id, { note: ta.value }) }));
    const g5 = grp(b);
    const act = EL('div', { class: 'inline-form' });
    if (o._it != null) act.appendChild(EL('button', { class: 'btn', text: 'ניתוח המק״ט ←', onclick: () => itemCard(o._it) }));
    if (o._si != null) act.appendChild(EL('button', { class: 'btn', text: 'כרטיס הספק ←', onclick: () => supplierCard(o._si) }));
    g5.appendChild(act);
  });
}

/* ======================= מרכז התייעלות ======================= */
export function viewCentre(root, idx, ctx) {
  const st = ctx.state('centre', { pct: 7, dim: 'cat' });
  const ctl = panel(root, 'הגדרת היעד', 'יעד החיסכון מוגדר כאחוז מבסיס ההוצאה של כל פעילות');
  const r = EL('div', { class: 'inline-form' });
  r.append(EL('label', { class: 'flbl', text: 'יעד חיסכון' }),
    EL('input', { type: 'range', min: 1, max: 20, step: .5, value: st.pct, style: 'max-width:210px',
      oninput: e => { st.pct = +e.target.value; document.getElementById('ctPct').textContent = st.pct + '%'; },
      onchange: () => ctx.redraw() }),
    EL('b', { id: 'ctPct', text: st.pct + '%' }),
    EL('label', { class: 'flbl', text: 'חתוך לפי' }),
    seg([['cat', 'קטגוריה'], ['styp', 'סוג ספק'], ['ptyp', 'סוג הזמנת רכש']], st.dim, v => { st.dim = v; ctx.redraw(); }));
  ctl.appendChild(r);

  const arr = { cat: M.cat, styp: M.styp, ptyp: M.pt }[st.dim];
  const names = { cat: CATN, styp: n => M.dims.styp[n], ptyp: PTYP }[st.dim];
  const { out } = buildOpportunities(idx, ctx.track.opps);
  const i2k = new Map(), s2k = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    if (!i2k.has(M.i[k])) i2k.set(M.i[k], arr[k]);
    if (!s2k.has(M.s[k])) s2k.set(M.s[k], arr[k]);
  }
  const base = sumBy(idx, arr, M.a);
  const rows = [...base.entries()].map(([g, b]) => {
    const mine = out.filter(o => (o._it != null ? i2k.get(o._it) : s2k.get(o._si)) === g);
    const found = mine.filter(o => o.basis === 'מחושב').reduce((s, o) => s + o.save, 0);
    const estim = mine.filter(o => o.basis === 'אומדן').reduce((s, o) => s + o.save, 0);
    const appr = mine.reduce((s, o) => s + o.approved, 0), real = mine.reduce((s, o) => s + o.realized, 0);
    const id = oid('tg_' + st.dim + '_' + g);
    const t = ctx.track.targets[id] || {};
    const target = b * st.pct / 100;
    return {
      _g: g, id, name: names(g), base: b, pctT: st.pct, target, found, estim, appr, real,
      gap: target - real, cover: target ? found / target * 100 : 0, n: mine.length,
      owner: t.owner || '', status: t.status || 'זוהתה',
      acts: [...new Set(mine.slice(0, 3).map(o => o.kind))].join(' · ') || '—'
    };
  }).sort((a, b) => b.base - a.base);

  const T = {
    base: rows.reduce((s, r2) => s + r2.base, 0), target: rows.reduce((s, r2) => s + r2.target, 0),
    found: rows.reduce((s, r2) => s + r2.found, 0), estim: rows.reduce((s, r2) => s + r2.estim, 0),
    appr: rows.reduce((s, r2) => s + r2.appr, 0), real: rows.reduce((s, r2) => s + r2.real, 0)
  };
  tiles(root, [
    { k: 'בסיס הוצאה', v: moneyC(T.base), d: 'סך הרכש בסינון הנוכחי', lead: true },
    { k: `יעד חיסכון ${st.pct}%`, v: moneyC(T.target), d: 'יעד — לא חיסכון שהושג' },
    { k: 'פוטנציאל מזוהה', v: moneyC(T.found), d: `${(T.target ? T.found / T.target * 100 : 0).toFixed(0)}% מהיעד · מחושב מנתונים` },
    { k: 'אומדן נוסף', v: moneyC(T.estim), d: 'מבוסס הנחות, לא מהקובץ' },
    { k: 'חיסכון שאושר', v: moneyC(T.appr), d: 'הוזן ואומת ידנית' },
    { k: 'חיסכון שמומש', v: moneyC(T.real), d: `פער מהיעד ${moneyC(T.target - T.real)}` }
  ]);
  note(root, 'יעד אינו חיסכון. היעד הוא אחוז מבסיס ההוצאה; חיסכון מזוהה הוא פער מחיר שנמצא בנתונים; חיסכון מאושר ומומש הם רק מה שהוזן ידנית ואומת. שלוש השורות לא מתערבבות.', 'warn');

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'יעד מול מזוהה מול מומש');
    const top = rows.slice(0, 12);
    const el = box(b, Math.max(260, top.length * 32 + 60) + 'px');
    draw(el, {
      tooltip: { trigger: 'axis' }, legend: { show: true },
      grid: { left: 6, right: 18, top: 26, bottom: 4, containLabel: true },
      xAxis: { type: 'value', axisLabel: { formatter: v => moneyC(v) } },
      yAxis: { type: 'category', inverse: true, data: top.map(r2 => r2.name), axisLabel: { width: 130, overflow: 'truncate', fontSize: 11 } },
      series: [
        { name: 'יעד', type: 'bar', data: top.map(r2 => r2.target), itemStyle: { color: cssv('--line'), borderRadius: [0, 3, 3, 0] }, barMaxWidth: 11 },
        { name: 'מזוהה (מחושב)', type: 'bar', data: top.map(r2 => r2.found), itemStyle: { color: cssv('--accent'), borderRadius: [0, 3, 3, 0] }, barMaxWidth: 11 },
        { name: 'מומש', type: 'bar', data: top.map(r2 => r2.real), itemStyle: { color: cssv('--c5'), borderRadius: [0, 3, 3, 0] }, barMaxWidth: 11 }
      ]
    });
  }
  {
    const b = panel(g, 'כיסוי היעד', 'שיעור היעד שמכוסה בפוטנציאל מחושב');
    hbar(b, rows.slice(0, 14).map(r2 => [r2.name, Math.min(200, r2.cover), r2._g]), { labelW: 145, fmt: v => v.toFixed(0) + '%', noMoney: true, color: cssv('--c2') });
    b.appendChild(EL('p', { class: 'note', text: 'כיסוי מתחת ל-100% אומר שהפוטנציאל שאותר בנתונים קטן מהיעד — או שהיעד שאפתני לקטגוריה, או שדרושות פעולות שאינן נגזרות ממחירים: תכנון ביקוש, שינוי מפרט או החלפת ספק.' }));
  }

  const t = panel(root, 'טבלת ההתייעלות');
  const h = table(t, [
    { k: 'name', t: 'פעילות', w: true },
    { k: 'base', t: 'בסיס הוצאה', n: true, f: v => money(v) },
    { k: 'pctT', t: 'יעד %', n: true, f: v => v + '%' },
    { k: 'target', t: 'יעד ₪', n: true, f: v => money(v) },
    { k: 'found', t: 'פוטנציאל מזוהה', n: true, f: v => v ? `<b>${money(v)}</b>` : '—' },
    { k: 'estim', t: 'מזה אומדן', n: true, f: v => v ? money(v) : '—' },
    { k: 'appr', t: 'אושר', n: true, f: v => v ? money(v) : '—' },
    { k: 'real', t: 'מומש', n: true, f: v => v ? money(v) : '—' },
    { k: 'gap', t: 'פער מהיעד', n: true, f: v => v > 0 ? `<span class="up">${money(v)}</span>` : '<span class="down">הושג</span>' },
    { k: 'acts', t: 'פעולות להשגת היעד', w: true },
    { k: 'owner', t: 'אחראי', f: (v, r2) => trackInput(ctx, 'targets', r2.id, 'owner', v) },
    { k: 'status', t: 'סטטוס', f: (v, r2) => trackInput(ctx, 'targets', r2.id, 'status', v, STATUSES) }
  ], rows, { all: true, sort: 1, name: 'מרכז התייעלות' });
  wireTrack(ctx, t);
  const old = h.redraw;
  h.redraw = () => { old(); wireTrack(ctx, t); };
}

/* ======================= 09 · תלות בספקים ======================= */
export function viewDependency(root, idx, ctx) {
  const tot = sum(idx, M.a);
  const sm = topMap(sumBy(idx, M.s, M.a));
  const hhi = sm.reduce((s, x) => s + Math.pow(x[1] / tot * 100, 2), 0);
  const ia = agg(idx, M.i, { spend: [M.a, 'sum'], sups: [M.s, 'nuniq'], pos: [M.p, 'nuniq'], open: [M.openILS, 'sum'] });
  const i2s = new Map(), i2c = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    let s = i2s.get(M.i[k]);
    if (!s) { s = new Set(); i2s.set(M.i[k], s); }
    s.add(M.s[k]);
    if (!i2c.has(M.i[k])) i2c.set(M.i[k], M.cat[k]);
  }
  const single = [...ia.entries()].filter(([, o]) => o.sups === 1);
  const ssSpend = single.reduce((s, [, o]) => s + o.spend, 0);

  tiles(root, [
    { k: 'מדד ריכוזיות HHI', v: num(hhi), d: hhi > 2500 ? 'ריכוזי מאוד — חשיפה גבוהה' : hhi > 1500 ? 'ריכוזי' : 'מפוזר', lead: true, hint: 'סכום ריבועי נתחי השוק של הספקים. מעל 2,500 נחשב ריכוזי מאוד' },
    { k: 'הספק הגדול', v: sm.length ? (sm[0][1] / tot * 100).toFixed(1) + '%' : '—', d: sm.length ? SUPN(sm[0][0]) : '' },
    { k: '5 הספקים הגדולים', v: (sm.slice(0, 5).reduce((s, x) => s + x[1], 0) / tot * 100).toFixed(1) + '%', d: 'מסך הרכש בתקופה' },
    { k: 'מק״טים בספק יחיד', v: num(single.length), d: `מתוך ${num(ia.size)} מק״טים` },
    { k: 'חשיפה כספית', v: moneyC(ssSpend), d: `${(ssSpend / tot * 100).toFixed(1)}% מהרכש` },
    { k: 'יתרה פתוחה בספק יחיד', v: moneyC(single.reduce((s, [, o]) => s + o.open, 0)), d: 'התחייבות שתלויה בספק אחד' }
  ]);

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'ריכוזיות לפי קטגוריה', 'חלקם של שלושת הספקים הגדולים בכל קטגוריה');
    const cm = sumBy(idx, M.cat, M.a);
    const rows = [...cm.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 14).map(([ci, v]) => {
      const sub = idxWhere(k => M.cat[k] === ci);
      const t3 = topMap(sumBy(sub, M.s, M.a), 3);
      return [CATN(ci), t3.reduce((s, x) => s + x[1], 0) / v * 100, ci];
    });
    hbar(b, rows, { labelW: 150, fmt: v => v.toFixed(0) + '%', noMoney: true, color: cssv('--up'), onClick: r => { F.cat.clear(); F.cat.add(r[2]); ctx.refresh(); } });
    b.appendChild(EL('p', { class: 'note', text: 'קטגוריה שבה שלושה ספקים מכסים מעל 90% מההוצאה חשופה להפסקת אספקה ולכוח מיקוח של הספק.' }));
  }
  {
    const b = panel(g, 'שינוי התלות לאורך השנים', 'חלקו של הספק הגדול ומדד HHI לפי שנה');
    const ys = M.years, sh = [], hh = [];
    ys.forEach(y => {
      const w = scanWindow(dayOf(y, 1, 1), dayOf(y, 12, 31));
      const t = sum(w, M.a);
      const s2 = topMap(sumBy(w, M.s, M.a));
      sh.push(t && s2.length ? s2[0][1] / t * 100 : null);
      hh.push(t ? s2.reduce((s3, x) => s3 + Math.pow(x[1] / t * 100, 2), 0) : null);
    });
    const el = box(b, '270px');
    draw(el, {
      tooltip: { trigger: 'axis' }, legend: { show: true },
      xAxis: { type: 'category', data: ys.map(String) },
      yAxis: [{ type: 'value', axisLabel: { formatter: v => v + '%' } }, { type: 'value', splitLine: { show: false } }],
      series: [
        { name: 'חלק הספק הגדול', type: 'bar', data: sh, itemStyle: { color: cssv('--accent'), borderRadius: [3, 3, 0, 0] } },
        { name: 'HHI', type: 'line', yAxisIndex: 1, data: hh, lineStyle: { color: cssv('--up'), width: 2 }, symbol: 'circle', symbolSize: 6 }
      ]
    });
  }
  {
    const b = panel(g, 'מק״טים בספק יחיד', 'מדורג לפי חשיפה כספית · אין בקובץ שדה קריטיות, לכן הסיכון נאמד לפי היקף');
    const rows = single.map(([it, o]) => ({
      _it: it, item: IDESC(it) || ITEM(it), sup: SUPN([...i2s.get(it)][0]),
      cat: CATN(i2c.get(it)), spend: o.spend, pos: o.pos, open: o.open,
      risk: o.spend >= 5e6 ? 'גבוה' : o.spend >= 1e6 ? 'בינוני' : 'נמוך'
    })).sort((a, b2) => b2.spend - a.spend).slice(0, 120);
    table(b, [
      { k: 'item', t: 'מק״ט', w: true }, { k: 'sup', t: 'הספק היחיד', w: true },
      { k: 'spend', t: 'חשיפה', n: true, f: v => money(v) }, { k: 'pos', t: 'הזמנות', n: true },
      { k: 'open', t: 'יתרה פתוחה', n: true, f: v => v ? money(v) : '—' },
      { k: 'risk', t: 'סיכון', f: v => `<span class="pill ${v === 'גבוה' ? 'high' : v === 'בינוני' ? 'medium' : 'low'}">${v}</span>` }
    ], rows, { size: 12, sort: 2, name: 'מק״טים בספק יחיד', onRow: r => itemCard(r._it) });
  }
  {
    const b = panel(g, 'ספקים המהווים אחוז גבוה מהרכש', 'מעל 2% מסך הרכש בתקופה');
    const rows = sm.filter(([, v]) => v / tot >= 0.02).map(([si, v]) => {
      const sub = idxWhere(k => M.s[k] === si);
      const own = [...new Set([...sub].map(k => M.i[k]))].filter(it => (i2s.get(it) || new Set()).size === 1);
      return {
        _si: si, sup: SUPN(si), share: v / tot * 100, spend: v, items: nuniq(sub, M.i),
        solo: own.length, soloSpend: own.reduce((s, it) => s + (ia.get(it) ? ia.get(it).spend : 0), 0),
        open: sum(openIdx(sub), M.openILS)
      };
    });
    table(b, [
      { k: 'sup', t: 'ספק', w: true }, { k: 'share', t: 'חלק מהרכש', n: true, f: v => `<b>${v.toFixed(1)}%</b>` },
      { k: 'spend', t: 'היקף', n: true, f: v => money(v) }, { k: 'items', t: 'מק״טים', n: true },
      { k: 'solo', t: 'בספק יחיד', n: true }, { k: 'soloSpend', t: 'חשיפה בלעדית', n: true, f: v => v ? money(v) : '—' },
      { k: 'open', t: 'יתרה פתוחה', n: true, f: v => v ? money(v) : '—' }
    ], rows, { all: true, sort: 1, name: 'ספקים מהותיים', onRow: r => supplierCard(r._si) });
  }

  const rec = panel(root, 'המלצות לבחינת ספקים חלופיים', 'מק״טים בספק יחיד מעל מיליון ₪');
  const cand = single.filter(([it, o]) => o.spend >= 1e6 && !M.itemCatchAll[it]).sort((a, b2) => b2[1].spend - a[1].spend).slice(0, 25);
  if (!cand.length) rec.appendChild(EL('p', { class: 'note', text: 'אין מק״טים בספק יחיד מעל מיליון ₪ בסינון הנוכחי.' }));
  else cand.forEach(([it, o]) => {
    const si = [...i2s.get(it)][0];
    const d = EL('div', { class: 'alertrow' });
    d.innerHTML = `<span class="sev ${o.spend >= 5e6 ? 'crit' : 'warn'}"></span><div>
      <h4>${esc(IDESC(it) || ITEM(it))}</h4>
      <p>${money(o.spend)} בתקופה, ${o.pos} הזמנות, כולן מ-${esc(SUPN(si))}. אין מחיר חלופי בקובץ להשוואה.</p>
      <p class="act">פעולה מומלצת: בקשת הצעות מ-2–3 ספקים נוספים והקמת ספק גיבוי מאושר. מק״ט בהיקף כזה בספק יחיד הוא גם סיכון המשכיות וגם היעדר בסיס מיקוח.</p>
      <div class="src">מקור: ${o.pos} הזמנות בתקופה, ספק אחד בעמודת מס׳ ספק</div></div>`;
    d.onclick = () => itemCard(it);
    rec.appendChild(d);
  });
}

/* ======================= 10 · ניתוח הזמנות ======================= */
export function viewOrders(root, idx, ctx) {
  const pa = poAgg(idx);
  const rows = [...pa.entries()].map(([pi, o]) => ({
    _p: pi, po: M.dims.po[pi], sup: SUPN(o.sup), _si: o.sup, spend: o.spend, lines: o.lines, items: o.items,
    d: dstr(o.d), _d: o.d, dd: dstr(o.dd), _dd: o.dd, stat: STAT(o.stat), buyer: BUY(o.buyer),
    open: o.open, oq: o.oq, age: M.today - o.d,
    late: (o.oq > 0 && o.dd >= 0 && o.dd < M.today) ? 'באיחור' : (o.oq > 0 ? 'פתוחה' : 'סגורה')
  })).sort((a, b) => b.spend - a.spend);
  const small = rows.filter(r => r.spend < 2000), big = rows.filter(r => r.spend >= 1e6);
  const openR = rows.filter(r => r.oq > 0), late = openR.filter(r => r.late === 'באיחור');
  const tot = sum(idx, M.a);
  const med = rows.length ? rows.map(r => r.spend).sort((a, b) => a - b)[Math.floor(rows.length / 2)] : 0;

  tiles(root, [
    { k: 'הזמנות בתקופה', v: num(rows.length), d: `${num(idx.length / Math.max(1, rows.length), 1)} שורות להזמנה בממוצע`, lead: true },
    { k: 'שווי הזמנה ממוצע', v: moneyC(tot / Math.max(1, rows.length)), d: `חציון ${moneyC(med)}` },
    { k: 'הזמנות מעל מיליון ₪', v: num(big.length), d: `${moneyC(big.reduce((s, r) => s + r.spend, 0))} · ${(big.reduce((s, r) => s + r.spend, 0) / tot * 100).toFixed(0)}% מהרכש` },
    { k: 'הזמנות מתחת ל-2,000 ₪', v: num(small.length), d: `${moneyC(small.reduce((s, r) => s + r.spend, 0))} — ${(small.length / Math.max(1, rows.length) * 100).toFixed(0)}% מההזמנות` },
    { k: 'עם יתרה לאספקה', v: num(openR.length), d: moneyC(openR.reduce((s, r) => s + r.open, 0)) },
    { k: 'הזמנות באיחור', v: num(late.length), d: `${moneyC(late.reduce((s, r) => s + r.open, 0))} יתרה` }
  ]);

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'התפלגות ההזמנות לפי שווי', 'מספר ההזמנות בכל מדרגה, וסך הערך בה');
    const bands = [[0, 500, 'עד 500 ₪'], [500, 2e3, '500–2,000'], [2e3, 1e4, '2–10 אלף'], [1e4, 5e4, '10–50 אלף'],
      [5e4, 2e5, '50–200 אלף'], [2e5, 1e6, '200 אלף–מיליון'], [1e6, Infinity, 'מעל מיליון']];
    const cnt = bands.map(([a, b2]) => rows.filter(r => r.spend >= a && r.spend < b2).length);
    const val = bands.map(([a, b2]) => rows.filter(r => r.spend >= a && r.spend < b2).reduce((s, r) => s + r.spend, 0));
    const el = box(b, '280px');
    draw(el, {
      tooltip: { trigger: 'axis' }, legend: { show: true },
      xAxis: { type: 'category', data: bands.map(b2 => b2[2]), axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: [{ type: 'value' }, { type: 'value', axisLabel: { formatter: v => moneyC(v) }, splitLine: { show: false } }],
      series: [
        { name: 'מספר הזמנות', type: 'bar', data: cnt, itemStyle: { color: cssv('--accent'), borderRadius: [3, 3, 0, 0] } },
        { name: 'ערך מצטבר', type: 'line', yAxisIndex: 1, data: val, lineStyle: { color: cssv('--c5'), width: 2 }, symbol: 'circle' }
      ]
    }, e => {
      const [a, b2] = bands[e.dataIndex];
      const ps = new Set(rows.filter(r => r.spend >= a && r.spend < b2).map(r => r._p));
      drill('הזמנות ' + bands[e.dataIndex][2], idxWhere(k => ps.has(M.p[k])));
    });
  }
  {
    const b = panel(g, 'פילוח לפי סטטוס הזמנה');
    barRows(b, topMap(sumBy(idx, M.st, M.a)).map(([s, v]) => [STAT(s), v, s]),
      { onClick: r => { F.stat.clear(); F.stat.add(r[2]); ctx.refresh(); } });
  }
  {
    const b = panel(g, 'פילוח לפי קניין', 'עמודת ״לטיפול״ בקובץ המקור');
    const bm = agg(idx, M.b, { spend: [M.a, 'sum'], pos: [M.p, 'nuniq'], sups: [M.s, 'nuniq'] });
    const br = [...bm.entries()].map(([bi, o]) => ({ _b: bi, buyer: BUY(bi), spend: o.spend, pos: o.pos, sups: o.sups, avg: o.spend / o.pos })).sort((a, b2) => b2.spend - a.spend);
    table(b, [
      { k: 'buyer', t: 'קניין' }, { k: 'spend', t: 'היקף', n: true, f: v => barCell(v, br[0].spend) },
      { k: 'pos', t: 'הזמנות', n: true }, { k: 'avg', t: 'הזמנה ממוצעת', n: true, f: v => money(v) }, { k: 'sups', t: 'ספקים', n: true }
    ], br, { size: 10, sort: 1, name: 'קניינים', onRow: r => { F.buyer.clear(); F.buyer.add(r._b); ctx.refresh(); } });
  }
  {
    const b = panel(g, 'גיל ההזמנות הפתוחות', 'ימים מאז פתיחת ההזמנה');
    const bands = [[0, 30, 'עד 30 יום'], [30, 90, '30–90'], [90, 180, '90–180'], [180, 365, 'חצי שנה–שנה'], [365, 1e9, 'מעל שנה']];
    const cnt = bands.map(([a, b2]) => openR.filter(r => r.age >= a && r.age < b2).length);
    const val = bands.map(([a, b2]) => openR.filter(r => r.age >= a && r.age < b2).reduce((s, r) => s + r.open, 0));
    const el = box(b, '260px');
    draw(el, {
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br>${p[0].value} הזמנות<br><b>${money(val[p[0].dataIndex])}</b> יתרה` },
      xAxis: { type: 'category', data: bands.map(b2 => b2[2]), axisLabel: { fontSize: 10.5 } },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar', data: cnt.map((v, n) => ({ value: v, itemStyle: { color: n >= 3 ? cssv('--up') : n === 2 ? cssv('--warn') : cssv('--accent'), borderRadius: [3, 3, 0, 0] } })),
        label: { show: true, position: 'top', fontSize: 10.5, color: cssv('--ink2'), formatter: p => moneyC(val[p.dataIndex]) }
      }]
    });
  }

  const t = panel(root, 'כל ההזמנות', 'לחיצה על שורה פותחת את שורות ההזמנה');
  table(t, [
    { k: 'po', t: 'הזמנת רכש' }, { k: 'sup', t: 'ספק', w: true }, { k: 'd', t: 'ת. הזמנה', sortV: r => r._d },
    { k: 'spend', t: 'שווי', n: true, f: v => money(v) }, { k: 'lines', t: 'שורות', n: true }, { k: 'items', t: 'מק״טים', n: true },
    { k: 'stat', t: 'סטטוס' }, { k: 'buyer', t: 'קניין' },
    { k: 'open', t: 'יתרה ₪', n: true, f: v => v ? money(v) : '—' },
    { k: 'dd', t: 'ת. אספקה', sortV: r => r._dd }, { k: 'age', t: 'גיל (ימים)', n: true },
    { k: 'late', t: 'מצב', f: v => `<span class="pill ${v === 'באיחור' ? 'high' : v === 'פתוחה' ? 'medium' : 'low'}">${v}</span>` }
  ], rows, { size: 20, sort: 3, name: 'הזמנות רכש', onRow: r => drill('הזמנה ' + r.po, idxWhere(k => M.p[k] === r._p), r.sup) });
}

/* ======================= 11 · התחייבויות פתוחות ======================= */
export function viewOpen(root, idx, ctx) {
  const op = openIdx(idx);
  if (!op.length) { note(root, 'אין שורות עם יתרה לאספקה בסטטוס פתוח בסינון הנוכחי.'); return; }
  const tot = sum(op, M.openILS);
  const late = idxWhere(k => M.dd[k] >= 0 && M.dd[k] < M.today, op);
  const noDate = idxWhere(k => M.dd[k] < 0, op);
  const oldOp = idxWhere(k => M.today - M.d[k] >= 180, op);

  tiles(root, [
    { k: 'סך ההתחייבויות הפתוחות', v: moneyC(tot), d: `${num(nuniq(op, M.p))} הזמנות · ${num(op.length)} שורות`, lead: true, hint: 'סכום(ILS)×(יתרה לאספקה/כמות) לכל שורה פתוחה' },
    { k: 'באיחור', v: moneyC(sum(late, M.openILS)), d: `${num(nuniq(late, M.p))} הזמנות · מועד האספקה חלף` },
    { k: 'ללא מועד אספקה', v: moneyC(sum(noDate, M.openILS)), d: `${num(noDate.length)} שורות` },
    { k: 'ישנות ללא פעילות', v: moneyC(sum(oldOp, M.openILS)), d: 'נפתחו לפני מעל חצי שנה' },
    { k: 'ספקים עם התחייבות', v: num(nuniq(op, M.s)), d: `${num(nuniq(op, M.i))} מק״טים` },
    { k: 'שיעור מהרכש בתקופה', v: (tot / sum(idx, M.a) * 100).toFixed(1) + '%', d: 'יתרה פתוחה מול שווי ההזמנות' }
  ]);
  note(root, 'יתרה לאספקה בקובץ היא כמות ביחידות מידה, לא סכום. השווי מחושב כ: סכום(ILS) × (יתרה לאספקה / כמות). שורות סגורות שנשארה בהן יתרה אינן נכללות — הן מופיעות במסך איכות הנתונים כאי-התאמה.', 'warn');

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'יתרת התחייבויות לפי ספק');
    barRows(b, topMap(sumBy(op, M.s, M.openILS), 14).map(([si, v]) => [SUPN(si), v, si]), { onClick: r => supplierCard(r[2]) });
  }
  {
    const b = panel(g, 'יתרת התחייבויות לפי מק״ט');
    barRows(b, topMap(sumBy(op, M.i, M.openILS), 14).map(([it, v]) => [IDESC(it) || ITEM(it), v, it]), { onClick: r => itemCard(r[2]) });
  }
  {
    const b = panel(g, 'התחייבויות לפי חודש אספקה צפוי', 'אדום = מועד שחלף');
    const mm = new Map();
    for (let j = 0; j < op.length; j++) {
      const k = op[j];
      if (M.dd[k] < 0) continue;
      const t = toDate(M.dd[k]), key = t.getUTCFullYear() * 12 + t.getUTCMonth();
      mm.set(key, (mm.get(key) || 0) + M.openILS[k]);
    }
    const ks = [...mm.keys()].sort((a, b2) => a - b2);
    const tnow = toDate(M.today);
    const tk = tnow.getUTCFullYear() * 12 + tnow.getUTCMonth();
    const el = box(b, '280px');
    draw(el, {
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br><b>${money(p[0].value)}</b>` },
      xAxis: { type: 'category', data: ks.map(k => ymstr(Math.floor(k / 12), k % 12 + 1)), axisLabel: { fontSize: 10, rotate: ks.length > 14 ? 45 : 0 } },
      yAxis: { type: 'value', axisLabel: { formatter: v => moneyC(v) } },
      series: [{ type: 'bar', barMaxWidth: 30, data: ks.map(k => ({ value: mm.get(k), itemStyle: { color: k < tk ? cssv('--up') : k === tk ? cssv('--warn') : cssv('--accent'), borderRadius: [3, 3, 0, 0] } })) }]
    }, e => {
      const k = ks[e.dataIndex];
      drill('אספקה צפויה ' + ymstr(Math.floor(k / 12), k % 12 + 1),
        idxWhere(r => { if (M.dd[r] < 0) return false; const t = toDate(M.dd[r]); return t.getUTCFullYear() * 12 + t.getUTCMonth() === k; }, op));
    });
  }
  {
    const b = panel(g, 'פילוח לפי קטגוריה וסטטוס');
    barRows(b, topMap(sumBy(op, M.cat, M.openILS), 12).map(([ci, v]) => [CATN(ci), v, ci]),
      { onClick: r => { F.cat.clear(); F.cat.add(r[2]); ctx.refresh(); } });
    b.appendChild(EL('div', { class: 'pillrow', style: 'margin-top:10px' },
      topMap(sumBy(op, M.st, M.openILS)).map(([s, v]) => `<span class="pill wait">${esc(STAT(s))}: ${moneyC(v)}</span>`).join(' ')));
  }

  if (late.length) {
    const b = panel(root, 'הזמנות שמועד האספקה שלהן חלף', 'מדורג לפי שווי היתרה');
    const pa = poAgg(late);
    const rows = [...pa.entries()].map(([pi, o]) => ({
      _p: pi, po: M.dims.po[pi], sup: SUPN(o.sup), open: o.open, dd: dstr(o.dd), _dd: o.dd,
      days: M.today - o.dd, stat: STAT(o.stat), lines: o.lines, buyer: BUY(o.buyer)
    })).sort((a, b2) => b2.open - a.open);
    table(b, [
      { k: 'po', t: 'הזמנה' }, { k: 'sup', t: 'ספק', w: true }, { k: 'open', t: 'שווי היתרה', n: true, f: v => money(v) },
      { k: 'dd', t: 'ת. אספקה', sortV: r => r._dd },
      { k: 'days', t: 'ימי איחור', n: true, f: v => `<span class="up">${num(v)}</span>` },
      { k: 'stat', t: 'סטטוס' }, { k: 'lines', t: 'שורות', n: true }, { k: 'buyer', t: 'קניין' }
    ], rows, { size: 15, sort: 2, name: 'הזמנות באיחור', onRow: r => drill('הזמנה ' + r.po, idxWhere(k => M.p[k] === r._p)) });
  }
  const t = panel(root, 'כל השורות הפתוחות');
  table(t, LINE_COLS(), lineRows(op), { size: 20, sort: 14, name: 'התחייבויות פתוחות' });
}

/* ======================= 12 · מגמות ביקוש ======================= */
export function viewDemand(root, idx, ctx) {
  const prv = priorYearIdx();
  note(root, 'הנתונים הם הזמנות רכש, לא תנועות מלאי או ייצור. גידול בכמות שנרכשה יכול לנבוע מצריכה, מבניית מלאי או מתזמון הזמנות — ואינו בהכרח גידול בצריכה בפועל.', 'warn');

  const qa = sumBy(idx, M.i, M.q), qp = sumBy(prv, M.i, M.q), sp = sumBy(idx, M.i, M.a);
  // כמות חודשית לכל מק"ט במעבר אחד — סריקה לכל מק"ט בנפרד הייתה 8,000 × 42,000
  const perItemMo = new Map();
  for (let j = 0; j < idx.length; j++) {
    const k = idx[j];
    let mm = perItemMo.get(M.i[k]);
    if (!mm) { mm = new Map(); perItemMo.set(M.i[k], mm); }
    mm.set(M.ym[k], (mm.get(M.ym[k]) || 0) + M.q[k]);
  }
  const rows = [...qa.entries()].map(([it, q]) => {
    const p = qp.get(it) || 0;
    const vals = [...(perItemMo.get(it) || new Map()).values()].filter(v => v > 0);
    const mean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (vals.length || 1));
    return {
      _it: it, item: IDESC(it) || ITEM(it), unit: UNIT(M.itemUnit[it]), qty: q, prvQty: p,
      delta: p ? (q / p - 1) * 100 : null, spend: sp.get(it) || 0, months: vals.length,
      cv: mean ? sd / mean * 100 : null, peak: vals.length ? Math.max(...vals) : 0
    };
  }).filter(r => r.spend > 0);

  const upT = rows.filter(r => r.delta != null && r.delta >= 20 && r.spend > 5e4).sort((a, b) => b.spend - a.spend);
  const dnT = rows.filter(r => r.delta != null && r.delta <= -20 && r.spend > 5e4).sort((a, b) => b.spend - a.spend);
  const vol = rows.filter(r => r.cv != null && r.months >= 4 && r.spend > 1e5).sort((a, b) => b.cv - a.cv);

  tiles(root, [
    { k: 'מק״טים בצמיחת כמות', v: num(upT.length), d: 'מעל 20% מול התקופה המקבילה', lead: true },
    { k: 'מק״טים בירידת כמות', v: num(dnT.length), d: 'מעל 20% ירידה' },
    { k: 'מק״טים תנודתיים', v: num(vol.filter(r => r.cv > 80).length), d: 'מקדם שונות מעל 80% בין חודשים', hint: 'סטיית תקן חלקי ממוצע הכמות החודשית' },
    { k: 'רכש ברוב החודשים', v: num(rows.filter(r => r.months >= 9).length), d: '9 חודשים ומעלה — צריכה שוטפת' }
  ]);

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'עונתיות הרכש', 'ממוצע חודשי מכל השנים שבסינון');
    const mm = new Array(12).fill(0);
    const yrs = new Set();
    for (let j = 0; j < idx.length; j++) { const k = idx[j]; mm[M.mo[k] - 1] += M.a[k]; yrs.add(M.y[k]); }
    const avg = mm.map(v => v / Math.max(1, yrs.size));
    lines(b, MON, [{ name: 'ממוצע חודשי', type: 'bar', data: avg, color: cssv('--accent') }], {
      height: '250px',
      onClick: e => { const mo = e.dataIndex + 1; drill('רכש בחודש ' + MON[mo - 1], idxWhere(k => M.mo[k] === mo)); }
    });
    const mx = avg.indexOf(Math.max(...avg));
    const pos = avg.filter(v => v > 0);
    const mn = avg.indexOf(Math.min(...(pos.length ? pos : avg)));
    b.appendChild(EL('p', { class: 'note', text: `החודש העמוס: ${MON[mx]} (${moneyC(avg[mx])} בממוצע). החודש הדל: ${MON[mn]} (${moneyC(avg[mn])}). ממוצע על ${yrs.size} שנים בסינון.` }));
  }
  {
    const b = panel(g, 'מק״טים בצמיחת כמות', '12 הגדולים בהוצאה מתוך אלה שהכמות בהם עלתה');
    if (!upT.length) b.appendChild(EL('p', { class: 'note', text: 'אין מק״טים בצמיחת כמות מעל הסף.' }));
    else hbar(b, upT.slice(0, 12).map(r => [r.item, r.delta, r._it]), { labelW: 165, fmt: v => pct(v, 0), noMoney: true, color: cssv('--up'), onClick: r => itemCard(r[2]) });
  }
  {
    const b = panel(g, 'מק״טים בירידת כמות');
    if (!dnT.length) b.appendChild(EL('p', { class: 'note', text: 'אין מק״טים בירידת כמות מעל הסף.' }));
    else hbar(b, dnT.slice(0, 12).map(r => [r.item, r.delta, r._it]), { labelW: 165, fmt: v => pct(v, 0), noMoney: true, color: cssv('--down'), onClick: r => itemCard(r[2]) });
  }
  {
    const b = panel(g, 'תנודתיות מול היקף', 'כל נקודה היא מק״ט · אופקי: הוצאה, אנכי: מקדם שונות של הכמות החודשית');
    scatter(b, vol.slice(0, 400).map(r => [r.spend, r.cv, r.item, r._it]), {
      logX: true, xMoney: true, yPct: true,
      fmt: p => `${esc(p.data[2])}<br>הוצאה ${money(p.data[0])}<br>שונות <b>${p.data[1].toFixed(0)}%</b>`,
      color: p => p.data[1] > 100 ? cssv('--up') : p.data[1] > 60 ? cssv('--warn') : cssv('--accent'),
      onClick: e => itemCard(e.data[3])
    });
    b.appendChild(EL('p', { class: 'note', text: 'מק״ט בפינה הימנית-עליונה: היקף גדול וביקוש לא יציב — מועמד לתכנון מלאי ולהסכם מסגרת עם משיכות.' }));
  }

  const t = panel(root, 'טבלת מגמות הביקוש');
  table(t, [
    { k: 'item', t: 'מק״ט', w: true }, { k: 'unit', t: 'יח׳' },
    { k: 'qty', t: 'כמות בתקופה', n: true, f: v => num(v, 2) },
    { k: 'prvQty', t: 'תקופה מקבילה', n: true, f: v => v ? num(v, 2) : '—' },
    { k: 'delta', t: 'שינוי כמות', n: true, f: v => trend(v) },
    { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) },
    { k: 'months', t: 'חודשי רכש', n: true },
    { k: 'cv', t: 'תנודתיות', n: true, f: v => v == null ? '—' : `<span class="${v > 100 ? 'up' : 'flat'}">${v.toFixed(0)}%</span>` },
    { k: 'peak', t: 'שיא חודשי', n: true, f: v => num(v, 1) }
  ], rows, { size: 20, sort: 5, name: 'מגמות ביקוש', onRow: r => itemCard(r._it) });
}

/* ======================= 15 · יעילות תהליכי רכש ======================= */
export function viewEfficiency(root, idx, ctx) {
  const pa = poAgg(idx), tot = sum(idx, M.a);
  const pos = [...pa.values()];
  const small = pos.filter(o => o.spend < 2000), tiny = pos.filter(o => o.spend < 500);
  const sa = supAgg(idx);
  const med = pos.length ? pos.map(o => o.spend).sort((a, b) => a - b)[Math.floor(pos.length / 2)] : 0;

  tiles(root, [
    { k: 'הזמנות בתקופה', v: num(pos.length), d: `${num(idx.length / Math.max(1, pos.length), 1)} שורות להזמנה`, lead: true },
    { k: 'שווי הזמנה ממוצע', v: moneyC(tot / Math.max(1, pos.length)), d: `חציון ${moneyC(med)}` },
    { k: 'מתחת ל-2,000 ₪', v: `${(small.length / Math.max(1, pos.length) * 100).toFixed(0)}%`, d: `${num(small.length)} הזמנות · ${moneyC(small.reduce((s, o) => s + o.spend, 0))} בלבד` },
    { k: 'מתחת ל-500 ₪', v: num(tiny.length), d: `${(tiny.reduce((s, o) => s + o.spend, 0) / tot * 100).toFixed(2)}% מהערך` },
    { k: 'ספקים עם הזמנה אחת', v: num([...sa.values()].filter(o => o.pos === 1).length), d: 'מועמדים לאיחוד או לרכש דרך ספק קיים' },
    { k: 'קניינים פעילים', v: num(nuniq(idx, M.b)), d: `${num(pos.length / Math.max(1, nuniq(idx, M.b)), 0)} הזמנות לקניין` }
  ]);
  note(root, 'ערך נמוך בשכיחות גבוהה הוא עלות תהליך, לא עלות סחורה: כל הזמנה דורשת אישור, קליטה, קבלה והתאמת חשבונית. איחוד הזמנות קטנות משחרר זמן קנייה בלי לשנות את המחיר.');

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'ריבוי הזמנות קטנות לפי ספק', 'מועמדים להסכם מסגרת או להזמנה פתוחה');
    const bySup = new Map();
    for (const o of small) { let x = bySup.get(o.sup); if (!x) { x = { n: 0, v: 0 }; bySup.set(o.sup, x); } x.n++; x.v += o.spend; }
    const rows = [...bySup.entries()].filter(([, x]) => x.n >= 6).map(([si, x]) => ({
      _si: si, sup: SUPN(si), n: x.n, v: x.v, avg: x.v / x.n, tot: sa.get(si) ? sa.get(si).spend : 0
    })).sort((a, b2) => b2.n - a.n);
    if (!rows.length) b.appendChild(EL('p', { class: 'note', text: 'אין ספקים עם ריבוי הזמנות קטנות בסינון הנוכחי.' }));
    else {
      hbar(b, rows.slice(0, 12).map(r => [r.sup, r.n, r._si]), { labelW: 155, fmt: v => num(v) + ' הזמנות', noMoney: true, color: cssv('--warn'), onClick: r => supplierCard(r[2]) });
      table(b, [
        { k: 'sup', t: 'ספק', w: true }, { k: 'n', t: 'הזמנות קטנות', n: true },
        { k: 'v', t: 'ערכן', n: true, f: v => money(v) }, { k: 'avg', t: 'ממוצע', n: true, f: v => money(v) },
        { k: 'tot', t: 'סך הרכש מהספק', n: true, f: v => money(v) }
      ], rows, { size: 8, sort: 1, name: 'הזמנות קטנות', onRow: r => supplierCard(r._si) });
    }
  }
  {
    const b = panel(g, 'רכש חוזר לאותו מק״ט', 'מק״טים עם 8 הזמנות נפרדות ומעלה');
    const ia = agg(idx, M.i, { pos: [M.p, 'nuniq'], spend: [M.a, 'sum'], sups: [M.s, 'nuniq'] });
    const rows = [...ia.entries()].filter(([, o]) => o.pos >= 8).map(([it, o]) => ({
      _it: it, desc: IDESC(it) || ITEM(it), pos: o.pos, spend: o.spend, avg: o.spend / o.pos, sups: o.sups
    })).sort((a, b2) => b2.pos - a.pos);
    if (!rows.length) b.appendChild(EL('p', { class: 'note', text: 'אין מק״טים עם 8 הזמנות נפרדות ומעלה.' }));
    else table(b, [
      { k: 'desc', t: 'מק״ט', w: true }, { k: 'pos', t: 'הזמנות', n: true },
      { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) }, { k: 'avg', t: 'ממוצע להזמנה', n: true, f: v => money(v) },
      { k: 'sups', t: 'ספקים', n: true }
    ], rows, { size: 12, sort: 1, name: 'רכש חוזר', onRow: r => itemCard(r._it) });
  }
  {
    const b = panel(g, 'פוטנציאל איחוד הזמנות', 'אותו ספק, אותו חודש, יותר מהזמנה אחת');
    const key = new Map();
    for (const o of pa.values()) {
      const t = toDate(o.d);
      const kk = o.sup + '|' + t.getUTCFullYear() + '-' + t.getUTCMonth();
      let x = key.get(kk);
      if (!x) { x = { n: 0, v: 0, sup: o.sup }; key.set(kk, x); }
      x.n++; x.v += o.spend;
    }
    const bySup = new Map();
    [...key.values()].filter(x => x.n >= 3).forEach(x => {
      let o = bySup.get(x.sup);
      if (!o) { o = { months: 0, pos: 0, v: 0 }; bySup.set(x.sup, o); }
      o.months++; o.pos += x.n; o.v += x.v;
    });
    const rows = [...bySup.entries()].map(([si, o]) => ({ _si: si, sup: SUPN(si), months: o.months, pos: o.pos, saveable: o.pos - o.months, v: o.v })).sort((a, b2) => b2.saveable - a.saveable);
    b.appendChild(EL('div', { class: 'bignum', text: num(rows.reduce((s, r) => s + r.saveable, 0)) + ' הזמנות' }));
    b.appendChild(EL('p', { class: 'note', text: 'ניתן לחסוך על ידי איחוד לפעימה חודשית אחת לכל ספק — בלי שינוי במחיר או בכמות.' }));
    if (rows.length) table(b, [
      { k: 'sup', t: 'ספק', w: true }, { k: 'months', t: 'חודשים עם ריבוי', n: true },
      { k: 'pos', t: 'הזמנות באותם חודשים', n: true },
      { k: 'saveable', t: 'ניתן לחסוך', n: true, f: v => `<b>${num(v)}</b>` },
      { k: 'v', t: 'ערך', n: true, f: v => money(v) }
    ], rows, { size: 10, sort: 3, name: 'איחוד הזמנות', onRow: r => supplierCard(r._si) });
  }
  {
    const b = panel(g, 'השוואת פעילות בין קניינים');
    const bm = agg(idx, M.b, { spend: [M.a, 'sum'], pos: [M.p, 'nuniq'], sups: [M.s, 'nuniq'], items: [M.i, 'nuniq'] });
    const rows = [...bm.entries()].map(([bi, o]) => {
      const sub = idxWhere(k => M.b[k] === bi);
      const sp = poAgg(sub);
      const sm = [...sp.values()].filter(x => x.spend < 2000).length;
      return { _b: bi, buyer: BUY(bi), spend: o.spend, pos: o.pos, avg: o.spend / o.pos, sups: o.sups, items: o.items, smallPct: sm / o.pos * 100 };
    }).sort((a, b2) => b2.spend - a.spend);
    table(b, [
      { k: 'buyer', t: 'קניין' }, { k: 'spend', t: 'היקף', n: true, f: v => money(v) },
      { k: 'pos', t: 'הזמנות', n: true }, { k: 'avg', t: 'הזמנה ממוצעת', n: true, f: v => money(v) },
      { k: 'sups', t: 'ספקים', n: true }, { k: 'items', t: 'מק״טים', n: true },
      { k: 'smallPct', t: '% הזמנות קטנות', n: true, f: v => `<span class="${v > 50 ? 'up' : 'flat'}">${v.toFixed(0)}%</span>` }
    ], rows, { size: 12, sort: 1, name: 'קניינים', onRow: r => { F.buyer.clear(); F.buyer.add(r._b); ctx.refresh(); } });
    b.appendChild(EL('p', { class: 'note', text: 'ההשוואה תיאורית בלבד: תמהיל הקטגוריות של כל קניין שונה, ולכן שווי הזמנה ממוצע נמוך אינו בהכרח סימן לחוסר יעילות.' }));
  }
}

/* ======================= 16 · תחזיות ותקציב ======================= */
export function viewForecast(root, idx, ctx) {
  const st = ctx.state('fcst', { budget: 0, months: 6, infl: 3 });
  const f = forecast(scanWindow(null, null), 12);
  if (!f) { note(root, 'אין מספיק חודשים בהיסטוריה כדי לבנות תחזית.', 'warn'); return; }

  const ctl = panel(root, 'הנחות התחזית', 'אקסטרפולציה של מגמה קווית על 24 החודשים האחרונים, מוכפלת במקדם עונתיות חודשי');
  const r = EL('div', { class: 'inline-form' });
  r.append(EL('label', { class: 'flbl', text: 'אופק' }),
    seg([[3, '3 חודשים'], [6, '6 חודשים'], [12, '12 חודשים']], st.months, v => { st.months = v; ctx.redraw(); }),
    EL('label', { class: 'flbl', text: 'תקציב שנתי ₪' }),
    EL('input', { class: 'inp', type: 'number', value: st.budget || '', placeholder: 'לא הוזן', onchange: e => { st.budget = +e.target.value || 0; ctx.redraw(); } }),
    EL('label', { class: 'flbl', text: 'תרחיש התייקרות %' }),
    EL('input', { class: 'inp', type: 'number', value: st.infl, onchange: e => { st.infl = +e.target.value || 0; ctx.redraw(); } }));
  ctl.appendChild(r);

  const next = f.fc.slice(0, st.months).reduce((s, x) => s + x.v, 0);
  const year = f.fc.reduce((s, x) => s + x.v, 0);
  const op = openIdx(scanWindow(null, null));
  const futureOpen = sum(idxWhere(k => M.dd[k] >= M.today, op), M.openILS);

  tiles(root, [
    { k: `תחזית ${st.months} חודשים`, v: moneyC(next), d: 'מגמה × עונתיות', lead: true, hint: 'אקסטרפולציה ממגמת 24 החודשים האחרונים; אינה התחייבות' },
    { k: 'תחזית 12 חודשים', v: moneyC(year), d: 'שנה קדימה' },
    { k: 'מגמה חודשית', v: moneyC(f.slope), d: f.slope > 0 ? 'מגמת גידול' : 'מגמת קיטון' },
    { k: 'התחייבויות עתידיות בפועל', v: moneyC(futureOpen), d: 'יתרות פתוחות שמועד אספקתן בעתיד', hint: 'נתון קשה מהקובץ, לא תחזית' },
    { k: `תחזית בתרחיש +${st.infl}%`, v: moneyC(year * (1 + st.infl / 100)), d: 'אם המחירים יעלו לרוחב' },
    st.budget
      ? { k: 'מול תקציב', v: pct(year / st.budget * 100 - 100), d: `תקציב ${moneyC(st.budget)}` }
      : { k: 'תקציב', v: 'לא הוזן', d: 'הזן תקציב שנתי כדי להשוות' }
  ]);

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'היסטוריה ותחזית', 'קו מלא = בפועל, מקווקו = תחזית');
    const n = f.mo.v.length;
    const histX = f.mo.x.slice(Math.max(0, n - 25), n - 1);
    const x = [...histX, ...f.fc.map(q => ymstr(Math.floor(q.k / 12), q.k % 12 + 1))];
    const hist = [...f.mo.v.slice(Math.max(0, n - 25), n - 1), ...f.fc.map(() => null)];
    const fut = [...histX.slice(0, -1).map(() => null), f.mo.v[n - 2], ...f.fc.map(q => q.v)];
    lines(b, x, [
      { name: 'בפועל', data: hist, area: true, color: cssv('--accent') },
      { name: 'תחזית', data: fut, dash: true, color: cssv('--c5') }
    ].concat(st.budget ? [{ name: 'תקציב חודשי', data: x.map(() => st.budget / 12), dash: true, color: cssv('--up'), showSymbol: false }] : []),
    { height: '300px' });
  }
  {
    const b = panel(g, 'תחזית רבעונית');
    const qm = new Map();
    f.fc.forEach(q => {
      const y = Math.floor(q.k / 12), qq = Math.floor((q.k % 12) / 3) + 1;
      const kk = `Q${qq}/${String(y).slice(2)}`;
      qm.set(kk, (qm.get(kk) || 0) + q.v);
    });
    lines(b, [...qm.keys()], [{ name: 'תחזית', type: 'bar', data: [...qm.values()], color: cssv('--c5') }], { height: '300px' });
  }
  {
    const b = panel(g, 'תרחישי חיסכון', 'מה היה קורה לבסיס ההוצאה בתקופה המסוננת בכל שיעור חיסכון');
    const base = sum(idx, M.a);
    const { out } = buildOpportunities(idx, ctx.track.opps);
    const found = out.filter(x => x.basis === 'מחושב').reduce((s, x) => s + x.save, 0);
    const rows = [3, 5, 7, 10].map(p => ({ p, save: base * p / 100, after: base * (1 - p / 100), gap: base * p / 100 - found }));
    const el = box(b, '240px');
    draw(el, {
      tooltip: { trigger: 'axis', formatter: p => `חיסכון ${p[0].name}<br>יעד <b>${money(p[0].value)}</b><br>מזוהה בפועל ${money(found)}` },
      xAxis: { type: 'category', data: rows.map(r2 => r2.p + '%') },
      yAxis: { type: 'value', axisLabel: { formatter: v => moneyC(v) } },
      series: [{
        type: 'bar', data: rows.map(r2 => r2.save), itemStyle: { color: cssv('--accent'), borderRadius: [3, 3, 0, 0] },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: found, lineStyle: { color: cssv('--c5'), type: 'dashed', width: 2 }, label: { formatter: 'מזוהה: ' + moneyC(found), fontSize: 10, color: cssv('--ink2') } }] }
      }]
    });
    table(b, [
      { k: 'p', t: 'שיעור', f: v => v + '%' },
      { k: 'save', t: 'יעד חיסכון ₪', n: true, f: v => money(v) },
      { k: 'after', t: 'בסיס אחרי', n: true, f: v => money(v) },
      { k: 'gap', t: 'פער מהמזוהה', n: true, f: v => v > 0 ? `<span class="up">${money(v)}</span>` : '<span class="down">מכוסה</span>' }
    ], rows, { all: true, sort: 0, asc: true, name: 'תרחישי חיסכון' });
  }
  {
    const b = panel(g, 'מגמה לפי קטגוריה', 'שיפוע חודשי — מי גדל ומי מתכנס');
    const top = topMap(sumBy(idx, M.cat, M.a), 10);
    const perCat = new Map();
    for (let j = 0; j < idx.length; j++) {
      const k = idx[j];
      let mm = perCat.get(M.cat[k]);
      if (!mm) { mm = new Map(); perCat.set(M.cat[k], mm); }
      mm.set(M.ym[k], (mm.get(M.ym[k]) || 0) + M.a[k]);
    }
    const rows = top.map(([ci, v]) => {
      const mm = perCat.get(ci) || new Map();
      const ks = [...mm.keys()].sort((a, b2) => a - b2), vs = ks.map(k => mm.get(k));
      const xb = (vs.length - 1) / 2, yb = vs.reduce((s, x) => s + x, 0) / Math.max(1, vs.length);
      let nu = 0, de = 0;
      vs.forEach((y, i) => { nu += (i - xb) * (y - yb); de += Math.pow(i - xb, 2); });
      return { _c: ci, name: CATN(ci), spend: v, slope: de ? nu / de : 0, months: vs.length };
    }).sort((a, b2) => b2.slope - a.slope);
    table(b, [
      { k: 'name', t: 'קטגוריה', w: true }, { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) },
      { k: 'slope', t: 'שיפוע חודשי', n: true, f: v => `<span class="${v > 0 ? 'up' : 'down'}">${moneyC(v)}</span>` },
      { k: 'months', t: 'חודשים', n: true }
    ], rows, { all: true, sort: 2, name: 'מגמות קטגוריה' });
  }
  note(root, 'התחזית אינה תקציב ואינה התחייבות. היא מבוססת אך ורק על מגמת הרכש ההיסטורית ועל עונתיות שנמדדה בקובץ. שינויים בתוכנית הייצור, בתמהיל המוצרים או בשערי המטבע אינם מגולמים בה.', 'warn');
}

/* ======================= 17 · התראות ======================= */
export function viewAlerts(root, idx, ctx) {
  const ctl = panel(root, 'ספי ההתראות', 'שינוי סף מעדכן את כל ההתראות מיד');
  const r = EL('div', { class: 'inline-form' });
  const inp = (lbl, key, suf) => r.append(
    EL('label', { class: 'flbl', text: lbl }),
    EL('input', { class: 'inp', type: 'number', style: 'width:86px', value: ACFG[key], onchange: e => { ACFG[key] = +e.target.value || 0; ctx.redraw(); } }),
    EL('span', { class: 'flbl', text: suf || '' }));
  inp('עליית מחיר מעל', 'priceJump', '%'); inp('גידול כמות מעל', 'qtyJump', '%');
  inp('הזמנה פתוחה מעל', 'openAge', 'ימים'); inp('הוצאה מינימלית', 'minSpend', '₪');
  inp('ריכוז ספק מעל', 'concShare', '%'); inp('חלון כפילות', 'dupDays', 'ימים');
  ctl.appendChild(r);

  const al = buildAlerts(idx);
  const cnt = { crit: al.filter(a => a.sev === 'crit').length, warn: al.filter(a => a.sev === 'warn').length, info: al.filter(a => a.sev === 'info').length };
  tiles(root, [
    { k: 'התראות חמורות', v: num(cnt.crit), d: 'דורשות טיפול מיידי', lead: cnt.crit > 0 },
    { k: 'התראות בינוניות', v: num(cnt.warn), d: 'לבדיקה בשבוע הקרוב' },
    { k: 'לידיעה', v: num(cnt.info), d: 'מעקב' },
    { k: 'סך ההתראות', v: num(al.length), d: 'על הסינון הנוכחי' }
  ]);
  if (!al.length) { note(root, 'לא זוהו חריגות מעל הספים שהוגדרו בסינון הנוכחי.'); return; }

  const b = panel(root, 'כל ההתראות');
  al.forEach(a => {
    const d = EL('div', { class: 'alertrow' });
    d.innerHTML = `<span class="sev ${a.sev}"></span><div>
      <h4>${esc(a.t)} <span class="pill ${a.sev === 'crit' ? 'high' : a.sev === 'warn' ? 'medium' : 'wait'}">${a.sev === 'crit' ? 'חמורה' : a.sev === 'warn' ? 'בינונית' : 'לידיעה'}</span></h4>
      <p>${esc(a.p)}</p>
      <p class="act">פעולה מומלצת: ${esc(a.act)}</p>
      <div class="src">מקור הנתונים: ${esc(a.src)}</div></div>`;
    if (a.go) d.onclick = () => {
      if (a.go.item != null) itemCard(a.go.item);
      else if (a.go.sup != null) supplierCard(a.go.sup);
      else if (a.go.drill) drill(a.go.drill[0], a.go.drill[1]);
      else if (a.go.dup) dupDrawer(a.go.dup);
      else if (a.go.tab) ctx.go(a.go.tab);
    };
    b.appendChild(d);
  });
}

function dupDrawer(dup) {
  drawer('רכישות כפולות חשודות', `${num(dup.length)} זוגות`, b => {
    const g = grp(b);
    g.appendChild(EL('p', { class: 'banner warn', text: 'זיהוי לפי התאמה מדויקת של ספק, מק״ט, כמות ומחיר ליחידה בהזמנות שונות בטווח זמן קצר. ייתכנו מקרים לגיטימיים כמו אספקה בפעימות — נדרשת בדיקה.' }));
    const rows = dup.map(x => ({
      sup: SUPN(M.s[x.k1]), item: IDESC(M.i[x.k1]) || ITEM(M.i[x.k1]),
      po1: M.dims.po[M.p[x.k1]], d1: dstr(M.d[x.k1]), po2: M.dims.po[M.p[x.k2]], d2: dstr(M.d[x.k2]),
      gap: M.d[x.k2] - M.d[x.k1], q: M.q[x.k1], a: x.a
    }));
    table(g, [
      { k: 'sup', t: 'ספק', w: true }, { k: 'item', t: 'מק״ט', w: true },
      { k: 'po1', t: 'הזמנה א׳' }, { k: 'd1', t: 'תאריך' },
      { k: 'po2', t: 'הזמנה ב׳' }, { k: 'd2', t: 'תאריך' },
      { k: 'gap', t: 'ימים', n: true }, { k: 'q', t: 'כמות', n: true, f: v => num(v, 2) },
      { k: 'a', t: 'סכום', n: true, f: v => money(v) }
    ], rows, { size: 15, sort: 8, name: 'רכישות כפולות' });
  });
}
