// סיכון ספקים לפי הסקור. הרף: מתחת ל-15 ספק מסוכן.
// הסקור הענפי מוצג כהשוואה בלבד ואינו משנה את הדירוג.
import { esc, nf } from '../../core/base.js';
import { riskOf } from './index.js';

const BUCKETS = [
  { he: 'מתחת ל-15', risk: 'high', c: 'var(--up)', f: d => d.scr != null && d.scr < 15 },
  { he: '15–29', risk: 'watch', c: 'var(--warn)', f: d => d.scr != null && d.scr >= 15 && d.scr < 30 },
  { he: '30–44', risk: '', c: 'var(--c5)', f: d => d.scr != null && d.scr >= 30 && d.scr < 45 },
  { he: '45–59', risk: '', c: 'var(--c2)', f: d => d.scr != null && d.scr >= 45 && d.scr < 60 },
  { he: '60–74', risk: '', c: 'var(--c6)', f: d => d.scr != null && d.scr >= 60 && d.scr < 75 },
  { he: '75 ומעלה', risk: '', c: 'var(--down)', f: d => d.scr != null && d.scr >= 75 },
  { he: 'לא נסקר', risk: 'none', c: 'var(--ink3)', f: d => d.scr == null }
];

export function riskView(data) {
  const rows = data.rows;
  const scored = rows.filter(d => d.scr != null);
  const danger = rows.filter(d => d.scr != null && d.scr < 15);
  const watch = rows.filter(d => d.scr != null && d.scr >= 15 && d.scr < 30);
  const below = rows.filter(d => d.scr != null && d.ind != null && d.scr < d.ind);
  const avg = scored.length ? scored.reduce((a, b) => a + b.scr, 0) / scored.length : null;
  const max = Math.max(1, ...BUCKETS.map(b => rows.filter(b.f).length));

  return `
  <div class="panel">
    <div class="ph"><h2>סיכון ספקים</h2>
      <p>הדירוג לפי הסקור. מתחת ל-15 ספק מסוכן · ${nf(scored.length, 0)} נסקרו מתוך ${nf(rows.length, 0)}</p></div>
    <div class="cards">
      ${kpi('מסוכנים', danger.length, 'סקור מתחת ל-15', 'high', 'var(--up)')}
      ${kpi('במעקב', watch.length, 'סקור 15 עד 29', 'watch', 'var(--warn)')}
      ${kpi('סקור ממוצע', avg == null ? '—' : avg.toFixed(1), 'על פני כל הנסקרים', '', '')}
      ${kpi('לא נסקרו', rows.length - scored.length, 'אין נתון סקור במערכת', 'none', 'var(--ink3)')}
    </div>
  </div>

  <div class="panel">
    <div class="ph"><h2>התפלגות הסקור</h2><p>לחיצה על מדרגה פותחת את רשימת הספקים שבה</p></div>
    <div class="pb"><div class="bars">
      ${BUCKETS.map(b => {
        const n = rows.filter(b.f).length;
        return `<div class="brow ${b.risk ? 'click' : ''}" ${b.risk ? `data-risk="${b.risk}" role="button" tabindex="0"` : ''}>
          <span class="blabel">${esc(b.he)}</span>
          <span class="btrack"><span class="bfill" style="width:${Math.max(1.5, n / max * 100).toFixed(1)}%;background:${b.c}"></span></span>
          <span class="bval">${nf(n, 0)}<i>${(n / rows.length * 100).toFixed(1)}%</i></span>
        </div>`;
      }).join('')}
    </div></div>
  </div>

  <div class="panel">
    <div class="ph"><h2>ספקים מסוכנים</h2>
      <p>${danger.length} ספקים עם סקור מתחת ל-15 — בדוק לפני הזמנה חדשה</p>
      <span class="right"><button class="btn sm" data-csv>ייצוא CSV</button></span></div>
    ${danger.length ? table(danger.sort((a, b) => a.scr - b.scr))
      : `<div class="pb"><div class="empty"><b>אין ספקים מתחת לרף</b></div></div>`}
  </div>

  <div class="panel">
    <div class="ph"><h2>סקור מול ממוצע הענף</h2>
      <p>${below.length} ספקים שהסקור שלהם נמוך מממוצע הענף. להשוואה בלבד, לא דירוג סיכון</p></div>
    ${table(below.filter(d => d.scr >= 15).sort((a, b) => (a.scr - a.ind) - (b.scr - b.ind)).slice(0, 50))}
  </div>`;
}

function kpi(label, value, sub, risk, color) {
  const clickable = Boolean(risk);
  return `<div class="card ${clickable ? 'click' : ''}" ${clickable ? `data-risk="${risk}" role="button" tabindex="0"` : ''}>
    <span class="nm">${color ? `<i class="dot" style="background:${color}"></i>` : ''}${esc(label)}</span>
    <span class="val" ${color && risk === 'high' ? 'style="color:var(--up)"' : ''}>${typeof value === 'number' ? nf(value, 0) : esc(String(value))}</span>
    <span class="row dim">${esc(sub)}</span>
  </div>`;
}

function table(list) {
  if (!list.length) return `<div class="pb"><div class="empty"><b>אין ספקים ברשימה</b></div></div>`;
  return `<div class="tblwrap"><table>
    <thead><tr><th>ספק</th><th>סוג</th><th class="num">סקור</th><th class="num">ענף</th><th class="num">פער</th>
      <th class="num">המלצת אשראי</th><th>תנאי תשלום</th><th>סטטוס</th><th>אחראי</th></tr></thead>
    <tbody>${list.map(rowHtml).join('')}</tbody></table></div>`;
}

function rowHtml(d) {
  const gap = (d.scr != null && d.ind != null) ? d.scr - d.ind : null;
  const r = riskOf(d);
  return `<tr>
    <td>${esc(d.nm || '—')}<span class="sub">${esc(d.id)}${d.city ? ' · ' + esc(d.city) : ''}</span></td>
    <td class="sub">${esc(d.t || '')}</td>
    <td class="num"><span class="pill ${r.cls}">${d.scr == null ? '—' : nf(d.scr, 0)}</span></td>
    <td class="num">${d.ind == null ? '—' : nf(d.ind, 0)}</td>
    <td class="num ${gap == null ? '' : gap < 0 ? 'up' : 'down'}">${gap == null ? '—' : (gap > 0 ? '+' : '') + gap.toFixed(0)}</td>
    <td class="num">${d.crd == null ? '—' : nf(d.crd, 0) + ' ₪'}</td>
    <td class="sub">${esc(d.ptd || '')}</td>
    <td><span class="pill ${d.act ? 'ok' : 'off'}">${esc(d.st || '')}</span></td>
    <td class="sub">${esc(d.own || '')}</td>
  </tr>`;
}
