// מסך 2 — תיק המק״טים בראייה רוחבית.
//
// לא "מה קרה למק״ט הזה" אלא "איך בנוי התיק": כמה מעט פריטים מושכים את
// רוב התקציב, מה הפרופיל שלהם, ואיפה שווה להשקיע זמן ניהולי.
import { esc } from '../../core/base.js';
import {
  M, money, moneyC, num, price, dstr, sum, sumBy
} from './model.js';
import { EL, panel, tiles, table, barCell, trend, note, seg } from './ui.js';
import { donut, scatter } from './charts.js';
import { pair, pairNote } from './period.js';
import { itemCard } from './cards.js';
import { itemStats, concentration } from './engine.js';

const ABC_HE = { A: 'A — 80% מהתקציב', B: 'B — 15% הבאים', C: 'C — 5% האחרונים' };

export function viewPortfolio(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const rows = ctx.cache('items', () => itemStats(idx, p.prev));
  const conc = concentration(rows.map(r => r.spend));
  const view = ctx.state('pf', { abc: '', meas: false });

  const cls = c => rows.filter(r => r.abc === c);
  const A = cls('A'), B = cls('B'), C = cls('C');
  const spendOf = a => a.reduce((s, r) => s + r.spend, 0);

  const head = panel(root, 'תיק המק״טים', pairNote(p));
  tiles(head, [
    { k: 'מק״טים בתיק', v: num(rows.length), d: `${num(conc.n80)} מהם מחזיקים 80% מהתקציב`, lead: true },
    { k: 'רמה A', v: num(A.length), d: `${moneyC(spendOf(A))} · ${(spendOf(A) / tot * 100).toFixed(0)}% מהתקציב` },
    { k: 'רמה B', v: num(B.length), d: moneyC(spendOf(B)) },
    { k: 'רמה C', v: num(C.length), d: `${moneyC(spendOf(C))} · הרבה פריטים, מעט כסף` },
    { k: 'ריכוזיות', v: String(conc.hhi), d: `עשרת הגדולים ${conc.top10.toFixed(0)}% מהתקציב` },
    { k: 'ספק יחיד', v: num(rows.filter(r => r.sups === 1).length), d: `${moneyC(spendOf(rows.filter(r => r.sups === 1)))} בלי חלופה` }
  ]);
  note(head, 'סיווג ABC נעשה על התקופה הנבחרת: הפריטים מסודרים מהגדול לקטן, וכל עוד התקציב המצטבר מתחת ל-80% '
    + 'הפריט הוא A. זהו החתך שקובע איפה להשקיע זמן ניהולי — ברמה C יש אלפי פריטים ששווים יחד אחוזים בודדים.');

  /* ---------- שתי תמונות של התיק ---------- */
  const two = EL('div', { class: 'grid2' });
  root.appendChild(two);

  const d1 = panel(two, 'חלוקת התקציב לפי רמה', 'לחיצה על פלח מסננת את הטבלה לרמה הזו');
  donut(d1, [
    { name: ABC_HE.A, value: spendOf(A), _k: 'A' },
    { name: ABC_HE.B, value: spendOf(B), _k: 'B' },
    { name: ABC_HE.C, value: spendOf(C), _k: 'C' }
  ], { onClick: e => { view.abc = e.data._k; ctx.redraw(); } });

  const d2 = panel(two, 'כסף מול תנודתיות מחיר', 'כל נקודה היא מק״ט מדיד. ימינה = יותר כסף, למעלה = מחיר שזז יותר. '
    + 'הפינה הימנית-עליונה היא המקום שבו עיתוי ומנגנון מחיר שווים הכי הרבה.');
  const pts = rows.filter(r => r.vol != null && r.spend > 0)
    .map(r => ({ value: [r.spend, r.vol], name: (r.desc || r.item).slice(0, 30), _it: r.it }));
  if (pts.length >= 3) {
    scatter(d2, pts, {
      height: '320px', xName: 'הוצאה', yName: 'תנודתיות %', xMoney: true, yPct: true, logX: true,
      fmt: pt => `${pt.data.name}<br>הוצאה <b>${moneyC(pt.data.value[0])}</b><br>תנודתיות <b>${pt.data.value[1].toFixed(0)}%</b>`,
      onClick: e => { if (e.data?._it != null) itemCard(e.data._it); }
    });
  } else {
    note(d2, 'אין מספיק מק״טים עם היסטוריית מחיר חודשית בתקופה הנבחרת כדי לצייר את הפיזור. בחר תקופה ארוכה יותר.');
  }

  /* ---------- הטבלה ---------- */
  const ctrl = EL('div', { class: 'inline-form' });
  const q = EL('input', { class: 'inp', type: 'search', placeholder: 'חיפוש מק״ט או תאור…', style: 'width:min(280px,100%);text-align:start' });
  ctrl.append(
    seg([['', 'כל הרמות'], ['A', 'A'], ['B', 'B'], ['C', 'C']], view.abc, v => { view.abc = v; ctx.redraw(); }),
    seg([[false, 'הכל'], [true, 'רק מדידים']], view.meas, v => { view.meas = v; ctx.redraw(); }),
    q
  );
  const body = panel(root, 'כל המק״טים', 'מיון בלחיצה על כותרת · שורה פותחת כרטיס · ⤓ מייצא לאקסל', ctrl);
  const host = EL('div');
  body.appendChild(host);
  const max = rows[0]?.spend || 1;

  const cols = [
    { k: 'abc', t: 'רמה', f: v => `<span class="pill ${v === 'A' ? 'go' : v === 'B' ? 'medium' : 'low'}">${v}</span>` },
    { k: 'item', t: 'מק״ט' },
    { k: 'desc', t: 'תאור', w: true },
    { k: 'spend', t: 'הוצאה', n: true, f: v => barCell(v, max, moneyC) },
    { k: 'share', t: '% מהתקציב', n: true, f: (v, r) => `${v.toFixed(2)}%<span class="sub">מצטבר ${r.cum.toFixed(0)}%</span>` },
    { k: 'dspend', t: 'מול אשתקד', n: true, f: v => trend(v) },
    { k: 'qty', t: 'כמות', n: true, f: (v, r) => r.meas && v != null ? num(v, v < 10 ? 2 : 0) + `<span class="sub">${esc(r.unit)}</span>` : '—' },
    { k: 'wap', t: 'מחיר ממוצע', n: true, f: (v, r) => (v == null || !r.meas) ? '—' : price(v) },
    { k: 'vol', t: 'תנודתיות', n: true, f: v => v == null ? '—' : `<span class="${v >= 10 ? 'up' : 'flat'}">${v.toFixed(0)}%</span>` },
    { k: 'drift', t: 'מגמה בתקופה', n: true, f: v => v == null ? '—' : trend(v) },
    { k: 'sups', t: 'ספקים', n: true, f: v => v === 1 ? '<span class="up">1</span>' : String(v) },
    { k: 'last', t: 'קנייה אחרונה', n: true, f: v => dstr(v), sortV: r => r.last }
  ];
  const paint = () => {
    const s = q.value.trim().toLowerCase();
    host.innerHTML = '';
    let list = rows;
    if (view.abc) list = list.filter(r => r.abc === view.abc);
    if (view.meas) list = list.filter(r => r.meas);
    if (s) list = list.filter(r => r.item.toLowerCase().includes(s) || (r.desc || '').toLowerCase().includes(s));
    table(host, cols, list, { size: 25, name: 'תיק המק״טים', sort: 3, onRow: r => itemCard(r.it) });
  };
  let t = null;
  q.oninput = () => { clearTimeout(t); t = setTimeout(paint, 180); };
  paint();
}
