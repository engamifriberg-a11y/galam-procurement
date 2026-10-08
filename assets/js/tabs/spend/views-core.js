// מסכי הליבה: תמונת מצב הנהלה, ניתוח ספקים, ניתוח מק"טים, פארטו,
// ומגירות הפירוט של ספק ושל מק"ט.
import { esc } from '../../core/base.js';
import {
  M, F, IDX, idxWhere, scanWindow, priorYearIdx, curWindow, yoyUsable, invalidate,
  agg, sumBy, sum, nuniq, topMap, monthly, quarterly, supAgg, itemAgg, openIdx,
  wapOf, lastPrice, dayOf, dstr, money, moneyC, num, pct, price, ABCN, recomputeABC,
  SUP, SUPN, SUPID, ITEM, IDESC, UNIT, PTYP, CATN
} from './model.js';
import { priceGaps } from './analytics.js';
import { EL, panel, tiles, tileHtml, table, barRows, barCell, trend, deltaOf, note, drawer, grp, kv, drill, LINE_COLS, lineRows, seg } from './ui.js';
import { hbar, lines, pareto, donut, cssv, box, draw } from './charts.js';

export const YOY_NOTE = 'התקופה הנבחרת ארוכה משנה, ולכן ״התקופה המקבילה בשנה קודמת״ הייתה חופפת לעצמה וההשוואה חסרת משמעות. בחר שנה אחת או טווח של עד 12 חודשים. להשוואת שתי שנים מלאות השתמש במסך ״השוואה בין שנים״.';

/* ======================= מגירת ספק ======================= */
export function supplierCard(si) {
  const all = scanWindow(null, null, k => M.s[k] === si);
  const inF = idxWhere(k => M.s[k] === si);
  const info = SUP(si) || {};
  drawer('כרטיס ספק · ' + SUPN(si), `${SUPID(si)} · ${info.typeDesc || 'ללא סיווג'}`, (b, bag) => {
    const spend = sum(all, M.a), op = openIdx(all);
    let last = -1;
    for (let j = 0; j < all.length; j++) if (M.d[all[j]] > last) last = M.d[all[j]];
    const g = grp(b);
    g.innerHTML = `<div class="tiles">
      ${tileHtml({ k: 'סך רכש (כל התקופות)', v: moneyC(spend), d: `${num(nuniq(all, M.p))} הזמנות · ${num(all.length)} שורות`, lead: true })}
      ${tileHtml({ k: 'בתקופה המסוננת', v: moneyC(sum(inF, M.a)), d: `${num(nuniq(inF, M.p))} הזמנות` })}
      ${tileHtml({ k: 'התחייבות פתוחה', v: moneyC(sum(op, M.openILS)), d: `${num(nuniq(op, M.p))} הזמנות` })}
      ${tileHtml({ k: 'שווי הזמנה ממוצע', v: moneyC(spend / Math.max(1, nuniq(all, M.p))), d: 'סך רכש חלקי מספר הזמנות' })}
      ${tileHtml({ k: 'מק״טים', v: num(nuniq(all, M.i)), d: 'ייחודיים' })}
      ${tileHtml({ k: 'רכש אחרון', v: dstr(last), d: 'תאריך ההזמנה האחרונה' })}</div>`;

    const md = grp(b, 'נתוני אב מלשונית ספקים');
    kv(md, [
      ['מספר ספק', esc(SUPID(si))],
      ['סוג ספק', esc(info.typeDesc || '— ללא סיווג —') + (info.typeCode ? ` (${esc(info.typeCode)})` : '')],
      ['קטגוריה', esc(M.catMap[info.typeDesc || ''] || 'אחרים')],
      ['סטטוס', esc(info.status || '—')],
      ['תנאי תשלום', esc(info.terms || '—')],
      ['תאריך פתיחה', info.opened >= 0 ? dstr(info.opened) : '—'],
      ['עיר / ארץ', esc([info.city, info.country].filter(Boolean).join(', ') || '—')],
      ['סיווג ענפי', esc(info.classDesc || '—')]
    ]);

    const g1 = grp(b, 'מחזור רכש לפי חודש');
    const mo = monthly(all);
    lines(g1, mo.x, [{ name: 'רכש', data: mo.v, area: true, color: cssv('--accent') }], { height: '200px', bag });

    const byY = sumBy(all, M.y, M.a);
    const ys = [...byY.keys()].sort(), vals = ys.map(y => byY.get(y));
    const g2 = grp(b, 'מחזור לפי שנה');
    lines(g2, ys.map(String), [{ name: 'רכש', type: 'bar', data: vals, color: cssv('--c2') }], { height: '190px', bag });
    g2.appendChild(EL('div', { class: 'pillrow' },
      ys.map((y, n) => n ? `<span class="pill ${vals[n] > vals[n - 1] ? 'high' : 'ok'}">${y}: ${pct((vals[n] / vals[n - 1] - 1) * 100, 0)}</span>` : '').join(' ')));

    const g3 = grp(b, 'מק״טים מובילים');
    hbar(g3, topMap(sumBy(all, M.i, M.a), 10).map(([it, v]) => [IDESC(it) || ITEM(it), v, it]),
      { labelW: 130, onClick: r => itemCard(r[2]), bag });

    const g4 = grp(b, 'פילוח לפי סוג הזמנת רכש');
    hbar(g4, topMap(sumBy(all, M.pt, M.a), 8).map(([p, v]) => [PTYP(p), v]), { labelW: 120, color: cssv('--c5'), bag });

    const g5 = grp(b, 'כל שורות ההזמנה');
    table(g5, LINE_COLS(), lineRows(all), { size: 10, name: 'ספק - ' + SUPN(si), sort: 10 });
  });
}

