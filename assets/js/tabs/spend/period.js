// השוואת תקופות הוגנת.
//
// הקובץ של גלעם מסתיים באמצע השנה הנוכחית. השוואה של שנה חלקית מול שנה
// מלאה מראה "ירידה" של עשרות אחוזים שלא קרתה מעולם, ועל מספר כזה אי אפשר
// לנהל משא ומתן. לכן כששנת ההשוואה חלקית, גם שנת הבסיס נחתכת באותו יום.
import { M, F, IDX, scanWindow, dayOf, shiftYear, dstr, MONS } from './model.js';

export const lastYear = () => M.years[M.years.length - 1];

/* הטווח בפועל של שנה: מ-1 בינואר ועד סוף השנה או עד היום האחרון בנתונים */
export function yearSpan(y) {
  const from = dayOf(y, 1, 1), end = dayOf(y, 12, 31);
  const to = Math.min(end, M.maxD);
  return { y, from, to, partial: to < end };
}

/* אותה תקופה בשנה הקודמת. בשנה מלאה — כל השנה הקודמת. */
export function prevSpan(y) {
  const s = yearSpan(y);
  return s.partial
    ? { y: y - 1, from: dayOf(y - 1, 1, 1), to: shiftYear(s.to, -1), aligned: true }
    : { y: y - 1, from: dayOf(y - 1, 1, 1), to: dayOf(y - 1, 12, 31), aligned: false };
}

/* השנה שנבחרה בסרגל, אם נבחרה בדיוק אחת. בלעדיה אין מול מה להשוות. */
export function selectedYear() {
  return F.years.size === 1 ? [...F.years][0] : null;
}

/* זוג התקופות שכל המסכים משווים ביניהן: הנבחרת מול המקבילה אשתקד,
   עם אותם פילטרים שאינם תקופה. */
export function pair() {
  const y = selectedYear();
  if (y == null) return { y: null, cur: IDX(), prev: null, span: null, pv: null };
  const span = yearSpan(y), pv = prevSpan(y);
  const prev = M.years.includes(y - 1) ? scanWindow(pv.from, pv.to) : null;
  return { y, cur: IDX(), prev, span, pv };
}

/* משפט אחד שמסביר בדיוק מה מול מה — מופיע מתחת לכל מספר השוואה */
export function pairNote(p) {
  if (!p || p.y == null) return 'בחר שנה אחת בסרגל כדי לראות השוואה לשנה הקודמת.';
  if (!p.prev) return `${p.y} · אין נתוני ${p.y - 1} בקובץ, ולכן אין השוואה.`;
  return p.span.partial
    ? `${p.y} עד ${dstr(p.span.to)} מול אותה תקופה ב-${p.y - 1} (עד ${dstr(p.pv.to)})`
    : `${p.y} המלאה מול ${p.y - 1} המלאה`;
}

export const monLabel = ym => MONS[ym % 12] + ' ' + String(Math.floor(ym / 12)).slice(2);
