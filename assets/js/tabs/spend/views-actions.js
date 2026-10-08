// מסך 4 — הזדמנויות והמלצות.
//
// כאן הדשבורד הופך לרשימת עבודה. כל המלצה נשענת על מספרים שחושבו
// מהקובץ, אומרת מה לעשות, ומפרידה בפירוש בין מה שנמדד לבין מה שנשען
// על הנחה. מנהל רכש שמביא מספר לפגישה צריך לדעת מאיפה הוא בא.
import { esc } from '../../core/base.js';
import { M, money, moneyC, num, sum } from './model.js';
import { EL, panel, tiles, seg, note, table } from './ui.js';
import { donut } from './charts.js';
import { pair, pairNote } from './period.js';
import { itemCard, supplierCard } from './cards.js';
import { itemStats, supplierStats, typeStats, recommendations, concentration } from './engine.js';
import { viewAdvisor } from './views-system.js';

const KINDS = {
  gap: { he: 'פער מחיר', cls: 'high' },
  tender: { he: 'מכרז', cls: 'go' },
  negotiate: { he: 'מו״מ', cls: 'go' },
  consolidate: { he: 'איחוד ספקים', cls: 'medium' },
  risk: { he: 'סיכון תלות', cls: 'high' },
  volatile: { he: 'תנודתיות', cls: 'medium' },
  quality: { he: 'איכות נתונים', cls: 'low' }
};

export function viewActions(root, idx, ctx) {
  const p = pair();
  const tot = sum(idx, M.a);
  const items = ctx.cache('items', () => itemStats(idx, p.prev));
  const sups = ctx.cache('sups', () => supplierStats(idx, p.prev));
  const cats = ctx.cache('cats:ptyp', () => typeStats(idx, p.prev, 'ptyp'));
  const styps = ctx.cache('styps', () => typeStats(idx, p.prev, 'styp'));
  const recs = ctx.cache('recs', () => recommendations(items, sups, cats, tot, styps));
  const view = ctx.state('act', { kind: '' });

  const measured = recs.filter(r => r.valueKind === 'מחושב').reduce((a, b) => a + (b.value || 0), 0);
  const leverage = recs.filter(r => r.valueKind === 'כל 1% הנחה').reduce((a, b) => a + (b.value || 0), 0);
  const byKind = Object.keys(KINDS).map(k => ({ k, n: recs.filter(r => r.kind === k).length }))
    .filter(x => x.n);

  const head = panel(root, 'הזדמנויות והמלצות', pairNote(p));
  tiles(head, [
    { k: 'פערי מחיר מחושבים', v: moneyC(measured), d: 'פער בין רכישות של אותו חודש — נמדד מהקובץ', lead: true },
    { k: 'כל 1% הנחה שווה', v: moneyC(leverage), d: 'על הספקים והמק״טים שברשימה' },
    { k: 'המלצות', v: num(recs.length), d: byKind.map(x => `${KINDS[x.k].he} ${x.n}`).join(' · ') },
    { k: 'סך הרכש בתקופה', v: moneyC(tot), d: money(tot) }
  ]);
  note(head, 'שני סוגי מספרים כאן, והם לא מתערבבים. <b>מחושב</b> הוא פער שנמדד בין רכישות של אותו חודש — '
    + 'הסכום קיים בקובץ. <b>כל 1% הנחה</b> הוא אריתמטיקה על ההוצאה שמראה כמה שווה כל אחוז, ולא תחזית. '
    + 'מה שנשען על הנחה כתוב בשורת ההסתייגות של ההמלצה עצמה.');

  /* ---------- פילוח ההמלצות ---------- */
  const two = EL('div', { class: 'grid2' });
  root.appendChild(two);
  const d1 = panel(two, 'ההמלצות לפי סוג', 'לחיצה על פלח מסננת את הרשימה');
  donut(d1, byKind.map(x => ({ name: KINDS[x.k].he, value: x.n, _k: x.k })), {
    height: '260px',
    onClick: e => { view.kind = e.data._k; ctx.redraw(); }
  });

  const d2 = panel(two, 'איפה הכסף שאפשר לשאול עליו', 'עשר ההזדמנויות הגדולות לפי סכום, מחושב בלבד');
  const topGap = recs.filter(r => r.valueKind === 'מחושב').slice(0, 10)
    .sort((a, b) => b.value - a.value);
  if (topGap.length) {
    table(d2, [
      { k: 'title', t: 'הזדמנות', w: true },
      { k: 'value', t: 'סכום', n: true, f: v => `<b>${moneyC(v)}</b>` }
    ], topGap, { all: true, name: 'פערי מחיר', sort: 1 });
  } else {
    note(d2, 'לא נמצאו פערי מחיר בין רכישות של אותו חודש בתקופה הנבחרת.');
  }

  /* ---------- רשימת ההמלצות ---------- */
  const filt = seg([['', `הכל (${recs.length})`], ...byKind.map(x => [x.k, `${KINDS[x.k].he} (${x.n})`])],
    view.kind, v => { view.kind = v; ctx.redraw(); });
  const list = panel(root, 'רשימת העבודה', 'מסודרת לפי דחיפות: כמה כסף, כמה ודאי, וכמה קל להתחיל', filt);
  const shown = view.kind ? recs.filter(r => r.kind === view.kind) : recs;

  const wrap = EL('div', { class: 'recs' });
  shown.forEach(r => {
    const k = KINDS[r.kind] || { he: r.kind, cls: 'low' };
    const card = EL('div', { class: 'rec' });
    card.innerHTML = `
      <div class="rh">
        <span class="pill ${k.cls}">${esc(k.he)}</span>
        <b>${esc(r.title)}</b>
        <span class="rv">${r.value == null ? `<i>${esc(r.valueKind)}</i>` : `${moneyC(r.value)}<i>${esc(r.valueKind)}</i>`}</span>
      </div>
      <p class="ra">${esc(r.action)}</p>
      <ul>${r.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      ${r.caveat ? `<p class="rc">${esc(r.caveat)}</p>` : ''}`;
    wrap.appendChild(card);
  });
  list.appendChild(wrap);
  if (!shown.length) note(list, 'אין המלצות מהסוג הזה בתקופה הנבחרת.');

  /* ---------- שאלה חופשית ---------- */
  const ai = panel(root, 'שאלה ליועץ', 'שאלה בעברית על הנתונים שבסינון הנוכחי. התשובה מחושבת מההזמנות, לא ממידע כללי.');
  viewAdvisor(ai, idx, ctx);
}