/* ======================= מגירת מק"ט ======================= */
export function itemCard(it) {
  const all = scanWindow(null, null, k => M.i[k] === it);
  const u = M.itemUnit[it], un = UNIT(u);
  const catchAll = !!M.itemCatchAll[it];
  drawer('ניתוח מק״ט · ' + (IDESC(it) || ITEM(it)),
    `${ITEM(it)} · יחידה ${un} · ${catchAll ? 'קוד מרכז עלות' : (M.itemComparable[it] ? 'בר-השוואה' : 'לא בר-השוואה')}`,
    (b, bag) => {
      const spend = sum(all, M.a), qty = sum(all, M.q);
      const w = wapOf(all, it), lp = lastPrice(all, it);
      let mn = Infinity, mx = -Infinity;
      for (let j = 0; j < all.length; j++) {
        const k = all[j];
        if (M.u[k] !== u) continue;
        const v = M.ilsU[k];
        if (v > 0) { if (v < mn) mn = v; if (v > mx) mx = v; }
      }
      const g = grp(b);
      g.innerHTML = `<div class="tiles">
        ${tileHtml({ k: 'סך הוצאה', v: moneyC(spend), d: `${num(nuniq(all, M.p))} הזמנות · ${num(all.length)} שורות`, lead: true })}
        ${tileHtml({ k: 'כמות מצטברת', v: num(qty, 2) + ' ' + un, d: 'ביחידת המידה העיקרית' })}
        ${tileHtml({ k: 'מחיר ממוצע משוקלל', v: w ? price(w.wap) : '—', d: w ? `לפי כמות, ל${un}` : 'אין בסיס חישוב', hint: 'סך סכום(ILS) חלקי סך הכמות — לא ממוצע פשוט של מחירי השורות' })}
        ${tileHtml({ k: 'מינימום / מקסימום', v: isFinite(mn) ? `${price(mn)} / ${price(mx)}` : '—', d: isFinite(mn) && mn > 0 ? `פער ${((mx / mn - 1) * 100).toFixed(0)}%` : '' })}
        ${tileHtml({ k: 'מחיר אחרון', v: lp ? price(lp.p) : '—', d: lp ? `${dstr(lp.d)} · ${esc(SUPN(lp.s))}` : '' })}
        ${tileHtml({ k: 'ספקים', v: num(nuniq(all, M.s)), d: nuniq(all, M.s) === 1 ? 'ספק יחיד' : 'מספר ספקים' })}</div>`;

      if (catchAll) note(b, 'המק״ט הזה מתנהג כקוד מרכז-עלות: יחידת המידה אינה מדידה ופיזור המחירים גדול מפי 10. השוואת מחירי יחידה עליו חסרת משמעות, והוא מוחרג מניתוחי המחירים ומהזדמנויות החיסכון.', 'warn');
      else if (!M.itemComparable[it]) note(b, 'המק״ט סומן כלא בר-השוואה — יחידת מידה שאינה מדידה או מעט מדי תצפיות. השוואת מחירים בין ספקים עליו אינה זמינה.', 'warn');

      const gp = grp(b, `מחיר לאורך זמן · ${un}`);
      const pts = [];
      for (let j = 0; j < all.length; j++) {
        const k = all[j];
        if (M.u[k] !== u || !(M.ilsU[k] > 0)) continue;
        pts.push([M.d[k], M.ilsU[k], M.s[k], M.q[k], M.dims.po[M.p[k]]]);
      }
      pts.sort((a, c) => a[0] - c[0]);
      if (!pts.length) gp.appendChild(EL('p', { class: 'note', text: 'אין תצפיות מחיר ביחידה זו.' }));
      else {
        const sups = [...new Set(pts.map(p => p[2]))];
        const el = box(gp, '240px');
        draw(el, {
          tooltip: { trigger: 'item', formatter: p => `${esc(SUPN(p.data[2]))}<br>${dstr(p.data[0])}<br><b>${price(p.data[1])}</b> / ${un}<br>כמות ${num(p.data[3], 2)} · ${esc(p.data[4])}` },
          legend: { show: sups.length > 1, data: sups.map(s => SUPN(s)) },
          xAxis: { type: 'category', data: [...new Set(pts.map(p => p[0]))].sort((a, c) => a - c).map(d => dstr(d)), axisLabel: { show: false } },
          yAxis: { type: 'value', axisLabel: { formatter: v => price(v) } },
          series: sups.map(s => ({
            name: SUPN(s), type: 'scatter', symbolSize: 9,
            data: pts.filter(p => p[2] === s).map(p => [dstr(p[0]), p[1], p[2], p[3], p[4]])
          })).concat(w ? [{
            name: 'ממוצע משוקלל', type: 'line', showSymbol: false,
            data: pts.map(() => w.wap), lineStyle: { type: 'dashed', width: 1.4, color: cssv('--ink3') }
          }] : [])
        }, null, bag);
      }

      const gq = grp(b, 'מגמת צריכה חודשית');
      const mq = monthly(all, M.q);
      lines(gq, mq.x, [{ name: 'כמות ' + un, type: 'bar', data: mq.v, color: cssv('--c5') }], { height: '190px', noMoney: true, bag });
      gq.appendChild(EL('p', { class: 'note', text: 'רכש אינו בהכרח צריכה בפועל: גידול יכול לנבוע גם מבניית מלאי או מתזמון הזמנות.' }));

      const gs = grp(b, 'ספקים שמוכרים את המק״ט');
      const sg = new Map();
      for (let j = 0; j < all.length; j++) {
        const k = all[j];
        if (M.u[k] !== u || !(M.q[k] > 0)) continue;
        let o = sg.get(M.s[k]);
        if (!o) { o = { q: 0, a: 0, pos: new Set(), last: -1 }; sg.set(M.s[k], o); }
        o.q += M.q[k]; o.a += M.a[k]; o.pos.add(M.p[k]);
        if (M.d[k] > o.last) o.last = M.d[k];
      }
      const srows = [...sg.entries()].map(([s, o]) => ({ sup: SUPN(s), _si: s, wap: o.a / o.q, q: o.q, a: o.a, npo: o.pos.size, last: dstr(o.last), _l: o.last })).sort((a, c) => a.wap - c.wap);
      const best = srows[0];
      table(gs, [
        { k: 'sup', t: 'ספק', w: true },
        { k: 'wap', t: 'מחיר משוקלל', n: true, f: v => price(v) },
        { k: 'gap', t: 'פער מהטוב', n: true, sortV: r => r.wap, f: (v, r) => best && best.wap > 0 ? `<span class="${r.wap > best.wap * 1.01 ? 'up' : 'down'}">${pct((r.wap / best.wap - 1) * 100, 0)}</span>` : '—' },
        { k: 'q', t: 'כמות', n: true, f: v => num(v, 2) },
        { k: 'a', t: 'הוצאה', n: true, f: v => money(v) },
        { k: 'npo', t: 'הזמנות', n: true },
        { k: 'last', t: 'רכש אחרון', sortV: r => r._l }
      ], srows, { all: true, sort: 1, asc: true, name: 'ספקים למק״ט', onRow: r => supplierCard(r._si) });
      if (best && srows.length > 1 && M.itemComparable[it] && !catchAll) {
        const save = srows.reduce((s, r) => s + Math.max(0, (r.wap - best.wap) * r.q), 0);
        gs.appendChild(EL('p', { class: 'banner', text: save > 0
          ? `מיקוד משא ומתן: יישור כל הרכש למחיר שהושג בפועל אצל ${best.sup} (${price(best.wap)}) היה חוסך ${money(save)} על הכמות שנרכשה.`
          : 'כל הספקים מתומחרים זהה — אין פער לניצול.' }));
      }

      const gy = grp(b, 'השוואה בין שנים');
      const years = [...new Set([...all].map(k => M.y[k]))].sort();
      const yrows = years.map(y => {
        const w2 = scanWindow(dayOf(y, 1, 1), dayOf(y, 12, 31), k => M.i[k] === it);
        const ww = wapOf(w2, it);
        return { y, spend: sum(w2, M.a), qty: sum(w2, M.q), wap: ww ? ww.wap : null, pos: nuniq(w2, M.p) };
      });
      yrows.forEach((r, n) => {
        r.dSpend = n && yrows[n - 1].spend ? (r.spend / yrows[n - 1].spend - 1) * 100 : null;
        r.dWap = n && yrows[n - 1].wap ? (r.wap / yrows[n - 1].wap - 1) * 100 : null;
      });
      table(gy, [
        { k: 'y', t: 'שנה' }, { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) },
        { k: 'dSpend', t: 'שינוי', n: true, f: v => trend(v) },
        { k: 'qty', t: 'כמות', n: true, f: v => num(v, 1) },
        { k: 'wap', t: 'מחיר משוקלל', n: true, f: v => price(v) },
        { k: 'dWap', t: 'שינוי מחיר', n: true, f: v => trend(v) },
        { k: 'pos', t: 'הזמנות', n: true }
      ], yrows, { all: true, sort: 0, asc: true, name: 'מק״ט לפי שנה' });

      const gt = grp(b, 'כל שורות ההזמנה');
      table(gt, LINE_COLS(), lineRows(all), { size: 10, name: 'מק״ט ' + ITEM(it), sort: 10 });
    });
}

