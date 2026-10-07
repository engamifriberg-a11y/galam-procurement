// טעינת הנתונים המשותפת ללשונית התנודתיות, פעם אחת לכל תתי-הלשוניות.
import { get } from '../../core/app.js';

export async function loadMarket(fresh = false) {
  const r = await get('/api/market', { fresh });
  return r.ok ? r.body : { series: [], error: r.body?.error || `HTTP ${r.status}`, db: false };
}

export async function loadChemicals() {
  const r = await get('/assets/data/chemicals.json');
  return r.ok ? r.body : { items: [], modes: {} };
}

export async function loadPrices() {
  const r = await get('/api/prices');
  return r.ok ? r.body : {};
}

export function indexSeries(market) {
  const m = new Map();
  for (const s of market.series || []) m.set(s.id, s);
  return m;
}

/* חישוב השינוי הצפוי בעלות של פריט, לפי משקלי מנועי העלות שלו.
   מחזיר גם את הפירוק, כי קניין חייב לראות ממה ההמלצה מורכבת. */
export function expectedChange(item, byId, window = 'd90') {
  const parts = [];
  let total = 0, covered = 0;
  for (const [sid, w] of item.drivers) {
    const s = byId.get(sid);
    const chg = s?.chg?.[window];
    if (chg == null || !Number.isFinite(chg)) {
      parts.push({ sid, he: s?.he || sid, w, chg: null, tier: s?.tier });
      continue;
    }
    parts.push({ sid, he: s.he, w, chg, tier: s.tier });
    total += w * chg;
    covered += w;
  }
  return {
    parts,
    covered,
    // נרמול לפי המשקל שבאמת כוסה, אחרת סדרה חסרה אחת מטה את התוצאה כלפי מטה
    pct: covered > 0 ? total / covered : null
  };
}

/* מנוע ההמלצה. דטרמיניסטי ומוסבר — הקניין חייב להבין למה.
   paid = המחיר האחרון ששולם בפועל, אם הוזן. */
export function recommend(item, exp, paid) {
  const lev = leverage(item);
  if (exp.pct == null || exp.covered < 0.4) {
    return { code: 'nodata', he: 'חסרים נתוני שוק', cls: 'hold', why: 'לא מוזנים מספיק מדדי שוק למנועי העלות של הפריט.', lev, gap: null };
  }
  const market = exp.pct;
  const paidChg = (paid && Number.isFinite(paid.price) && Number.isFinite(paid.prev) && paid.prev > 0)
    ? (paid.price - paid.prev) / paid.prev * 100 : null;

  if (paidChg == null) {
    // בלי מחיר אחרון אפשר עדיין להמליץ על סמך כיוון השוק בלבד, בזהירות
    if (market <= -5) return { code: 'ask', he: 'פנה להוזלה', cls: 'go', why: `מנועי העלות ירדו ${Math.abs(market).toFixed(1)}% ב-90 יום. אין מחיר אחרון במערכת, אבל כיוון השוק מצדיק פנייה.`, lev, gap: null, partial: true };
    if (market >= 5) return { code: 'lock', he: 'נעל מחיר', cls: 'lock', why: `מנועי העלות עלו ${market.toFixed(1)}% ב-90 יום. עדיף לקבע מחיר מאשר לפתוח משא ומתן.`, lev, gap: null, partial: true };
    return { code: 'hold', he: 'אל תפנה כעת', cls: 'hold', why: `השוק יציב (${pcs(market)}). אין עילה לפנייה.`, lev, gap: null, partial: true };
  }

  const gap = paidChg - market; // חיובי = גלעם משלמת יותר ממה שהשוק מצדיק
  if (gap >= 3) return { code: 'ask', he: 'פנה להוזלה', cls: 'go', gap, lev,
    why: `המחיר ששולם עלה ${pcs(paidChg)} בעוד מנועי העלות זזו ${pcs(market)} — פער של ${gap.toFixed(1)} נקודות לרעת גלעם.` };
  if (gap <= -3 && market > 2) return { code: 'lock', he: 'נעל מחיר', cls: 'lock', gap, lev,
    why: `גלעם משלמת פחות ממה שהשוק מצדיק (פער ${gap.toFixed(1)} נקודות) והעלויות במגמת עלייה. לקבע לפני העדכון הבא.` };
  if (gap <= -3) return { code: 'quiet', he: 'אל תפנה — לטובתך', cls: 'hold', gap, lev,
    why: `המחיר הנוכחי נמוך ביחס לשוק (פער ${gap.toFixed(1)} נקודות). פתיחת משא ומתן עלולה להזמין עדכון כלפי מעלה.` };
  return { code: 'hold', he: 'אל תפנה כעת', cls: 'hold', gap, lev,
    why: `המחיר ששולם (${pcs(paidChg)}) תואם את תזוזת מנועי העלות (${pcs(market)}). הפער ${gap.toFixed(1)} נקודות, בתוך הרעש.` };
}

const pcs = v => (v > 0 ? '+' : '') + v.toFixed(1) + '%';

/* עוצמת המיקוח: טונאז' שנתי וקיום ספקים חלופיים */
export function leverage(item) {
  const t = Math.min(1, Math.log10(Math.max(item.tons, 1) + 1) / 4);
  const alt = item.sup >= 3 ? 1 : item.sup === 2 ? 0.6 : 0.2;
  return Math.round((t * 0.6 + alt * 0.4) * 100);
}

/* רכיב ההובלה בתוך עלות הפריט — הפרמטר שהקניין הישראלי הכי נוטה לשכוח */
export function freightPart(item, byId, window = 'd90') {
  const fr = item.drivers.find(([sid]) => sid.startsWith('fr.'));
  if (!fr) return null;
  const s = byId.get(fr[0]);
  return { sid: fr[0], he: s?.he || fr[0], w: fr[1], chg: s?.chg?.[window] ?? null, last: s?.last ?? null, unit: s?.unit || '', tier: s?.tier };
}
