// תנאי תשלום: התפלגות, פירוט לכל תנאי, והצלבה מול סוג ספק ומול סיכון.
import { esc, nf } from '../../core/base.js';
import { tally, riskOf } from './index.js';

const days = code => { const m = /^(?:E|N|BL)(\d+)$/.exec(code || ''); return m ? +m[1] : (code === 'CASH' ? 0 : null); };

export function termsView(data) {
  const rows = data.rows;
  const terms = tally(rows, d => d.ptd);
  const withDays = rows.map(d => days(d.pt)).filter(v => v != null);
  const avg = withDays.length ? withDays.reduce((a, b) => a + b, 0) / withDays.length : null;

  const topTypes = tally(rows, d => d.t).slice(0, 6).map(a => a[0]);
  const topTerms = terms.slice(0, 8).map(a => a[0]);

  return `
  <div class="panel">
    <div class="ph"><h2>תנאי התשלום במאגר</h2>
      <p>${terms.length} תנאים שונים · ממוצע ימי אשראי ${avg == null ? '—' : avg.toFixed(0)}</p></div>
    <div class="pb"><div class="bars">${terms.slice(0, 14).map(([k, v]) => {
      const max = terms[0][1];
      return `<button class="brow" data-jump="pt" data-val="${esc(k)}"
        style="background:none;border:0;padding:0;width:100%;text-align:start;color:inherit;cursor:pointer">
        <span class="blabel" title="${esc(k)}">${esc(k)}</span>
        <span class="btrack"><span class="bfill" style="width:${Math.max(1.5, v / max * 100)}%"></span></span>
        <span class="bval">${nf(v, 0)}<i>${(v / rows.length * 100).toFixed(1)}%</i></span>
      </button>`;
    }).join('')}</div></div>
  </div>

  <div class="panel">
    <div class="ph"><h2>פירוט לכל תנאי</h2><p>כמה ספקים, כמה פעילים, ומה הסיכון בתוכם</p></div>
    <div class="tblwrap"><table>
      <thead><tr><th>תנאי תשלום</th><th class="num">ימים</th><th class="num">ספקים</th><th class="num">פעילים</th>
        <th class="num">מסוכנים</th><th class="num">סקור ממוצע</th><th>מטבע עיקרי</th><th>סוג דומיננטי</th></tr></thead>
      <tbody>${terms.map(([name, n]) => {
        const set = rows.filter(d => d.ptd === name);
        const sc = set.filter(d => d.scr != null);
        const top = f => (tally(set, f)[0] || ['—'])[0];
        const risky = set.filter(d => riskOf(d).code === 'high').length;
        return `<tr data-jump="pt" data-val="${esc(name)}" style="cursor:pointer">
          <td>${esc(name)}<span class="sub">${esc(set[0]?.pt || '')}</span></td>
          <td class="num">${days(set[0]?.pt) ?? '—'}</td>
          <td class="num">${nf(n, 0)}</td>
          <td class="num">${set.filter(d => d.act).length}</td>
          <td class="num ${risky ? 'up' : ''}">${risky || '—'}</td>
          <td class="num">${sc.length ? (sc.reduce((a, b) => a + b.scr, 0) / sc.length).toFixed(0) : '—'}</td>
          <td class="sub">${esc(top(d => d.cur))}</td>
          <td class="sub">${esc(top(d => d.t))}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>

  <div class="panel">
    <div class="ph"><h2>תנאי תשלום מול סוג ספק</h2></div>
    <div class="pb tblwrap"><table class="matrix">
      <thead><tr><th>סוג ספק</th>${topTerms.map(t => `<th>${esc(t)}</th>`).join('')}<th>סה״כ</th></tr></thead>
      <tbody>${topTypes.map(ty => {
        const vals = topTerms.map(t => rows.filter(d => d.t === ty && d.ptd === t).length);
        const mx = Math.max(1, ...vals);
        return `<tr><td>${esc(ty)}</td>${vals.map(v =>
          `<td><span class="cell" style="background:color-mix(in srgb, var(--accent) ${Math.round(v / mx * 72)}%, transparent);color:${v / mx > 0.55 ? '#fff' : 'var(--ink)'}">${v || '·'}</span></td>`).join('')}
          <td class="num">${nf(rows.filter(d => d.t === ty).length, 0)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>`;
}

export function wireTerms(root, jump) {
  root.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => jump(b.dataset.jump, b.dataset.val));
}
