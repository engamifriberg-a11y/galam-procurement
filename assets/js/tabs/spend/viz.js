// עזרי תצוגה משותפים לכל מסכי ה-SPEND: עוגה קריאה, שורת מדדים, ורכיב
// "הגדולים ביותר" שחוזר בכל מסך. המטרה היא שכל מסך ייראה אותו דבר ויקרא
// אותו דבר, ושהקוד של כל מסך יעסוק רק בשאלה שהוא עונה עליה.
import { M, moneyC, money, num, topMap } from './model.js';
import { EL, panel, barRows } from './ui.js';
import { donut } from './charts.js';

/* עוגה קריאה: שמונה פלחים גדולים והשאר מקובצים. יותר מזה הוא טבעת צבעים. */
export function slices(map, nameOf, keep = 8) {
  const all = topMap(map);
  const head = all.slice(0, keep).map(([k, v]) => ({ name: nameOf(k) || '—', value: v, _k: k }));
  const rest = all.slice(keep).reduce((a, b) => a + b[1], 0);
  if (rest > 0) head.push({ name: `כל השאר (${num(all.length - keep)})`, value: rest, _k: null });
  return head;
}

/* עוגה + רשימת העמודות הגדולות, זו לצד זו. זה הצמד שחוזר בכל מסך. */
export function pieAndBars(root, { title, sub, map, nameOf, onPick, barTitle, barSub, keep = 8, bars = 12 }) {
  const row = EL('div', { class: 'grid2' });
  root.appendChild(row);

  const p1 = panel(row, title, sub);
  donut(p1, slices(map, nameOf, keep), { onClick: e => { if (e.data._k != null && onPick) onPick(e.data._k); } });

  const p2 = panel(row, barTitle, barSub);
  barRows(p2, topMap(map, bars).map(([k, v]) => [nameOf(k) || '—', v, k]),
    { onClick: onPick ? r => onPick(r[2]) : undefined });
  return row;
}