/* ======================= 01 · תמונת מצב הנהלה ======================= */
export function viewExec(root, idx, ctx) {
  const w = curWindow(), prv = priorYearIdx();
  const spend = sum(idx, M.a), op = openIdx(idx), opVal = sum(op, M.openILS);
  const yoyOK = yoyUsable() && prv.length;
  const d = deltaOf(spend, sum(prv, M.a));
  tiles(root, [
    { k: 'שווי הרכש בתקופה', v: moneyC(spend), d: `${dstr(w.from)} – ${dstr(w.to)}`, lead: true, hint: 'סכום עמודת סכום (ILS) של שורות ההזמנה המסוננות' },
    { k: 'שינוי מול תקופה מקבילה', v: yoyOK ? `<span class="${d > 1 ? 'up' : d < -1 ? 'down' : 'flat'}">${pct(d)}</span>` : '<span class="flat" style="font-size:19px">לא זמין</span>', d: yoyOK ? `${moneyC(sum(prv, M.a))} בשנה קודמת` : (yoyUsable() ? 'אין רכש בתקופה המקבילה' : 'בחר שנה או טווח של עד 12 חודשים') },
    { k: 'התחייבויות פתוחות', v: moneyC(opVal), d: `${num(nuniq(op, M.p))} הזמנות · ${num(op.length)} שורות`, hint: 'סכום(ILS)×(יתרה לאספקה/כמות). אינו הוצאה בפועל' },
    { k: 'ספקים פעילים', v: num(nuniq(idx, M.s)), d: `מתוך ${num(M.dims.sup.length)} בקובץ` },
    { k: 'מק״טים שנרכשו', v: num(nuniq(idx, M.i)), d: `${num(idx.length)} שורות הזמנה` },
    { k: 'הזמנות רכש', v: num(nuniq(idx, M.p)), d: `${num(nuniq(op, M.p))} עם יתרה לאספקה` }
  ]);
  note(root, 'שווי הרכש מבוסס על שורות הזמנת רכש ואינו חשבוניות או אספקות בפועל. התחייבות פתוחה היא יתרה שטרם סופקה — לא הוצאה שהתהוותה.');
  if (!yoyUsable()) note(root, YOY_NOTE, 'warn');

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);

  {
    const b = panel(g, 'מגמת רכש', 'השוואה חודשית מול השנה הקודמת');
    const mo = monthly(idx), moP = monthly(prv);
    const map = new Map(moP.keys.map((k, n) => [k + 12, moP.v[n]]));
    lines(b, mo.x, [{ name: 'התקופה הנבחרת', data: mo.v, area: true, color: cssv('--accent') }]
      .concat(yoyOK ? [{ name: 'שנה קודמת', data: mo.keys.map(k => map.get(k) ?? null), color: cssv('--c5') }] : []),
    { onClick: e => { const k = mo.keys[e.dataIndex]; drill(`רכש ב${mo.x[e.dataIndex]}`, idxWhere(r => M.ym[r] === k)); } });
  }
  {
    const b = panel(g, 'רבעונים', 'סך הרכש לפי רבעון קלנדרי');
    const q = quarterly(idx);
    lines(b, q.x, [{ name: 'רכש', type: 'bar', data: q.v, color: cssv('--c2') }],
      { onClick: e => { const k = q.keys[e.dataIndex]; drill(`רכש ב${q.x[e.dataIndex]}`, idxWhere(r => M.y[r] * 4 + (M.qt[r] - 1) === k)); } });
  }
  {
    const b = panel(g, 'עשרת הספקים הגדולים', 'לחיצה פותחת את כרטיס הספק');
    const rows = topMap(sumBy(idx, M.s, M.a), 10).map(([si, v]) => [SUPN(si), v, si]);
    barRows(b, rows, { onClick: r => supplierCard(r[2]) });
    b.appendChild(EL('p', { class: 'note', text: `עשרת הספקים מרכזים ${(rows.reduce((s, r) => s + r[1], 0) / spend * 100).toFixed(1)}% מהרכש בתקופה.` }));
  }
  {
    const b = panel(g, 'עשרת המק״טים בעלי ההוצאה הגבוהה', 'לחיצה פותחת ניתוח מק״ט');
    barRows(b, topMap(sumBy(idx, M.i, M.a), 10).map(([it, v]) => [IDESC(it) || ITEM(it), v, it]), { onClick: r => itemCard(r[2]) });
  }
  {
    const b = panel(g, 'פילוח לפי ' + (M.catBasis === 'ptyp' ? 'סוג הזמנת רכש' : M.catBasis === 'styp' ? 'סוג ספק' : 'קטגוריית רכש'), 'בסיס הקטגוריה נקבע במסך ניהול קטגוריות');
    barRows(b, topMap(sumBy(idx, M.cat, M.a), 10).map(([ci, v]) => [CATN(ci), v, ci]),
      { onClick: r => { F.cat.clear(); F.cat.add(r[2]); ctx.refresh(); } });
  }
  {
    const gaps = priceGaps(idx);
    const b = panel(g, 'הזדמנויות חיסכון מרכזיות', 'פערי מחיר בין ספקים, אחרי סינון מק״טים שאינם ברי-השוואה');
    if (!gaps.length) b.appendChild(EL('p', { class: 'note', text: 'לא נמצאו פערי מחיר בני-השוואה בסינון הנוכחי.' }));
    else {
      b.appendChild(EL('div', { class: 'bignum', text: moneyC(gaps.reduce((s, x) => s + x.save, 0)) }));
      b.appendChild(EL('p', { class: 'note', text: `על בסיס המחיר הטוב ביותר שהושג בפועל · ${num(gaps.length)} מק״טים` }));
      table(b, [
        { k: 'desc', t: 'מק״ט', w: true }, { k: 'nsup', t: 'ספקים', n: true },
        { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) },
        { k: 'save', t: 'פוטנציאל', n: true, f: v => `<b>${money(v)}</b>` },
        { k: 'conf', t: 'ביטחון', f: v => `<span class="pill ${v === 'גבוהה' ? 'ok' : v === 'בינונית' ? 'medium' : 'low'}">${v}</span>` }
      ], gaps.slice(0, 8).map(x => ({ desc: (IDESC(x.it) || ITEM(x.it)) + ' · ' + x.unit, nsup: x.nsup, spend: x.spend, save: x.save, conf: x.conf, _it: x.it })),
      { all: true, name: 'הזדמנויות', onRow: r => itemCard(r._it) });
      b.appendChild(EL('button', { class: 'btn sm', text: 'לכל ההזדמנויות ←', onclick: () => ctx.go('save') }));
    }
  }
  {
    const b = panel(g, 'תלות בספקים', 'ריכוזיות הרכש וחשיפה לספק יחיד');
    const sm = topMap(sumBy(idx, M.s, M.a));
    const tot = sm.reduce((s, x) => s + x[1], 0);
    const hhi = sm.reduce((s, x) => s + Math.pow(x[1] / tot * 100, 2), 0);
    kv(b, [
      ['הספק הגדול', `${(sm[0][1] / tot * 100).toFixed(1)}% · ${esc(SUPN(sm[0][0]))}`],
      ['5 הגדולים', `${(sm.slice(0, 5).reduce((s, x) => s + x[1], 0) / tot * 100).toFixed(1)}%`],
      ['10 הגדולים', `${(sm.slice(0, 10).reduce((s, x) => s + x[1], 0) / tot * 100).toFixed(1)}%`],
      ['מדד ריכוזיות HHI', `${num(hhi)} ${hhi > 2500 ? '<span class="pill high">ריכוזי מאוד</span>' : hhi > 1500 ? '<span class="pill medium">ריכוזי</span>' : '<span class="pill ok">מפוזר</span>'}`]
    ]);
    const si = agg(idx, M.i, { sups: [M.s, 'nuniq'], spend: [M.a, 'sum'] });
    let ss = 0, ssn = 0;
    for (const o of si.values()) if (o.sups === 1) { ss += o.spend; ssn++; }
    b.appendChild(EL('p', { class: 'banner' + (ss / tot > .4 ? ' warn' : ''), text: `${num(ssn)} מק״טים נרכשים מספק יחיד — ${moneyC(ss)} (${(ss / tot * 100).toFixed(1)}% מהרכש בתקופה).` }));
    b.appendChild(EL('button', { class: 'btn sm', text: 'לניתוח התלות ←', onclick: () => ctx.go('dep') }));
  }
}

