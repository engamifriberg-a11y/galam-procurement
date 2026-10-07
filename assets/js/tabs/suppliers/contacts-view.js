// אנשי קשר: חיפוש חופשי אמין וסינון. החיפוש עובר על שם, מספר, טלפון,
// אימייל, כתובת, עיר, ח.פ, סיווג ותחום עיסוק, ומתמודד עם כמה מילים בכל סדר.
import { esc, nf, clearCache } from '../../core/base.js';
import { S, applyFilters, tally, riskOf } from './index.js';

const FDEF = [
  ['t', 'סוג ספק', d => d.t],
  ['st', 'סטטוס', d => d.st],
  ['pt', 'תנאי תשלום', d => d.ptd],
  ['cur', 'מטבע', d => d.cur],
  ['cn', 'ארץ', d => d.cn],
  ['city', 'עיר', d => d.city],
  ['own', 'אחראי', d => d.own]
];
const RISKS = [['high', 'מסוכן'], ['weak', 'חלש מהענף'], ['watch', 'במעקב'], ['under', 'מתחת לענף'], ['ok', 'תקין'], ['none', 'לא נסקר']];

const COLS = [
  ['nm', 'שם הספק', d => `<span class="nm">${esc(d.nm || '—')}</span>${d.en ? `<span class="sub">${esc(d.en)}</span>` : ''}`],
  ['id', 'מס׳', d => `<span class="mono">${esc(d.id)}</span>`],
  ['t', 'סוג', d => esc(d.t)],
  ['scr', 'סקור', d => {
    const r = riskOf(d);
    return `<span class="pill ${r.cls}">${d.scr == null ? '—' : nf(d.scr, 0)}</span>${d.ind != null ? `<span class="sub">ענף ${nf(d.ind, 0)}</span>` : ''}`;
  }],
  ['tel', 'טלפון', d => d.tel ? `<a class="mono" href="tel:${esc(d.tel.replace(/\s/g, ''))}">${esc(d.tel)}</a>` : '<span class="sub">—</span>'],
  ['em', 'אימייל', d => d.em ? `<a href="mailto:${esc(d.em)}">${esc(d.em)}</a>` : '<span class="sub">—</span>'],
  ['city', 'כתובת', d => d.city || d.ad ? `${esc(d.city)}${d.ad ? `<span class="sub">${esc(d.ad)}</span>` : ''}` : '<span class="sub">—</span>'],
  ['ptd', 'תנאי תשלום', d => `${esc(d.ptd)}<span class="sub">${esc(d.cur)}</span>`],
  ['st', 'סטטוס', d => `<span class="pill ${d.act ? 'ok' : 'off'}">${esc(d.st)}</span>`]
];

/* חיפוש בכמה מילים, בכל סדר. "כימיכלור חיפה" ימצא גם אם העיר מופיעה לפני השם. */
export function matches(d, q) {
  if (!q) return true;
  return q.split(/\s+/).filter(Boolean).every(w => d.blob.includes(w));
}

