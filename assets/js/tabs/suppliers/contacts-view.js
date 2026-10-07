// אנשי קשר. חיפוש חופשי בכל השדות, או חיפוש ממוקד בשדה אחד.
import { esc, nf, cssEsc } from '../../core/base.js';
import { S, applyFilters, tally, riskOf } from './index.js';

// שדות לחיפוש ממוקד. "הכל" סורק את כל השדות גם יחד.
const SCOPES = [
  ['all', 'כל השדות', null],
  ['nm', 'שם ספק', d => `${d.nm} ${d.en}`],
  ['id', 'מספר ספק', d => d.id],
  ['vat', 'ח.פ / עוסק מורשה', d => d.vat],
  ['t', 'סוג ספק', d => d.t],
  ['ad', 'כתובת ועיר', d => `${d.ad} ${d.city} ${d.cn}`],
  ['tel', 'טלפון ופקס', d => `${d.tel} ${d.fax}`],
  ['em', 'אימייל ואתר', d => `${d.em} ${d.web}`],
  ['cls', 'סיווג ותחום עיסוק', d => `${d.cls} ${d.field}`],
  ['own', 'אחראי טיפול', d => d.own]
];

const FDEF = [
  ['t', 'סוג ספק', d => d.t],
  ['st', 'סטטוס', d => d.st],
  ['pt', 'תנאי תשלום', d => d.ptd],
  ['cur', 'מטבע', d => d.cur],
  ['cn', 'ארץ', d => d.cn],
  ['city', 'עיר', d => d.city],
  ['own', 'אחראי', d => d.own]
];
const RISKS = [['high', 'מסוכן'], ['watch', 'במעקב'], ['ok', 'תקין'], ['none', 'לא נסקר']];

/* כמה מילים בכל סדר. "כימיכלור חיפה" יימצא גם אם העיר מופיעה לפני השם. */
export function matches(d, q, scope) {
  if (!q) return true;
  const hay = (!scope || scope === 'all')
    ? d.blob
    : String((SCOPES.find(s => s[0] === scope)?.[2] || (() => ''))(d) || '').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

export function contactsView(data) {
  const rows = applyFilters(data.rows).filter(d => matches(d, S.q, S.scope));
  const k = S.sort.k, dir = S.sort.d;
  rows.sort((a, b) => {
    if (k === 'scr') return (((a.scr ?? -1) - (b.scr ?? -1))) * dir;
    return String(a[k] ?? '').localeCompare(String(b[k] ?? ''), 'he', { numeric: true }) * dir;
  });
  const slice = rows.slice(0, S.limit);

  return `
  <div class="panel">
    <div class="search-row">
      <select class="inp scope" id="scope" style="width:auto;text-align:start">
        ${SCOPES.map(([v, he]) => `<option value="${v}" ${(S.scope || 'all') === v ? 'selected' : ''}>${he}</option>`).join('')}
      </select>
      <div class="search plain">
        <input id="q" type="search" value="${esc(S.q)}" autocomplete="off"
          placeholder="הקלד לחיפוש — אפשר כמה מילים בכל סדר">
      </div>
    </div>
    <div class="filters">
      ${FDEF.map(([key, lbl, f]) => `<div class="f"><label>${lbl}</label>
        <select data-k="${key}"><option value="">הכל</option>
        ${tally(data.rows, f).map(([v, n]) => `<option value="${esc(v)}" ${S[key] === v ? 'selected' : ''}>${esc(v)} (${n})</option>`).join('')}
        </select></div>`).join('')}
      <div class="f"><label>סיכון</label>
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
    <div class="tblwrap"><table class="contacts">
      <thead><tr>
        <th data-sort="nm">ספק ${ar('nm')}</th>
        <th data-sort="t">סוג וסיווג ${ar('t')}</th>
        <th data-sort="scr" class="num">סקור ${ar('scr')}</th>
        <th>יצירת קשר</th>
        <th data-sort="city">כתובת ${ar('city')}</th>
        <th data-sort="ptd">תנאי תשלום ${ar('ptd')}</th>
        <th data-sort="st">סטטוס ${ar('st')}</th>
      </tr></thead>
      <tbody>${slice.length ? slice.map(card).join('')
        : `<tr><td colspan="7"><div class="empty"><b>אין ספק שמתאים</b>נסה מילה אחת פחות, או שנה את שדה החיפוש.</div></td></tr>`}</tbody>
    </table></div>
    ${rows.length > S.limit ? `<button class="more" data-more>הצג עוד ${nf(Math.min(120, rows.length - S.limit), 0)} מתוך ${nf(rows.length - S.limit, 0)}</button>` : ''}
  </div>`;
}

const ar = k => `<span class="ar">${S.sort.k === k ? (S.sort.d > 0 ? '▲' : '▼') : ''}</span>`;

function card(d) {
  const r = riskOf(d);
  return `<tr>
    <td>
      <span class="nm">${esc(d.nm || '—')}</span>
      ${d.en ? `<span class="sub">${esc(d.en)}</span>` : ''}
      <span class="sub mono">${esc(d.id)}${d.vat ? ' · ח.פ ' + esc(d.vat) : ''}</span>
    </td>
    <td>${esc(d.t || '—')}${d.cls ? `<span class="sub">${esc(d.cls)}</span>` : ''}</td>
    <td class="num">
      <span class="pill ${r.cls}">${d.scr == null ? '—' : nf(d.scr, 0)}</span>
      ${d.ind != null ? `<span class="sub">ענף ${nf(d.ind, 0)}</span>` : ''}
    </td>
    <td>
      ${d.tel ? `<a class="mono" href="tel:${esc(d.tel.replace(/\s/g, ''))}">${esc(d.tel)}</a>` : '<span class="sub">אין טלפון</span>'}
      ${d.em ? `<a class="sub" href="mailto:${esc(d.em)}">${esc(d.em)}</a>` : ''}
    </td>
    <td>${d.city ? esc(d.city) : '<span class="sub">—</span>'}${d.ad ? `<span class="sub">${esc(d.ad)}</span>` : ''}${d.cn && d.cn !== 'Israel' ? `<span class="sub">${esc(d.cn)}</span>` : ''}</td>
    <td>${esc(d.ptd || '—')}<span class="sub">${esc(d.cur || '')}</span></td>
    <td><span class="pill ${d.act ? 'ok' : 'off'}">${esc(d.st || '')}</span>${d.own ? `<span class="sub">${esc(d.own)}</span>` : ''}</td>
  </tr>`;
}

function chips() {
  const act = [];
  if (S.q) act.push(['q', (SCOPES.find(s => s[0] === (S.scope || 'all'))?.[1] || '') + ': ' + S.q]);
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
  const scope = root.querySelector('#scope');
  if (scope) scope.onchange = () => { S.scope = scope.value; S.limit = 60; rerender(); };
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
    Object.assign(S, { q: '', scope: 'all', t: '', st: '', city: '', cn: '', cur: '', pt: '', own: '', risk: '', limit: 60 });
    rerender();
  };
  root.querySelectorAll('[data-risk]').forEach(el => {
    const go = () => jump('risk', el.dataset.risk);
    el.onclick = go;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
  const csv = root.querySelector('[data-csv]');
  if (csv) csv.onclick = () => exportCsv(root);
}

function exportCsv(root) {
  const table = root.querySelector('table');
  if (!table) return;
  const lines = [...table.querySelectorAll('tr')].map(tr =>
    [...tr.children].map(td => `"${td.innerText.replace(/\n/g, ' · ').replace(/"/g, '""').trim()}"`).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'suppliers.csv'; a.click(); URL.revokeObjectURL(a.href);
}
