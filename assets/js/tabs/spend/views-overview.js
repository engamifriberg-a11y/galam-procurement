// מסך 1 — איפה הכסף. דוח אחד שעונה על הכל.
//
// המסך הזה נועד להיקרא מלמעלה למטה פעם אחת ולסגור את התמונה: כמה קנינו,
// מול אשתקד, אצל מי, על מה, ואיך זה נראה לאורך השנים. העוגות והגרפים כאן
// הם לא קישוט — כל אחד מהם לחיץ ומצמצם את המסך למה שנבחר.
import { esc } from '../../core/base.js';
import {
  M, F, money, moneyC, num, pct, dstr, sum, nuniq, sumBy, topMap, monthly,
  scanWindow, invalidate, SUPN, ITEM, IDESC
} from './model.js';
import { EL, panel, tiles, barRows, trend, deltaOf, note } from './ui.js';
import { lines, donut, pareto } from './charts.js';
import { pair, pairNote, yearSpan } from './period.js';
import { supplierCard, itemCard } from './cards.js';

/* עוגה קריאה: שמונה הגדולים, והשאר מקובצים. יותר מזה הופך לטבעת צבעים. */
function slices(map, nameOf, keep = 8) {
  const all = topMap(map);
  const head = all.slice(0, keep).map(([k, v]) => ({ name: nameOf(k) || '—', value: v, _k: k }));
  const rest = all.slice(keep).reduce((a, b) => a + b[1], 0);
  if (rest > 0) head.push({ name: `כל השאר (${all.length - keep})`, value: rest, _k: null });
  return head;
}