export function contactsView(data) {
  const rows = applyFilters(data.rows).filter(d => matches(d, S.q));
  const k = S.sort.k, dir = S.sort.d;
  rows.sort((a, b) => {
    let x = a[k], y = b[k];
    if (k === 'scr') return ((x ?? -1) - (y ?? -1)) * dir;
    x = x ?? ''; y = y ?? '';
    return String(x).localeCompare(String(y), 'he', { numeric: true }) * dir;
  });
  const slice = rows.slice(0, S.limit);

  return `
  <div class="panel">
    <div class="search-row">
      <div class="search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="q" type="search" value="${esc(S.q)}" autocomplete="off"
          placeholder="חיפוש: שם, מספר ספק, טלפון, אימייל, כתובת, עיר, ח.פ, סיווג, תחום עיסוק — אפשר כמה מילים">
      </div>
    </div>
    <div class="filters">
      ${FDEF.map(([key, lbl, f]) => `<div class="f"><label>${lbl}</label>
        <select data-k="${key}"><option value="">הכל</option>
        ${tally(data.rows, f).map(([v, n]) => `<option value="${esc(v)}" ${S[key] === v ? 'selected' : ''}>${esc(v)} (${n})</option>`).join('')}
        </select></div>`).join('')}
      <div class="f"><label>דירוג סיכון</label>
        <select data-k="risk"><option value="">הכל</option>
        ${RISKS.map(([v, he]) => `<option value="${v}" ${S.risk === v ? 'selected' : ''}>${he} (${data.rows.filter(d => riskOf(d).code === v).length})</option>`).join('')}
        </select></div>
    </div>
    <div class="bar">
      <span class="count"><b>${nf(rows.length, 0)}</b> ספקים</span>
      <button class="btn" data-csv>ייצוא CSV</button>
      <button class="btn" data-clear>ניקוי סינון</button>
      <div class="chips">${chips()}</div>
    </div>
    <div class="tblwrap"><table>
      <thead><tr>${COLS.map(([key, lbl]) => `<th data-sort="${key}">${lbl} <span class="ar">${S.sort.k === key ? (S.sort.d > 0 ? '▲' : '▼') : ''}</span></th>`).join('')}</tr></thead>
      <tbody>${slice.length ? slice.map(d => `<tr>${COLS.map(([, , f]) => `<td>${f(d)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${COLS.length}"><div class="empty"><b>אין ספק שמתאים</b>נסה מילה אחת פחות, או נקה את הסינון.</div></td></tr>`}</tbody>
    </table></div>
    ${rows.length > S.limit ? `<button class="more" data-more>הצג עוד ${nf(Math.min(120, rows.length - S.limit), 0)} מתוך ${nf(rows.length - S.limit, 0)}</button>` : ''}
  </div>`;
}

function chips() {
  const act = [];
  if (S.q) act.push(['q', 'חיפוש: ' + S.q]);
  FDEF.forEach(([k, lbl]) => { if (S[k]) act.push([k, lbl + ': ' + S[k]]); });
  if (S.risk) act.push(['risk', 'סיכון: ' + (RISKS.find(r => r[0] === S.risk)?.[1] || S.risk)]);
  return act.map(([k, t]) => `<button class="chip" data-chip="${k}"><b>${esc(t)}</b> ✕</button>`).join('');
}

export function wireContacts(root, rerender, jump) {
  const q = root.querySelector('#q');
  if (q) {
    let timer;
    q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { S.q = q.value.trim().toLowerCase(); S.limit = 60; rerender(); }, 180); };
  }
  root.querySelectorAll('[data-k]').forEach(sel => sel.onchange = () => { S[sel.dataset.k] = sel.value; S.limit = 60; rerender(); });
  root.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { S[b.dataset.chip] = ''; S.limit = 60; rerender(); });
  root.querySelectorAll('[data-sort]').forEach(th => th.onclick = () => {
    const k = th.dataset.sort;
    S.sort = { k, d: S.sort.k === k ? -S.sort.d : 1 };
    rerender();
  });
  const more = root.querySelector('[data-more]');
  if (more) more.onclick = () => { S.limit += 120; rerender(); };
  const clear = root.querySelector('[data-clear]');
  if (clear) clear.onclick = () => {
    Object.assign(S, { q: '', t: '', st: '', city: '', cn: '', cur: '', pt: '', own: '', risk: '', limit: 60 });
    rerender();
  };
  // לחיצה על כרטיס או על עמודה בגרף הסיכון
  root.querySelectorAll('[data-risk]').forEach(b => {
    if (!b.dataset.risk) return;
    b.onclick = () => jump('risk', b.dataset.risk);
  });
  root.querySelectorAll('[data-bucket]').forEach(b => b.onclick = () => {
    const map = ['high', 'watch', '', '', '', 'ok', 'none'];
    const code = map[Number(b.dataset.bucket)];
    if (code) jump('risk', code); else jump('q', '');
  });
  const csv = root.querySelector('[data-csv]') || root.querySelector('[data-csv-risk]');
  if (csv) csv.onclick = () => exportCsv(root);
}

function exportCsv(root) {
  const table = root.querySelector('table');
  if (!table) return;
  const lines = [...table.querySelectorAll('tr')].map(tr =>
    [...tr.children].map(td => `"${td.innerText.replace(/\n/g, ' ').replace(/"/g, '""').trim()}"`).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'suppliers.csv'; a.click(); URL.revokeObjectURL(a.href);
}
