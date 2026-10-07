// תת-לשונית הכימיקלים של גלעם: לכל פריט — תזוזת מנועי העלות, רכיב ההובלה,
// עוצמת המיקוח, והמלצה מפורשת לקניין בסוף השורה.
import { esc, nf, pc, dirClass, send, clearCache } from '../../core/base.js';
import { expectedChange, recommend, freightPart } from './data.js';

const WINDOWS = [['d30', 'חודש'], ['d90', 'רבעון'], ['d365', 'שנה']];

export function chemicalsView(market, chem, prices, byId, state) {
  const win = state.win || 'd90';
  const rows = chem.items.map(item => {
    const exp = expectedChange(item, byId, win);
    const paid = prices[item.item || String(item.n)] || null;
    const rec = recommend(item, exp, paid);
    const fr = freightPart(item, byId, win);
    return { item, exp, paid, rec, fr };
  }).sort((a, b) => order(a.rec) - order(b.rec) || b.rec.lev - a.rec.lev);

  const asks = rows.filter(r => r.rec.code === 'ask');
  const locks = rows.filter(r => r.rec.code === 'lock');
  const missing = rows.filter(r => !r.paid).length;

  return `
  <div class="banner">
    <div><b>איך ההמלצה מחושבת.</b> לכל כימיקל מוגדרים מנועי העלות שלו — חומר גלם במעלה הזרם, אנרגיה, מטבע
    ורכיב ההובלה הרלוונטי (מכלית ים, מיכלית בישראל או מכולה). המערכת משקללת את תזוזתם, משווה אותה לשינוי
    במחיר ששולם בפועל, וההמלצה נגזרת מהפער. ${missing ? `כרגע חסר מחיר אחרון ל-${missing} פריטים, ולכן עבורם ההמלצה מבוססת על כיוון השוק בלבד.` : ''}</div>
  </div>

  <div class="panel">
    <div class="ph">
      <h2>המלצות קנייה</h2>
      <p>${asks.length} פריטים לפנייה להוזלה · ${locks.length} לנעילת מחיר</p>
      <span class="right">חלון השוואה:
        ${WINDOWS.map(([k, he]) => `<button class="subtab" data-win="${k}" aria-selected="${k === win}">${he}</button>`).join('')}
      </span>
    </div>
    <div class="tblwrap"><table>
      <thead><tr>
        <th>כימיקל</th><th class="num">טון/שנה</th><th>ספקים</th><th>הובלה</th>
        <th class="num">הובלה ${esc(label(win))}</th><th class="num">מנועי עלות</th><th class="num">מחיר ששולם</th>
        <th class="num">פער</th><th class="num">מיקוח</th><th>המלצה לקניין</th>
      </tr></thead>
      <tbody>${rows.map(rowHtml).join('')}</tbody>
    </table></div>
  </div>

  <div class="panel">
    <div class="ph"><h2>מחיר אחרון ששולם</h2><p>הזנת המחיר הנוכחי והקודם הופכת את ההמלצה ממגמת שוק לפער אמיתי</p></div>
    <div class="pb"><div class="tblwrap"><table>
      <thead><tr><th>כימיקל</th><th>מחיר נוכחי</th><th>מחיר קודם</th><th>מטבע</th><th>בתוקף מ-</th><th>ספק</th><th></th></tr></thead>
      <tbody>${chem.items.map(i => priceRow(i, prices[i.item || String(i.n)])).join('')}</tbody>
    </table></div></div>
  </div>`;
}

const label = w => ({ d30: 'חודש', d90: 'רבעון', d365: 'שנה' }[w] || w);
const order = r => ({ ask: 0, lock: 1, wait: 2, hold: 3, quiet: 4, nodata: 5 }[r.code] ?? 9);