/* ======================= 02 · ניתוח ספקים ======================= */
export function viewSuppliers(root, idx, ctx) {
  const prv = priorYearIdx();
  const cur = supAgg(idx), old = sumBy(prv, M.s, M.a), tot = sum(idx, M.a);
  const rows = [...cur.entries()].map(([si, o]) => {
    const p = old.get(si) || 0;
    return {
      _si: si, id: SUPID(si), sup: SUPN(si), styp: M.dims.styp[M.supStyp[si]],
      spend: o.spend, share: o.spend / tot * 100, pos: o.pos, avg: o.spend / o.pos,
      items: o.items, open: o.open, prv: p, delta: p ? (o.spend / p - 1) * 100 : null, abs: o.spend - p,
      last: dstr(o.last), _last: o.last, first: dstr(o.first), _first: o.first,
      abc: ABCN[M.supABC[si]], stat: (SUP(si) || {}).status || '—'
    };
  }).sort((a, b) => b.spend - a.spend);
  let run = 0;
  rows.forEach(r => { run += r.share; r.cum = run; });
  const nu = rows.filter(r => !old.has(r._si));
  const lost = [...old.keys()].filter(si => !cur.has(si));

  tiles(root, [
    { k: 'ספקים פעילים בתקופה', v: num(rows.length), d: `${num(nuniq(idx, M.p))} הזמנות`, lead: true },
    { k: 'שווי הזמנה ממוצע', v: moneyC(tot / Math.max(1, nuniq(idx, M.p))), d: 'סך הרכש חלקי מספר ההזמנות' },
    { k: 'ספקים חדשים', v: num(nu.length), d: `${moneyC(nu.reduce((s, r) => s + r.spend, 0))} — לא היו בתקופה המקבילה` },
    { k: 'ספקים שהופסקו', v: num(lost.length), d: `${moneyC(lost.reduce((s, si) => s + old.get(si), 0))} בתקופה המקבילה` },
    { k: 'ריכוזיות 10 הגדולים', v: rows.slice(0, 10).reduce((s, r) => s + r.share, 0).toFixed(1) + '%', d: 'חלקם בסך הרכש' },
    { k: 'ספקים עד 80% מההוצאה', v: num(rows.filter(r => r.cum <= 80).length), d: 'רמת A בפארטו' }
  ]);
  if (!yoyUsable()) note(root, YOY_NOTE, 'warn');

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'דירוג ספקים לפי היקף כספי');
    barRows(b, rows.slice(0, 14).map(r => [r.sup, r.spend, r._si]), { onClick: r => supplierCard(r[2]) });
  }
  {
    const b = panel(g, 'פילוח לפי סוג ספק');
    barRows(b, topMap(sumBy(idx, M.styp, M.a), 14).map(([s, v]) => [M.dims.styp[s], v, s]),
      { onClick: r => { F.styp.clear(); F.styp.add(r[2]); ctx.refresh(); } });
  }
  {
    const b = panel(g, 'שינויים חדים בהיקף הפעילות', 'מול התקופה המקבילה, שינוי מעל 50 אלף ₪');
    const ch = rows.filter(r => r.delta != null && Math.abs(r.abs) > 5e4).sort((a, b2) => Math.abs(b2.abs) - Math.abs(a.abs)).slice(0, 14);
    if (!ch.length) b.appendChild(EL('p', { class: 'note', text: 'אין שינויים מהותיים מעל הסף בסינון הנוכחי.' }));
    else hbar(b, ch.map(r => [r.sup, r.abs, r._si]), { labelW: 150, color: cssv('--c2'), onClick: r => supplierCard(r[2]) });
  }
  {
    const b = panel(g, 'ריכוזיות הרכש', 'עקומת פארטו של 40 הספקים הגדולים');
    const top = rows.slice(0, 40);
    pareto(b, top.map(r => r.sup), top.map(r => r.spend), top.map(r => r.cum), { height: '270px' });
  }

  const t = panel(root, 'כל הספקים', 'לחיצה על שורה פותחת את כרטיס הספק');
  table(t, [
    { k: 'sup', t: 'ספק', w: true }, { k: 'id', t: 'מספר' }, { k: 'styp', t: 'סוג ספק' },
    { k: 'abc', t: 'ABC', f: v => `<span class="pill ${v === 'A' ? 'ok' : v === 'B' ? 'medium' : 'low'}">${v}</span>` },
    { k: 'spend', t: 'רכש בתקופה', n: true, f: v => barCell(v, rows[0].spend) },
    { k: 'share', t: 'חלק', n: true, f: v => v.toFixed(2) + '%' },
    { k: 'prv', t: 'תקופה מקבילה', n: true, f: v => v ? money(v) : '—' },
    { k: 'delta', t: 'שינוי', n: true, f: v => trend(v) },
    { k: 'pos', t: 'הזמנות', n: true },
    { k: 'avg', t: 'הזמנה ממוצעת', n: true, f: v => money(v) },
    { k: 'items', t: 'מק״טים', n: true },
    { k: 'open', t: 'יתרה פתוחה', n: true, f: v => v ? money(v) : '—' },
    { k: 'last', t: 'רכש אחרון', sortV: r => r._last },
    { k: 'stat', t: 'סטטוס ספק' }
  ], rows, { size: 20, sort: 4, name: 'ספקים', onRow: r => supplierCard(r._si) });

  if (nu.length || lost.length) {
    const g2 = EL('div', { class: 'grid2' });
    root.appendChild(g2);
    if (nu.length) {
      const b = panel(g2, 'ספקים חדשים בתקופה', 'לא היה מהם רכש בתקופה המקבילה');
      table(b, [{ k: 'sup', t: 'ספק', w: true }, { k: 'styp', t: 'סוג' }, { k: 'spend', t: 'רכש', n: true, f: v => money(v) },
        { k: 'pos', t: 'הזמנות', n: true }, { k: 'first', t: 'רכש ראשון', sortV: r => r._first }],
      nu.sort((a, b2) => b2.spend - a.spend), { size: 8, sort: 2, name: 'ספקים חדשים', onRow: r => supplierCard(r._si) });
    }
    if (lost.length) {
      const b = panel(g2, 'ספקים שהפעילות איתם הופסקה', 'היה רכש בתקופה המקבילה, אין בתקופה הנבחרת');
      table(b, [{ k: 'sup', t: 'ספק', w: true }, { k: 'prv', t: 'רכש בתקופה המקבילה', n: true, f: v => money(v) }, { k: 'styp', t: 'סוג' }],
        lost.map(si => ({ _si: si, sup: SUPN(si), prv: old.get(si), styp: M.dims.styp[M.supStyp[si]] })).sort((a, b2) => b2.prv - a.prv),
        { size: 8, sort: 1, name: 'ספקים שהופסקו', onRow: r => supplierCard(r._si) });
    }
  }
}

