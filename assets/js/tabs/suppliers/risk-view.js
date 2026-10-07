// סיכון ספקים: הסקור של הספק מול ממוצע הענף שלו.
//
// הערה על הנתונים: העמודה "ציון ספק" בייצוא מ-Priority ריקה — אפס בכל
// השורות — ולכן אי אפשר לדרג לפיה. הדירוג נשען על "סקור" מול "סקור ענפי",
// שהם השדות שבאמת מאוכלסים.
import { esc, nf } from '../../core/base.js';
import { riskOf } from './index.js';

const BUCKETS = [
  ['מתחת ל-15', d => d.scr != null && d.scr < 15, 'var(--up)'],
  ['15–29', d => d.scr != null && d.scr >= 15 && d.scr < 30, 'var(--warn)'],
  ['30–44', d => d.scr != null && d.scr >= 30 && d.scr < 45, 'var(--c5)'],
  ['45–59', d => d.scr != null && d.scr >= 45 && d.scr < 60, 'var(--c2)'],
  ['60–74', d => d.scr != null && d.scr >= 60 && d.scr < 75, 'var(--c1)'],
  ['75 ומעלה', d => d.scr != null && d.scr >= 75, 'var(--down)'],
  ['לא נסקר', d => d.scr == null, 'var(--ink3)']
];

export function riskView(data) {
  const rows = data.rows;
  const scored = rows.filter(d => d.scr != null);
  const danger = rows.filter(d => riskOf(d).code === 'high');
  const below = rows.filter(d => d.scr != null && d.ind != null && d.scr < d.ind);
  const avg = scored.length ? scored.reduce((a, b) => a + b.scr, 0) / scored.length : null;

  const maxB = Math.max(1, ...BUCKETS.map(([, f]) => rows.filter(f).length));

  return `
  <div class="banner warn">
    <div><b>על מה הדירוג נשען.</b> העמודה "ציון ספק" בייצוא מ-Priority ריקה לחלוטין — אפס בכל
    1,713 השורות — ולכן אי אפשר לדרג לפיה. הדירוג כאן מבוסס על <b>סקור</b> מול <b>סקור ענפי</b>,
    שהם השדות המאוכלסים בפועל. הרף שהגדרת, סקור מתחת ל-15, מיושם עליהם.</div>
  </div>

  <div class="panel">
    <div class="ph"><h2>תמונת סיכון</h2><p>${nf(scored.length, 0)} ספקים נסקרו מתוך ${nf(rows.length, 0)}</p></div>
    <div class="cards">
      ${kpi('ספקים מסוכנים', danger.length, 'סקור מתחת ל-15', 'high', 'high')}
      ${kpi('חלשים מהענף', below.length, 'סקור נמוך מממוצע הענף שלהם', 'medium', 'weak')}
      ${kpi('סקור ממוצע', avg == null ? '—' : avg.toFixed(1), 'על פני כל הנסקרים', '', '')}
      ${kpi('לא נסקרו', rows.length - scored.length, 'אין נתון סקור במערכת', '', 'none')}
    </div>
  </div>

  <div class="panel">
    <div class="ph"><h2>התפלגות הסקור</h2><p>לחיצה על עמודה פותחת את רשימת הספקים שבה</p></div>
    <div class="pb"><div class="bars">
      ${BUCKETS.map(([label, f, color], i) => {
        const n = rows.filter(f).length;
        return `<button class="brow" data-bucket="${i}" style="cursor:pointer;background:none;border:0;padding:0;width:100%;text-align:start;color:inherit">
          <span class="blabel">${esc(label)}</span>
          <span class="btrack"><span class="bfill" style="width:${Math.max(1.5, n / maxB * 100)}%;background:${color}"></span></span>
          <span class="bval">${nf(n, 0)}<i>${(n / rows.length * 100).toFixed(1)}%</i></span>
        </button>`;
      }).join('')}
    </div></div>
  </div>

  <div class="panel">
    <div class="ph"><h2>רשימת הספקים המסוכנים</h2>
      <p>סקור מתחת ל-15 — בדוק לפני הזמנה חדשה</p>
      <span class="right"><button class="btn sm" data-csv-risk>ייצוא CSV</button></span>
    </div>
    ${danger.length ? `<div class="tblwrap"><table>
      <thead><tr><th>ספק</th><th>סוג</th><th class="num">סקור</th><th class="num">ענף</th><th class="num">פער</th>
        <th class="num">המלצת אשראי</th><th>תנאי תשלום</th><th>סטטוס</th><th>אחראי</th></tr></thead>
      <tbody>${danger.sort((a, b) => (a.scr ?? 0) - (b.scr ?? 0)).map(rowHtml).join('')}</tbody>
    </table></div>` : `<div class="pb"><div class="empty"><b>אין ספקים מתחת לרף</b></div></div>`}
  </div>

  <div class="panel">
    <div class="ph"><h2>חלשים ביחס לענף שלהם</h2><p>סקור תקין במונחים מוחלטים, אך נמוך מממוצע הענף</p></div>
    <div class="tblwrap"><table>
      <thead><tr><th>ספק</th><th>סוג</th><th class="num">סקור</th><th class="num">ענף</th><th class="num">פער</th>
        <th class="num">המלצת אשראי</th><th>תנאי תשלום</th><th>סטטוס</th><th>אחראי</th></tr></thead>
      <tbody>${below.filter(d => riskOf(d).code !== 'high')
        .sort((a, b) => (a.scr - a.ind) - (b.scr - b.ind)).slice(0, 60).map(rowHtml).join('')}</tbody>
    </table></div>
  </div>`;
}

function kpi(label, value, sub, cls, risk) {
  return `<button class="card" data-risk="${esc(risk)}" style="text-align:start;border:0;cursor:${risk ? 'pointer' : 'default'}">
    <span class="nm">${esc(label)}</span>
    <span class="val ${cls === 'high' ? 'up' : ''}">${typeof value === 'number' ? nf(value, 0) : esc(String(value))}</span>
    <span class="row dim">${esc(sub)}</span>
  </button>`;
}

function rowHtml(d) {
  const gap = (d.scr != null && d.ind != null) ? d.scr - d.ind : null;
  const r = riskOf(d);
  return `<tr>
    <td>${esc(d.nm || '—')}<span class="sub">${esc(d.id)}${d.city ? ' · ' + esc(d.city) : ''}</span></td>
    <td class="sub">${esc(d.t || '')}</td>
    <td class="num"><b>${d.scr == null ? '—' : nf(d.scr, 0)}</b></td>
    <td class="num">${d.ind == null ? '—' : nf(d.ind, 0)}</td>
    <td class="num ${gap == null ? '' : gap < 0 ? 'up' : 'down'}">${gap == null ? '—' : (gap > 0 ? '+' : '') + gap.toFixed(0)}</td>
    <td class="num">${d.crd == null ? '—' : nf(d.crd, 0) + ' ₪'}</td>
    <td class="sub">${esc(d.ptd || '')}</td>
    <td><span class="pill ${r.cls}">${esc(d.st || '')}</span></td>
    <td class="sub">${esc(d.own || '')}</td>
  </tr>`;
}

export { BUCKETS };
