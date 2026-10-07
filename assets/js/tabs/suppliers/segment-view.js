// פילוח: כל גרף לחיץ ומעביר לרשימת אנשי הקשר המסוננת.
import { esc, nf } from '../../core/base.js';
import { tally, riskOf } from './index.js';

const GROUPS = [
  { key: 't', he: 'סוג ספק', f: d => d.t, n: 14 },
  { key: 'st', he: 'סטטוס', f: d => d.st, n: 8 },
  { key: 'cn', he: 'ארץ', f: d => d.cn, n: 10 },
  { key: 'city', he: 'עיר', f: d => d.city, n: 12 },
  { key: 'cur', he: 'מטבע', f: d => d.cur, n: 8 },
  { key: 'own', he: 'אחראי טיפול', f: d => d.own, n: 10 }
];

export function segmentView(data) {
  const rows = data.rows;
  return `
  <div class="banner"><div>כל עמודה כאן לחיצה. לחיצה פותחת את רשימת אנשי הקשר מסוננת לאותו ערך,
  ומשם אפשר להמשיך לסנן, למיין ולייצא.</div></div>

  <div class="panel">
    <div class="ph"><h2>סוג ספק</h2><p>${tally(rows, d => d.t).length} סוגים · לחיצה פותחת את הרשימה</p></div>
    <div class="tiles">${tally(rows, d => d.t).map(([k, n]) => {
      const sub = rows.filter(d => d.t === k);
      const risky = sub.filter(d => riskOf(d).code === 'high').length;
      return `<button class="tile" data-jump="t" data-val="${esc(k)}">
        <b>${nf(n, 0)}</b><span>${esc(k)}</span>
        <em>${sub.filter(d => d.act).length} פעילים${risky ? ` · ${risky} מסוכנים` : ''}</em>
        <span class="mini"><i style="width:${n / rows.length * 100}%"></i></span></button>`;
    }).join('')}</div>
  </div>

  <div class="grid2">
    ${GROUPS.slice(1).map(g => panel(g, rows)).join('')}
  </div>

  <div class="panel">
    <div class="ph"><h2>תחומי סיווג</h2></div>
    <div class="pb">${bars(tally(rows, d => d.cls).slice(0, 12), rows.length, null)}</div>
  </div>`;
}

const panel = (g, rows) => `<div class="panel">
  <div class="ph"><h2>${esc(g.he)}</h2></div>
  <div class="pb">${bars(tally(rows, g.f).slice(0, g.n), rows.length, g.key)}</div>
</div>`;

function bars(items, total, jumpKey) {
  const max = Math.max(1, ...items.map(i => i[1]));
  return `<div class="bars">${items.map(([k, v]) => `
    <button class="brow" ${jumpKey ? `data-jump="${jumpKey}" data-val="${esc(k)}"` : 'disabled'}
      style="background:none;border:0;padding:0;width:100%;text-align:start;color:inherit;cursor:${jumpKey ? 'pointer' : 'default'}">
      <span class="blabel" title="${esc(k)}">${esc(k)}</span>
      <span class="btrack"><span class="bfill" style="width:${Math.max(1.5, v / max * 100)}%"></span></span>
      <span class="bval">${nf(v, 0)}<i>${(v / total * 100).toFixed(1)}%</i></span>
    </button>`).join('')}</div>`;
}

export function wireSegment(root, jump) {
  root.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => jump(b.dataset.jump, b.dataset.val));
}