/* ======================= 03 · ניתוח מק"טים ======================= */
export function viewItems(root, idx, ctx) {
  const prv = priorYearIdx(), ia = itemAgg(idx);
  const oldQ = sumBy(prv, M.i, M.q), tot = sum(idx, M.a);
  const wapPrv = new Map();
  for (const [it] of ia) { const wp = wapOf(prv, it); if (wp) wapPrv.set(it, wp.wap); }
  const rows = [...ia.entries()].map(([it, o]) => {
    const w = wapOf(idx, it), lp = lastPrice(idx, it), pq = oldQ.get(it) || 0, wp = wapPrv.get(it);
    return {
      _it: it, item: ITEM(it), desc: IDESC(it), unit: UNIT(M.itemUnit[it]),
      spend: o.spend, share: o.spend / tot * 100, qty: o.qty, pos: o.pos, sups: o.sups,
      wap: w ? w.wap : null, pmin: isFinite(o.pmin) ? o.pmin : null, pmax: isFinite(o.pmax) ? o.pmax : null,
      last: lp ? lp.p : null, lastD: lp ? dstr(lp.d) : '—', _lastD: lp ? lp.d : -1,
      dQty: pq ? (o.qty / pq - 1) * 100 : null,
      dWap: (wp && w) ? (w.wap / wp - 1) * 100 : null,
      spread: (o.pmin > 0 && isFinite(o.pmax)) ? (o.pmax / o.pmin - 1) * 100 : null,
      abc: ABCN[M.itemABC[it]],
      cmp: M.itemCatchAll[it] ? 'מרכז עלות' : (M.itemComparable[it] ? 'בר-השוואה' : 'לא בר-השוואה'),
      open: o.open
    };
  }).sort((a, b) => b.spend - a.spend);

  let r80 = 0, n80 = 0;
  for (const x of rows) { r80 += x.share; n80++; if (r80 >= 80) break; }

  tiles(root, [
    { k: 'מק״טים בתקופה', v: num(rows.length), d: `${num(idx.length)} שורות הזמנה`, lead: true },
    { k: 'מק״טים עד 80% מההוצאה', v: num(n80), d: 'רמת A' },
    { k: 'מק״טים בני-השוואה', v: num(rows.filter(r => r.cmp === 'בר-השוואה').length), d: `${num(rows.filter(r => r.cmp === 'מרכז עלות').length)} קודי מרכז-עלות מוחרגים`, hint: 'יחידת מידה מדידה, או פיזור מחירים סביר עם 3 תצפיות ומעלה' },
    { k: 'מריבוי ספקים', v: num(rows.filter(r => r.sups > 1).length), d: `${num(rows.filter(r => r.sups === 1).length)} מספק יחיד` },
    { k: 'המק״ט הגדול', v: rows[0] ? moneyC(rows[0].spend) : '—', d: rows[0] ? (rows[0].desc || rows[0].item) : '' }
  ]);

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'המק״טים היקרים ביותר', 'לפי הוצאה כספית בתקופה');
    barRows(b, rows.slice(0, 14).map(r => [r.desc || r.item, r.spend, r._it]), { onClick: r => itemCard(r[2]) });
  }
  {
    const b = panel(g, 'המק״טים בעלי הכמות הגבוהה', 'ביחידת המידה העיקרית — לא בר-השוואה בין מק״טים שונים');
    const byQ = rows.filter(r => r.qty > 0).sort((a, b2) => b2.qty - a.qty).slice(0, 14);
    barRows(b, byQ.map(r => [`${r.desc || r.item} (${r.unit})`, r.qty, r._it]), { fmt: v => num(v, 1), onClick: r => itemCard(r[2]) });
  }
  {
    const b = panel(g, 'פערי מחיר פנימיים', 'בין המחיר הגבוה לנמוך לאותו מק״ט · מק״טים בני-השוואה בלבד');
    const sp = rows.filter(r => r.cmp === 'בר-השוואה' && r.spread > 5 && r.spend > 5e4).slice(0, 14);
    if (!sp.length) b.appendChild(EL('p', { class: 'note', text: 'לא נמצאו פערים מעל 5% במק״טים בני-השוואה בסינון הנוכחי.' }));
    else hbar(b, sp.map(r => [r.desc || r.item, r.spread, r._it]), { labelW: 160, fmt: v => v.toFixed(0) + '%', color: cssv('--up'), onClick: r => itemCard(r[2]) });
  }
  {
    const b = panel(g, 'המלצות למיקוד משא ומתן', 'דירוג לפי הוצאה × פער מחיר, מק״טים בני-השוואה עם יותר מספק אחד');
    const nego = rows.filter(r => r.cmp === 'בר-השוואה' && r.sups > 1 && r.spread > 0)
      .map(r => ({ ...r, score: r.spend * (r.spread / 100) })).sort((a, b2) => b2.score - a.score).slice(0, 12);
    if (!nego.length) b.appendChild(EL('p', { class: 'note', text: 'אין מק״טים העונים על התנאים בסינון הנוכחי.' }));
    else table(b, [
      { k: 'desc', t: 'מק״ט', w: true }, { k: 'sups', t: 'ספקים', n: true },
      { k: 'spend', t: 'הוצאה', n: true, f: v => money(v) },
      { k: 'spread', t: 'פער מחיר', n: true, f: v => `<span class="up">${v.toFixed(0)}%</span>` },
      { k: 'score', t: 'עדיפות', n: true, f: v => moneyC(v) }
    ], nego, { all: true, name: 'מיקוד משא ומתן', onRow: r => itemCard(r._it) });
  }

  const t = panel(root, 'כל המק״טים', 'לחיצה על שורה פותחת מסך ניתוח מלא');
  table(t, [
    { k: 'desc', t: 'תאור מוצר', w: true }, { k: 'item', t: 'מק״ט' }, { k: 'unit', t: 'יח׳' },
    { k: 'abc', t: 'ABC', f: v => `<span class="pill ${v === 'A' ? 'ok' : v === 'B' ? 'medium' : 'low'}">${v}</span>` },
    { k: 'spend', t: 'הוצאה', n: true, f: v => barCell(v, rows[0].spend) },
    { k: 'qty', t: 'כמות', n: true, f: v => num(v, 2) },
    { k: 'wap', t: 'מחיר משוקלל', n: true, f: v => price(v) },
    { k: 'pmin', t: 'מינימום', n: true, f: v => price(v) },
    { k: 'pmax', t: 'מקסימום', n: true, f: v => price(v) },
    { k: 'last', t: 'מחיר אחרון', n: true, f: v => price(v) },
    { k: 'dWap', t: 'שינוי מחיר', n: true, f: v => trend(v) },
    { k: 'dQty', t: 'שינוי כמות', n: true, f: v => trend(v) },
    { k: 'sups', t: 'ספקים', n: true }, { k: 'pos', t: 'הזמנות', n: true },
    { k: 'cmp', t: 'השוואה', f: v => `<span class="pill ${v === 'בר-השוואה' ? 'ok' : v === 'מרכז עלות' ? 'high' : 'low'}">${v}</span>` }
  ], rows, { size: 20, sort: 4, name: 'מק״טים', onRow: r => itemCard(r._it) });
  root.appendChild(EL('p', { class: 'note', text: 'מחיר משוקלל = סך סכום(ILS) חלקי סך הכמות ביחידת המידה העיקרית. ממוצע פשוט של מחירי השורות היה מטעה כשהכמויות שונות בסדר גודל.' }));
}

