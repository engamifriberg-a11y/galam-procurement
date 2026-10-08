// מסך 1 — מבט-על. דשבורד ניהולי בראייה רוחבית.
//
// השאלה: איפה התקציב יושב, ומה זז. לא פריט בודד ולא ספק בודד — תיק הרכש
// כולו בעמוד אחד. מי שרוצה לרדת לפרט לוחץ, והכרטיס נפתח מעליו.
import { esc } from '../../core/base.js';
import {
  M, F, money, moneyC, num, pct, sum, nuniq, sumBy, topMap, monthly,
  scanWindow, SUPN, ITEM, IDESC
} from './model.js';
import { EL, panel, tiles, barRows, trend, deltaOf, note } from './ui.js';
import { lines, donut, pareto } from './charts.js';
import { pair, pairNote, yearSpan } from './period.js';
import { supplierCard, itemCard } from './cards.js';
import { slices } from './viz.js';
import { itemStats, supplierStats, typeStats, concentration, hhiLabel, headlines, vagueShare } from './engine.js';

export function viewMacro(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const prevTot = p.prev ? sum(p.prev, M.a) : null;
  const items = ctx.cache('items', () => itemStats(idx, p.prev));
  const sups = ctx.cache('sups', () => supplierStats(idx, p.prev));
  const cats = ctx.cache('cats', () => typeStats(idx, p.prev, 'ptyp'));
  const styps = ctx.cache('styps', () => typeStats(idx, p.prev, 'styp'));
  const sconc = concentration(sups.map(r => r.spend));
  const iconc = concentration(items.map(r => r.spend));

  /* ---------- KPI ---------- */
  const head = panel(root, 'תמונת מצב', pairNote(p));
  tiles(head, [
    { k: 'סך רכש', v: moneyC(tot), d: money(tot), lead: true },
    { k: 'מול התקופה המקבילה', v: prevTot ? trend(deltaOf(tot, prevTot)) : '—', d: prevTot ? moneyC(prevTot) : 'אין שנה קודמת' },
    { k: 'ספקים', v: num(sups.length), d: `${num(sconc.n80)} מהם = 80% מההוצאה` },
    { k: 'מק״טים', v: num(items.length), d: `${num(iconc.n80)} מהם = 80% מהתקציב` },
    { k: 'הזמנות', v: num(nuniq(idx, M.p)), d: `${num(idx.length)} שורות` },
    { k: 'ממוצע להזמנה', v: moneyC(nuniq(idx, M.p) ? tot / nuniq(idx, M.p) : 0), d: 'סך הרכש חלקי מספר ההזמנות' }
  ]);

  /* ---------- תובנות הכותרת ---------- */
  const hl = panel(root, 'מה חשוב לדעת', 'חמש שורות שמחושבות מהנתונים בכל רענון');
  hl.appendChild(EL('ul', { class: 'insights' },
    headlines(items, sups, cats, tot, sconc).map(h => `<li>${esc(h)}</li>`).join('')));

  /* ---------- איפה התקציב: שתי עוגות ---------- */
  const pies = EL('div', { class: 'grid2' });
  root.appendChild(pies);

  const c1 = panel(pies, 'לפי סוג הזמנת רכש', 'הפילוח שמפריד בין פעילויות. לחיצה על פלח מצמצמת אליו את כל המסכים');
  donut(c1, slices(sumBy(idx, M.pt, M.a), k => M.dims.potype[k], 8),
    { onClick: e => { if (e.data._k != null) ctx.filterBy('ptyp', e.data._k); } });

  const c2 = panel(pies, 'לפי סוג ספק', 'הסיווג שמגיע מכרטיס הספק');
  donut(c2, slices(sumBy(idx, M.styp, M.a), k => M.dims.styp[k], 8),
    { onClick: e => { if (e.data._k != null) ctx.filterBy('styp', e.data._k); } });
  const vague = vagueShare(styps);
  if (vague >= 20) {
    note(c2, `${vague.toFixed(0)}% מההוצאה מסווגים כ"אחרים" או בלי סיווג, ולכן העוגה הזו אינה מספיקה להחלטה. `
      + 'הפילוח לפי סוג הזמנת רכש מפריד נקי יותר — הוא ברירת המחדל במסכים.', 'warn');
  }

  /* ---------- מי מחזיק את הכסף ---------- */
  const two = EL('div', { class: 'grid2' });
  root.appendChild(two);

  const sp = panel(two, 'עשרת הספקים הגדולים', `מדד ריכוזיות ${sconc.hhi} — ${hhiLabel(sconc.hhi)} · עשרת הגדולים ${sconc.top10.toFixed(0)}%`);
  barRows(sp, sups.slice(0, 10).map(r => [r.sup, r.spend, r.s]), { onClick: r => supplierCard(r[2]) });

  const ip = panel(two, 'עשרת המק״טים הגדולים', `עשרת הגדולים ${iconc.top10.toFixed(0)}% מהתקציב`);
  barRows(ip, items.slice(0, 10).map(r => [(r.desc || r.item).slice(0, 40) + ' · ' + r.item, r.spend, r.it]),
    { onClick: r => itemCard(r[2]) });

  /* ---------- פארטו של התקציב ---------- */
  const pp = panel(root, 'עקומת פארטו של המק״טים', 'כל עמודה היא מק״ט, מהגדול לקטן. הקו העולה הוא התקציב המצטבר, והקו האופקי הוא 80%.');
  const top60 = items.slice(0, 60);
  pareto(pp, top60.map(r => (r.desc || r.item).slice(0, 26)), top60.map(r => r.spend), top60.map(r => r.cum), {
    height: '300px',
    marks: [{ yAxis: 80, lineStyle: { color: 'rgba(156,107,14,.75)' }, label: { formatter: '80%' } }],
    onClick: e => { const r = top60[e.dataIndex]; if (r) itemCard(r.it); }
  });

  /* ---------- מגמה: שנים וחודשים ---------- */
  const yp = panel(root, 'הרכש לפי שנים', 'לחיצה על עמודה עוברת לשנה. שנה חלקית מסומנת, כי היא נמוכה מטבעה.');
  const yrs = M.years.map(y => {
    const sp2 = yearSpan(y);
    return { y, partial: sp2.partial, v: sum(scanWindow(sp2.from, sp2.to), M.a) };
  });
  lines(yp, yrs.map(r => String(r.y) + (r.partial ? ' (חלקי)' : '')), [{
    name: 'סך רכש', type: 'bar',
    data: yrs.map(r => ({ value: r.v, itemStyle: r.y === p.y ? undefined : { opacity: 0.55 } }))
  }], { height: '260px', onClick: e => { F.years.clear(); F.years.add(yrs[e.dataIndex].y); ctx.refresh(); } });
  const chips = EL('div', { class: 'bar' });
  yrs.forEach((r, n) => chips.appendChild(EL('span', {
    class: 'chip', html: `<b>${r.y}</b> ${moneyC(r.v)}${n ? ' · ' + trend(deltaOf(r.v, yrs[n - 1].v)) : ''}`
  })));
  yp.appendChild(chips);

  const tp = panel(root, 'מגמה חודשית', p.prev ? 'הקו המקווקו הוא אותם חודשים בשנה הקודמת' : 'החודשים בתקופה הנבחרת');
  const cm = monthly(idx);
  const series = [{ name: String(p.y ?? 'הוצאה'), data: cm.v, area: true }];
  if (p.prev) {
    const pm = sumBy(p.prev, M.ym, M.a);
    series.push({ name: String(p.y - 1), dash: true, data: cm.keys.map(k => pm.get(k - 12) ?? null) });
  }
  lines(tp, cm.x, series, { height: '280px' });

  /* ---------- מה גדל ומה קטן ---------- */
  if (p.prev) {
    const g = EL('div', { class: 'grid2' });
    root.appendChild(g);
    const movers = (host, title, sub, rows, open) => {
      const pn = panel(host, title, sub);
      barRows(pn, rows.map(r => [r.name, r.diff, r.k]), { onClick: r => open(r[2]) });
    };
    const diffs = cats.map(c => ({ k: c.k, name: c.name, diff: c.spend - (c.was || 0) }));
    movers(g, 'פעילויות שגדלו', 'ההפרש בשקלים מול התקופה המקבילה',
      diffs.filter(d => d.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 8), k => ctx.filterBy('ptyp', k));
    movers(g, 'פעילויות שקטנו', 'כאן כבר נחסך כסף, או שהפעילות הופסקה',
      diffs.filter(d => d.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 8), k => ctx.filterBy('ptyp', k));
  }
}
