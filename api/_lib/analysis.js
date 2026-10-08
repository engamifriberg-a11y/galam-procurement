// מנוע ההמלצות. היה בדפדפן והועבר לשרת, כדי שה-AI ינמק בדיוק את מה שהמסך מציג
// ולא גרסה משלו. זהו מקור האמת היחיד להמלצה.
import { readFile } from 'node:fs/promises';
import { buildSeries } from './market.js';
import { hasDb, kvGet } from './db.js';

let CHEM = null;
export async function chemData() {
  CHEM ||= JSON.parse(await readFile(new URL('../../assets/data/chemicals.json', import.meta.url), 'utf8'));
  return CHEM;
}

const pcs = v => (v > 0 ? '+' : '') + v.toFixed(1) + '%';

/* השינוי הצפוי בעלות הפריט, משוקלל לפי מנועי העלות שלו */
export function expectedChange(item, byId, window = 'd90') {
  const parts = [];
  let total = 0, covered = 0;
  for (const [sid, w] of item.drivers) {
    const s = byId.get(sid);
    const chg = s?.chg?.[window];
    if (chg == null || !Number.isFinite(chg)) { parts.push({ sid, he: s?.he || sid, w, chg: null, tier: s?.tier }); continue; }
    parts.push({ sid, he: s.he, w, chg, tier: s.tier });
    total += w * chg;
    covered += w;
  }
  return { parts, covered, pct: covered > 0 ? total / covered : null };
}

/* עוצמת המיקוח: טונאז' שנתי וקיום ספקים חלופיים */
export function leverage(item) {
  const t = Math.min(1, Math.log10(Math.max(item.tons, 1) + 1) / 4);
  const alt = item.sup >= 3 ? 1 : item.sup === 2 ? 0.6 : 0.2;
  return Math.round((t * 0.6 + alt * 0.4) * 100);
}

export function freightPart(item, byId, window = 'd90') {
  const fr = item.drivers.find(([sid]) => sid.startsWith('fr.'));
  if (!fr) return null;
  const s = byId.get(fr[0]);
  return { sid: fr[0], he: s?.he || fr[0], w: fr[1], chg: s?.chg?.[window] ?? null, last: s?.last ?? null, unit: s?.unit || '', tier: s?.tier };
}

/* ההמלצה עצמה. דטרמיניסטית ומוסברת — קניין חייב להבין למה. */
export function recommend(item, exp, paid) {
  const lev = leverage(item);
  if (exp.pct == null || exp.covered < 0.4) {
    return { code: 'nodata', he: 'חסרים נתוני שוק', cls: 'hold', lev, gap: null,
      why: 'לא מוזנים מספיק מדדי שוק למנועי העלות של הפריט.' };
  }
  const market = exp.pct;
  const paidChg = (paid && Number.isFinite(paid.price) && Number.isFinite(paid.prev) && paid.prev > 0)
    ? (paid.price - paid.prev) / paid.prev * 100 : null;

  if (paidChg == null) {
    if (market <= -5) return { code: 'ask', he: 'פנה להוזלה', cls: 'go', lev, gap: null, partial: true, market,
      why: `מנועי העלות ירדו ${Math.abs(market).toFixed(1)}% ב-90 יום. אין מחיר אחרון במערכת, אבל כיוון השוק מצדיק פנייה.` };
    if (market >= 5) return { code: 'lock', he: 'נעל מחיר', cls: 'lock', lev, gap: null, partial: true, market,
      why: `מנועי העלות עלו ${market.toFixed(1)}% ב-90 יום. עדיף לקבע מחיר מאשר לפתוח משא ומתן.` };
    return { code: 'hold', he: 'אל תפנה כעת', cls: 'hold', lev, gap: null, partial: true, market,
      why: `השוק יציב (${pcs(market)}). אין עילה לפנייה.` };
  }

  const gap = paidChg - market;
  if (gap >= 3) return { code: 'ask', he: 'פנה להוזלה', cls: 'go', gap, lev, market, paidChg,
    why: `המחיר ששולם עלה ${pcs(paidChg)} בעוד מנועי העלות זזו ${pcs(market)} — פער של ${gap.toFixed(1)} נקודות לרעת גלעם.` };
  if (gap <= -3 && market > 2) return { code: 'lock', he: 'נעל מחיר', cls: 'lock', gap, lev, market, paidChg,
    why: `גלעם משלמת פחות ממה שהשוק מצדיק (פער ${gap.toFixed(1)} נקודות) והעלויות במגמת עלייה. לקבע לפני העדכון הבא.` };
  if (gap <= -3) return { code: 'quiet', he: 'אל תפנה — לטובתך', cls: 'hold', gap, lev, market, paidChg,
    why: `המחיר הנוכחי נמוך ביחס לשוק (פער ${gap.toFixed(1)} נקודות). פתיחת משא ומתן עלולה להזמין עדכון כלפי מעלה.` };
  return { code: 'hold', he: 'אל תפנה כעת', cls: 'hold', gap, lev, market, paidChg,
    why: `המחיר ששולם (${pcs(paidChg)}) תואם את תזוזת מנועי העלות (${pcs(market)}). הפער ${gap.toFixed(1)} נקודות, בתוך הרעש.` };
}

/* כמויות שהוזנו ידנית דורסות את הקובץ. מחזיר עותקים — אסור לשנות את
   ה-JSON ששמור במטמון המודול. הכמות נכנסת לעוצמת המיקוח, ולכן גם
   להמלצה ולנימוק שה-AI מנסח, ולא רק לתצוגה. */
export function applyTons(items, overrides) {
  if (!overrides || !Object.keys(overrides).length) return items;
  return items.map(it => {
    const raw = overrides[it.item || String(it.n)];
    // null, undefined או מחרוזת ריקה = אין הזנה. Number(null) הוא 0, ולכן
    // בלי הבדיקה הזו ביטול הזנה היה הופך את הכמות לאפס.
    if (raw === null || raw === undefined || raw === '') return it;
    const v = Number(raw);
    return Number.isFinite(v) ? { ...it, tons: v, tonsManual: true } : it;
  });
}

/* התמונה המלאה: סדרות, כימיקלים והמלצות — בבת אחת */
export async function analyse(window = 'd90') {
  const [series, chem] = await Promise.all([buildSeries(), chemData()]);
  const byId = new Map(series.map(s => [s.id, s]));
  let prices = {}, tonsOverrides = {};
  if (hasDb()) {
    try { prices = await kvGet('prices:paid') || {}; } catch { prices = {}; }
    try { tonsOverrides = await kvGet('chem:tons') || {}; } catch { tonsOverrides = {}; }
  }
  const items = applyTons(chem.items, tonsOverrides);

  const rows = items.map(item => {
    const exp = expectedChange(item, byId, window);
    const paid = prices[item.item || String(item.n)] || null;
    const rec = recommend(item, exp, paid);
    return { item, exp, paid, rec, fr: freightPart(item, byId, window) };
  });

  return { window, series, rows, modes: chem.modes, at: new Date().toISOString() };
}