function rowHtml({ item, exp, paid, rec, fr }) {
  const paidChg = (paid && Number.isFinite(paid.prev) && paid.prev > 0) ? (paid.price - paid.prev) / paid.prev * 100 : null;
  return `<tr>
    <td>${esc(item.he || item.en)}<span class="sub">${esc(item.en)}${item.item ? ' · ' + esc(item.item) : ''} · ${esc(item.origin)}</span></td>
    <td class="num">${nf(item.tons, item.tons < 10 ? 2 : 0)}</td>
    <td class="num">${item.sup}</td>
    <td class="sub">${esc(fr ? fr.he : '—')}</td>
    <td class="num ${dirClass(fr?.chg)}">${pc(fr?.chg)}</td>
    <td class="num ${dirClass(exp.pct)}" title="${esc(breakdown(exp))}">${pc(exp.pct)}${exp.covered < 0.99 ? `<span class="sub">כיסוי ${Math.round(exp.covered * 100)}%</span>` : ''}</td>
    <td class="num ${dirClass(paidChg)}">${paidChg == null ? '<span class="sub">לא הוזן</span>' : pc(paidChg)}</td>
    <td class="num ${rec.gap == null ? 'flat' : rec.gap > 0 ? 'up' : 'down'}">${rec.gap == null ? '—' : (rec.gap > 0 ? '+' : '') + rec.gap.toFixed(1)}</td>
    <td class="num">${rec.lev}</td>
    <td><span class="pill ${rec.cls}">${esc(rec.he)}</span><span class="sub">${esc(rec.why)}</span></td>
  </tr>`;
}

function breakdown(exp) {
  return exp.parts.map(p => `${p.he}: משקל ${(p.w * 100).toFixed(0)}% · ${p.chg == null ? 'אין נתון' : (p.chg > 0 ? '+' : '') + p.chg.toFixed(1) + '%'}`).join('\n');
}

function priceRow(item, paid) {
  const k = item.item || String(item.n);
  return `<tr data-key="${esc(k)}">
    <td>${esc(item.he || item.en)}<span class="sub">${esc(item.en)}</span></td>
    <td><input class="inp" type="number" step="any" data-f="price" value="${paid?.price ?? ''}" placeholder="0"></td>
    <td><input class="inp" type="number" step="any" data-f="prev" value="${paid?.prev ?? ''}" placeholder="0"></td>
    <td><select class="inp" data-f="cur" style="width:84px">
      ${['USD', 'EUR', 'ILS'].map(c => `<option ${((paid?.cur) || item.cur) === c ? 'selected' : ''}>${c}</option>`).join('')}
    </select></td>
    <td><input class="inp" type="date" data-f="date" value="${paid?.date || new Date().toISOString().slice(0, 10)}" style="width:142px"></td>
    <td><input class="inp" type="text" data-f="supplier" value="${esc(paid?.supplier || '')}" placeholder="שם הספק" style="width:150px;text-align:start"></td>
    <td><button class="btn sm" data-savep>שמור</button></td>
  </tr>`;
}

export function wireChemicals(root, state, rerender) {
  root.querySelectorAll('[data-win]').forEach(b => b.onclick = () => { state.win = b.dataset.win; rerender(); });
  root.querySelectorAll('[data-savep]').forEach(btn => {
    btn.onclick = async () => {
      const tr = btn.closest('tr');
      const f = k => tr.querySelector(`[data-f="${k}"]`).value;
      const price = Number(f('price'));
      if (!Number.isFinite(price) || !f('price')) { tr.querySelector('[data-f="price"]').focus(); return; }
      btn.disabled = true; btn.textContent = '…';
      const r = await send('/api/prices', 'PUT', {
        [tr.dataset.key]: { price, prev: f('prev') ? Number(f('prev')) : null, cur: f('cur'), date: f('date'), supplier: f('supplier') }
      });
      btn.disabled = false; btn.textContent = r.ok ? 'נשמר' : 'שגיאה';
      if (r.ok) { clearCache(); setTimeout(rerender, 400); }
    };
  });
}
