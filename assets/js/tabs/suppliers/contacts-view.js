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
  ['own', 'אחראי', d => d.own],
  ['cls', 'תחום סיווג', d => d.cls]
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
  </div>
  <div class="scrim" id="scrim"></div>
  <aside class="drawer" id="drawer" aria-hidden="true" aria-label="כרטיס ספק">
    <div class="dh"><div id="dHead"></div><button class="x" id="dClose" aria-label="סגירה">×</button></div>
    <div class="db" id="dBody"></div>
  </aside>`;
}

const row = (label, value) => value ? `<dt>${esc(label)}</dt><dd>${value}</dd>` : '';

/* כרטיס ספק מלא. נפתח בלחיצה על שורה ומציג כל שדה שקיים ברשומה. */
function detail(d) {
  const r = riskOf(d);
  const gap = (d.scr != null && d.ind != null) ? d.scr - d.ind : null;
  return {
    head: `<h3>${esc(d.nm || '(ללא שם)')}</h3>
      <span class="sub">${esc(d.id)}${d.en ? ' · ' + esc(d.en) : ''}</span>
      <span class="sub"><span class="pill ${r.cls}">${esc(r.he)}</span>
        <span class="pill ${d.act ? 'ok' : 'off'}">${esc(d.st || '')}</span></span>`,
    body: `
      <div class="grp"><h4>יצירת קשר</h4><dl class="kv">
        ${row('טלפון', d.tel ? `<a class="mono" href="tel:${esc(d.tel.replace(/\s/g, ''))}">${esc(d.tel)}</a>` : '')}
        ${row('פקס', d.fax ? `<span class="mono">${esc(d.fax)}</span>` : '')}
        ${row('אימייל', d.em ? `<a href="mailto:${esc(d.em)}">${esc(d.em)}</a>` : '')}
        ${row('אתר', d.web ? `<a href="${d.web.startsWith('http') ? esc(d.web) : 'https://' + esc(d.web)}" target="_blank" rel="noopener">${esc(d.web)}</a>` : '')}
        ${row('כתובת', esc(d.ad))}
        ${row('עיר', esc(d.city))}
        ${row('ארץ', esc(d.cn))}
      </dl></div>

      <div class="grp"><h4>סקור ואשראי</h4><dl class="kv">
        ${row('סקור הספק', d.scr == null ? 'לא נסקר' : `<b>${nf(d.scr, 0)}</b>`)}
        ${row('סקור ענפי', d.ind == null ? '' : nf(d.ind, 0))}
        ${row('פער מול הענף', gap == null ? '' : `<span class="${gap < 0 ? 'up' : 'down'}">${(gap > 0 ? '+' : '') + gap.toFixed(0)}</span>`)}
        ${row('המלצת אשראי', d.crd == null ? '' : nf(d.crd, 0) + ' ₪')}
      </dl></div>

      <div class="grp"><h4>תנאי מסחר</h4><dl class="kv">
        ${row('תנאי תשלום', esc(d.ptd))}
        ${row('מטבע', esc(d.cur))}
        ${row('סוג ספק', esc(d.t) + (d.tc ? ` (${esc(d.tc)})` : ''))}
        ${row('תחום סיווג', esc(d.cls))}
        ${row('תחום עיסוק', esc(d.field))}
        ${row('מקור', d.ord === 'O' ? 'הזמנה' : d.ord === 'D' ? 'דרישה' : '')}
      </dl></div>

      <div class="grp"><h4>זיהוי וניהול</h4><dl class="kv">
        ${row('עוסק מורשה / ח.פ', d.vat ? `<span class="mono">${esc(d.vat)}</span>` : '')}
        ${row('אחראי טיפול', esc(d.own))}
        ${row('תאריך פתיחה', esc(d.dt))}
        ${row('שנת הקמה', d.yr == null ? '' : nf(d.yr, 0))}
        ${row('מספר עובדים', d.emp == null ? '' : nf(d.emp, 0))}
      </dl></div>`
  };
}

const ar = k => `<span class="ar">${S.sort.k === k ? (S.sort.d > 0 ? '▲' : '▼') : ''}</span>`;

function card(d) {
  const r = riskOf(d);
  return `<tr class="click" data-open="${esc(d.id)}" tabindex="0">
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

export function wireContacts(root, rerender, jump, rowsRef = []) {
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

  // כרטיס ספק מלא בלחיצה על שורה
  const drawer = root.querySelector('#drawer');
  const scrim = root.querySelector('#scrim');
  const close = () => {
    drawer?.classList.remove('on');
    drawer?.setAttribute('aria-hidden', 'true');
    scrim?.classList.remove('on');
    root.querySelectorAll('tr.on').forEach(t => t.classList.remove('on'));
  };
  const byId = new Map(rowsRef.map(d => [String(d.id), d]));
  root.querySelectorAll('tr[data-open]').forEach(tr => {
    const open = () => {
      const d = byId.get(tr.dataset.open);
      if (!d || !drawer) return;
      const { head, body } = detail(d);
      root.querySelector('#dHead').innerHTML = head;
      root.querySelector('#dBody').innerHTML = body;
      root.querySelectorAll('tr.on').forEach(t => t.classList.remove('on'));
      tr.classList.add('on');
      drawer.classList.add('on');
      drawer.setAttribute('aria-hidden', 'false');
      scrim?.classList.add('on');
    };
    tr.onclick = e => { if (e.target.closest('a')) return; open(); };
    tr.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); open(); } };
  });
  const x = root.querySelector('#dClose');
  if (x) x.onclick = close;
  if (scrim) scrim.onclick = close;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
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