/* ======================= 04 · ABC / פארטו ======================= */
export function viewABC(root, idx, ctx) {
  const st = ctx.state('abc', { a: M.abcT[0], b: M.abcT[1], dim: 'item' });
  const ctl = panel(root, 'ספי הסיווג', 'ברירת המחדל: A עד 80% מההוצאה המצטברת, B עד 95%');
  const row = EL('div', { class: 'inline-form' });
  const mk = (lbl, key, id) => {
    row.append(EL('label', { class: 'flbl', text: lbl }),
      EL('input', {
        type: 'range', min: key === 'a' ? 50 : 55, max: key === 'a' ? 95 : 99, step: 1, value: st[key], style: 'max-width:190px',
        oninput: e => { st[key] = +e.target.value; document.getElementById(id).textContent = st[key] + '%'; },
        onchange: () => {
          if (st.b <= st.a) { if (key === 'a') st.b = Math.min(99, st.a + 5); else st.a = Math.max(50, st.b - 5); }
          recomputeABC(st.a, st.b); invalidate(); ctx.redraw();
        }
      }), EL('b', { id, text: st[key] + '%' }));
  };
  mk('רמה A עד', 'a', 'abcA'); mk('רמה B עד', 'b', 'abcB');
  row.appendChild(seg([['item', 'מק״טים'], ['sup', 'ספקים'], ['styp', 'סוגי ספקים'], ['cat', 'קטגוריות']], st.dim, v => { st.dim = v; ctx.redraw(); }));
  ctl.appendChild(row);

  const dims = {
    item: { arr: M.i, name: it => IDESC(it) || ITEM(it), lbl: 'מק״ט', click: itemCard },
    sup: { arr: M.s, name: SUPN, lbl: 'ספק', click: supplierCard },
    styp: { arr: M.styp, name: n => M.dims.styp[n], lbl: 'סוג ספק' },
    cat: { arr: M.cat, name: CATN, lbl: 'קטגוריה' }
  }[st.dim];

  const sm = topMap(sumBy(idx, dims.arr, M.a));
  const tot = sm.reduce((s, x) => s + x[1], 0);
  let run = 0;
  const rows = sm.map(([g, v]) => {
    run += v;
    const cum = run / tot * 100;
    return { _g: g, name: dims.name(g), spend: v, share: v / tot * 100, cum, cls: cum <= st.a ? 'A' : cum <= st.b ? 'B' : 'C' };
  });
  const cnt = { A: 0, B: 0, C: 0 }, val = { A: 0, B: 0, C: 0 };
  rows.forEach(r => { cnt[r.cls]++; val[r.cls] += r.spend; });

  tiles(root, [
    { k: 'רמה A', v: `${num(cnt.A)}`, d: `${moneyC(val.A)} · ${(val.A / tot * 100).toFixed(1)}% מההוצאה`, lead: true },
    { k: 'רמה B', v: num(cnt.B), d: `${moneyC(val.B)} · ${(val.B / tot * 100).toFixed(1)}%` },
    { k: 'רמה C', v: num(cnt.C), d: `${moneyC(val.C)} · ${(val.C / tot * 100).toFixed(1)}%` },
    { k: 'ריכוזיות', v: `${(cnt.A / rows.length * 100).toFixed(1)}%`, d: `מהגורמים אחראים ל-${(val.A / tot * 100).toFixed(0)}% מההוצאה` }
  ]);

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const b = panel(g, 'עקומת פארטו', '60 הראשונים · הקו הוא האחוז המצטבר');
    const top = rows.slice(0, 60);
    pareto(b, top.map(r => r.name), top.map(r => ({ value: r.spend, itemStyle: { color: r.cls === 'A' ? cssv('--accent') : r.cls === 'B' ? cssv('--c5') : cssv('--ink3') } })), top.map(r => r.cum), {
      marks: [
        { yAxis: st.a, lineStyle: { color: cssv('--accent'), type: 'dashed' }, label: { formatter: 'A' } },
        { yAxis: st.b, lineStyle: { color: cssv('--c5'), type: 'dashed' }, label: { formatter: 'B' } }
      ],
      onClick: e => { if (dims.click) dims.click(top[e.dataIndex]._g); }
    });
  }
  {
    const b = panel(g, 'התפלגות הערך בין הרמות');
    donut(b, [
      { name: 'A', value: val.A, itemStyle: { color: cssv('--accent') } },
      { name: 'B', value: val.B, itemStyle: { color: cssv('--c5') } },
      { name: 'C', value: val.C, itemStyle: { color: cssv('--ink3') } }
    ]);
    b.appendChild(EL('p', { class: 'note', text: `${num(cnt.A)} מתוך ${num(rows.length)} (${(cnt.A / rows.length * 100).toFixed(1)}%) אחראים ל-${(val.A / tot * 100).toFixed(1)}% מתקציב הרכש בתקופה.` }));
  }
  const t = panel(root, 'טבלת הסיווג');
  table(t, [
    { k: 'name', t: dims.lbl, w: true },
    { k: 'cls', t: 'רמה', f: v => `<span class="pill ${v === 'A' ? 'ok' : v === 'B' ? 'medium' : 'low'}">${v}</span>` },
    { k: 'spend', t: 'הוצאה', n: true, f: v => barCell(v, rows[0].spend) },
    { k: 'share', t: 'חלק', n: true, f: v => v.toFixed(2) + '%' },
    { k: 'cum', t: 'מצטבר', n: true, f: v => v.toFixed(1) + '%' }
  ], rows, { size: 25, sort: 2, name: 'ABC', onRow: dims.click ? r => dims.click(r._g) : null });
}
