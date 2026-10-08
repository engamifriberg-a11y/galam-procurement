// מסך 1 — איפה הכסף.
//
// המסך שנפתח ראשון, ושאמור לענות בתוך עשר שניות על שלוש שאלות: כמה קנינו
// בשנה שנבחרה, אצל מי, ועל מה. כל עמודה כאן לחיצה ופותחת את הכרטיס המלא.
import { esc } from '../../core/base.js';
import {
  M, money, moneyC, num, pct, dstr, sum, nuniq, sumBy, topMap, monthly,
  SUPN, ITEM, IDESC, idxWhere
} from './model.js';
import { EL, panel, tiles, grp, barRows, trend, deltaOf, note } from './ui.js';
import { lines } from './charts.js';
import { pair, pairNote, yearSpan } from './period.js';
import { supplierCard, itemCard } from './cards.js';

export function viewMoney(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const prevTot = p.prev ? sum(p.prev, M.a) : null;
  const pos = nuniq(idx, M.p);

  /* ----- המספרים הגדולים ----- */
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

  /* ----- ריכוזיות: כמה ספקים מחזיקים 80% מהכסף ----- */
  const bySup = topMap(sumBy(idx, M.s, M.a));
  const n80 = (() => { let c = 0, k = 0; for (const [, v] of bySup) { c += v; k++; if (c >= tot * 0.8) break; } return k; })();
  const top10 = bySup.slice(0, 10).reduce((a, b) => a + b[1], 0);
  if (bySup.length) {
    note(head, `${num(n80)} ספקים מתוך ${num(bySup.length)} (${(n80 / bySup.length * 100).toFixed(0)}%) מחזיקים 80% מהרכש. `
      + `עשרת הגדולים לבדם ${(top10 / tot * 100).toFixed(0)}% — ${moneyC(top10)}. שם נמצא הכסף, ושם גם כוח המיקוח.`);
  }

  /* ----- הספקים והמק״טים הגדולים, זה לצד זה ----- */
  const two = EL('div', { class: 'grid2' });
  root.appendChild(two);

  const sp = panel(two, 'עשרת הספקים הגדולים', 'לחיצה פותחת כרטיס ספק מלא');
  barRows(sp, bySup.slice(0, 10).map(([s, v]) => [SUPN(s), v, s]),
    { onClick: r => supplierCard(r[2]) });

  const byItem = topMap(sumBy(idx, M.i, M.a), 10);
  const ip = panel(two, 'עשרת המק״טים הגדולים', 'לחיצה פותחת כרטיס מק״ט מלא');
  barRows(ip, byItem.map(([it, v]) => [(IDESC(it) || ITEM(it)).slice(0, 42) + ' · ' + ITEM(it), v, it]),
    { onClick: r => itemCard(r[2]) });

  /* ----- על מה הכסף: סוג ספק וסוג הזמנה ----- */
  const two2 = EL('div', { class: 'grid2' });
  root.appendChild(two2);

  const tp = panel(two2, 'לפי סוג ספק', 'הסיווג מגיע מכרטיס הספק בקובץ');
  barRows(tp, topMap(sumBy(idx, M.styp, M.a), 12).map(([c, v]) => [M.dims.styp[c] || 'ללא סיווג', v, c]),
    { onClick: r => { ctx.filterBy('styp', r[2]); } });

  const cp = panel(two2, 'לפי סוג הזמנה', 'מחסן טכני, אחזקה, פרוייקטים וכדומה');
  barRows(cp, topMap(sumBy(idx, M.pt, M.a), 12).map(([c, v]) => [M.dims.potype[c] || '(ללא סוג)', v, c]),
    { onClick: r => { ctx.filterBy('ptyp', r[2]); } });

  /* ----- מגמה חודשית מול אשתקד ----- */
  const trendP = panel(root, 'מגמה חודשית', p.prev ? 'הקו המקווקו הוא אותם חודשים בשנה הקודמת' : 'כל החודשים בתקופה הנבחרת');
  const cm = monthly(idx);
  const series = [{ name: String(p.y ?? 'הוצאה'), data: cm.v, area: true }];
  if (p.prev) {
    const pm = sumBy(p.prev, M.ym, M.a);
    series.push({
      name: String(p.y - 1), dash: true, area: false,
      data: cm.keys.map(k => pm.get(k - 12) ?? null)
    });
  }
  lines(trendP, cm.x, series, { height: '300px' });

  /* ----- ספקים חדשים ושנעלמו ----- */
  if (p.prev) {
    const curSet = new Set(Array.from(idx, k => M.s[k]));
    const prvSet = new Set(Array.from(p.prev, k => M.s[k]));
    const added = [...curSet].filter(s => !prvSet.has(s));
    const gone = [...prvSet].filter(s => !curSet.has(s));
    const g2 = EL('div', { class: 'grid2' });
    root.appendChild(g2);

    const ap = panel(g2, `ספקים חדשים ב-${p.y}`, `${added.length} ספקים שלא הופיעו בתקופה המקבילה`);
    const aSpend = sumBy(idx, M.s, M.a);
    barRows(ap, added.map(s => [SUPN(s), aSpend.get(s) || 0, s]).sort((a, b) => b[1] - a[1]).slice(0, 8),
      { onClick: r => supplierCard(r[2]) });

    const gp = panel(g2, 'ספקים שהפסקנו', `${gone.length} ספקים שקנינו מהם אשתקד ולא השנה`);
    const gSpend = sumBy(p.prev, M.s, M.a);
    barRows(gp, gone.map(s => [SUPN(s), gSpend.get(s) || 0, s]).sort((a, b) => b[1] - a[1]).slice(0, 8),
      { onClick: r => supplierCard(r[2]) });
  }
}