export function viewMoney(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const prevTot = p.prev ? sum(p.prev, M.a) : null;
  const pos = nuniq(idx, M.p);

  /* ---------- המספרים הגדולים ---------- */
  const head = panel(root, 'סך הרכש בתקופה', pairNote(p));
  tiles(head, [
    { k: 'סך רכש', v: moneyC(tot), d: money(tot), lead: true },
    { k: 'לעומת התקופה המקבילה', v: prevTot ? trend(deltaOf(tot, prevTot)) : '—',
      d: prevTot ? moneyC(prevTot) : 'אין שנה קודמת להשוואה' },
    { k: 'ספקים', v: num(nuniq(idx, M.s)), d: 'שעבדנו איתם בתקופה' },
    { k: 'מק״טים', v: num(nuniq(idx, M.i)), d: 'פריטים שונים' },
    { k: 'הזמנות', v: num(pos), d: `${num(idx.length)} שורות` },
    { k: 'ממוצע להזמנה', v: moneyC(pos ? tot / pos : 0), d: 'סך הרכש חלקי מספר ההזמנות' }
  ]);

  const bySup = topMap(sumBy(idx, M.s, M.a));
  const n80 = (() => { let c = 0, k = 0; for (const [, v] of bySup) { c += v; k++; if (c >= tot * 0.8) break; } return k; })();
  const top10 = bySup.slice(0, 10).reduce((a, b) => a + b[1], 0);
  if (bySup.length) {
    note(head, `${num(n80)} ספקים מתוך ${num(bySup.length)} (${(n80 / bySup.length * 100).toFixed(0)}%) מחזיקים 80% מהרכש. `
      + `עשרת הגדולים לבדם ${(top10 / tot * 100).toFixed(0)}% — ${moneyC(top10)}. שם נמצא הכסף, ושם גם כוח המיקוח.`);
  }

  /* ---------- שתי עוגות: על מה הכסף ---------- */
  const pies = EL('div', { class: 'grid2' });
  root.appendChild(pies);

  const sp = panel(pies, 'חלוקה לפי סוג ספק', 'לחיצה על פלח מצמצמת את כל המסך אליו');
  donut(sp, slices(sumBy(idx, M.styp, M.a), c => M.dims.styp[c]),
    { onClick: e => { if (e.data._k != null) ctx.filterBy('styp', e.data._k); } });

  const cp = panel(pies, 'חלוקה לפי סוג הזמנה', 'מחסן טכני, אחזקה, פרוייקטים, תפעול וכדומה');
  donut(cp, slices(sumBy(idx, M.pt, M.a), c => M.dims.potype[c]),
    { onClick: e => { if (e.data._k != null) ctx.filterBy('ptyp', e.data._k); } });

  /* ---------- הספקים והמק״טים הגדולים ---------- */
  const two = EL('div', { class: 'grid2' });
  root.appendChild(two);

  const spp = panel(two, 'עשרת הספקים הגדולים', 'לחיצה פותחת כרטיס ספק מלא');
  barRows(spp, bySup.slice(0, 10).map(([s, v]) => [SUPN(s), v, s]), { onClick: r => supplierCard(r[2]) });

  const byItem = topMap(sumBy(idx, M.i, M.a), 10);
  const ip = panel(two, 'עשרת המק״טים הגדולים', 'לחיצה פותחת כרטיס מק״ט מלא');
  barRows(ip, byItem.map(([it, v]) => [(IDESC(it) || ITEM(it)).slice(0, 42) + ' · ' + ITEM(it), v, it]),
    { onClick: r => itemCard(r[2]) });

  /* ---------- השוואת השנים, בתוך אותו דוח ---------- */
  const yp = panel(root, 'הרכש לפי שנים', 'השנה המודגשת היא הנבחרת. לחיצה על עמודה עוברת לשנה הזו. שנה חלקית מסומנת.');
  const yrs = M.years.map(y => {
    const sp2 = yearSpan(y);
    return { y, span: sp2, v: sum(scanWindow(sp2.from, sp2.to), M.a) };
  });
  lines(yp, yrs.map(r => String(r.y) + (r.span.partial ? ' (חלקי)' : '')), [{
    name: 'סך רכש', type: 'bar',
    data: yrs.map(r => ({ value: r.v, itemStyle: r.y === p.y ? undefined : { opacity: 0.55 } }))
  }], { height: '280px', onClick: e => { F.years.clear(); F.years.add(yrs[e.dataIndex].y); ctx.refresh(); } });

  const chips = EL('div', { class: 'bar' });
  yrs.forEach((r, n) => {
    const prv = n ? yrs[n - 1].v : null;
    chips.appendChild(EL('span', {
      class: 'chip', html: `<b>${r.y}</b> ${moneyC(r.v)}${prv ? ' · ' + trend(deltaOf(r.v, prv)) : ''}`
    }));
  });
  yp.appendChild(chips);
  if (yrs.some(r => r.span.partial)) {
    note(yp, 'השנה האחרונה חלקית — היא מסתיימת ביום האחרון שיש בקובץ, ולכן העמודה שלה נמוכה מטבעה. '
      + 'במסך "השוואת שנים" יש חיתוך הוגן שמשווה את אותה תקופה בשתי השנים.');
  }

  /* ---------- מגמה חודשית מול אשתקד ---------- */
  const trendP = panel(root, 'מגמה חודשית', p.prev ? 'הקו המקווקו הוא אותם חודשים בשנה הקודמת' : 'כל החודשים בתקופה הנבחרת');
  const cm = monthly(idx);
  const series = [{ name: String(p.y ?? 'הוצאה'), data: cm.v, area: true }];
  if (p.prev) {
    const pm = sumBy(p.prev, M.ym, M.a);
    series.push({ name: String(p.y - 1), dash: true, data: cm.keys.map(k => pm.get(k - 12) ?? null) });
  }
  lines(trendP, cm.x, series, { height: '300px' });

  /* ---------- פארטו: איפה עובר הקו של 80% ---------- */
  const pp = panel(root, 'עקומת פארטו של הספקים', 'כל עמודה היא ספק, מהגדול לקטן. הקו העולה הוא ההוצאה המצטברת באחוזים.');
  const top60 = bySup.slice(0, 60);
  let run = 0;
  const cum = top60.map(([, v]) => { run += v; return tot ? run / tot * 100 : 0; });
  pareto(pp, top60.map(([s]) => SUPN(s)), top60.map(([, v]) => v), cum, {
    height: '300px',
    marks: [{ yAxis: 80, lineStyle: { color: 'rgba(156,107,14,.7)' }, label: { formatter: '80%' } }],
    onClick: e => { const r = top60[e.dataIndex]; if (r) supplierCard(r[0]); }
  });

  /* ---------- ספקים חדשים ושנעלמו ---------- */
  if (p.prev) {
    const curSet = new Set(Array.from(idx, k => M.s[k]));
    const prvSet = new Set(Array.from(p.prev, k => M.s[k]));
    const added = [...curSet].filter(s => !prvSet.has(s));
    const gone = [...prvSet].filter(s => !curSet.has(s));
    const g2 = EL('div', { class: 'grid2' });
    root.appendChild(g2);

    const aSpend = sumBy(idx, M.s, M.a);
    const ap = panel(g2, `ספקים חדשים ב-${p.y}`, `${added.length} ספקים שלא הופיעו בתקופה המקבילה`);
    barRows(ap, added.map(s => [SUPN(s), aSpend.get(s) || 0, s]).sort((a, b) => b[1] - a[1]).slice(0, 8),
      { onClick: r => supplierCard(r[2]) });

    const gSpend = sumBy(p.prev, M.s, M.a);
    const gp = panel(g2, 'ספקים שהפסקנו', `${gone.length} ספקים שקנינו מהם אשתקד ולא השנה`);
    barRows(gp, gone.map(s => [SUPN(s), gSpend.get(s) || 0, s]).sort((a, b) => b[1] - a[1]).slice(0, 8),
      { onClick: r => supplierCard(r[2]) });
  }
}
