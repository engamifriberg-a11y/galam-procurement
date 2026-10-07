// תת-לשונית ההובלה: נתיבים לנמל חיפה, זמני מעבר ואומדן מחיר.
//
// אין API חינמי למחיר מכולה בנתיב ספציפי לחיפה. מה שכן קיים ומתעדכן לבד הוא
// מדד ההובלה הימית של ה-BLS ומדדים נסחרים יומיים. לכן: אחוזי השינוי בטבלה
// מגיעים מהמדד ומתעדכנים מעצמם, והמחיר מופיע רק אחרי שהוזנה הצעת מחיר אמיתית
// אחת מהמשלח — ואז הוא מוצג כאומדן מוצמד למדד, מסומן ככזה.
import { esc, nf, pc, dirClass, get, send, clearCache } from '../../core/base.js';

const LS = 'lane-quotes';

function loadQuotes() {
  try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; }
}
function saveQuotes(q) {
  try { localStorage.setItem(LS, JSON.stringify(q)); } catch { /* מצב פרטי */ }
}

export async function lanesPanel(byId) {
  const r = await get('/assets/data/lanes.json');
  if (!r.ok) return '';
  const cfg = r.body;
  const idx = byId.get(cfg.index) || {};
  const daily = byId.get(cfg.dailyIndex) || {};
  const quotes = loadQuotes();

  const q = idx.chg?.d90, y = idx.chg?.d365;
  const scale = (base, chg) => (base == null || chg == null) ? null : base / (1 + chg / 100);

  const rows = cfg.lanes.flatMap(lane => cfg.sizes.map(size => {
    const key = `${lane.id}.${size.key}`;
    const base = Number(quotes[key]?.price);
    const has = Number.isFinite(base) && base > 0;
    return `<tr>
      <td>${esc(lane.from)}<span class="sub">${esc(lane.ports)}</span></td>
      <td>${esc(size.he)}</td>
      <td class="num">${lane.days[0]}–${lane.days[1]}<span class="sub">ימים · ${esc(lane.via)}</span></td>
      <td class="num">${has ? `$${nf(base, 0)}<span class="sub">הצעה מ-${esc(quotes[key].date || '')}</span>` : '<span class="sub">לא הוזנה הצעה</span>'}</td>
      <td class="num">${has ? `$${nf(scale(base, q), 0)}<em class="proxy">אומדן</em>` : '—'}</td>
      <td class="num">${has ? `$${nf(scale(base, y), 0)}<em class="proxy">אומדן</em>` : '—'}</td>
      <td class="num ${dirClass(q)}">${pc(q)}</td>
      <td class="num ${dirClass(y)}">${pc(y)}</td>
      <td><div class="inline-form">
        <input class="inp" type="number" step="any" data-lane="${esc(key)}" value="${has ? base : ''}" placeholder="$" style="width:92px">
        <button class="btn sm" data-lane-save="${esc(key)}">שמור</button>
      </div></td>
    </tr>`;
  })).join('');

  return `
  <div class="panel">
    <div class="ph"><h2>נתיבי הובלה לנמל חיפה</h2>
      <p>זמן מעבר, מחיר נוכחי ואומדן לרבעון ולשנה שעברה</p>
      <span class="right"><button class="btn sm" data-lane-clear>נקה הצעות</button></span>
    </div>
    <div class="banner">
      <div><b>מה כאן חי ומה לא.</b> אחוזי השינוי לרבעון ולשנה מגיעים ממדד ההובלה הימית הרשמי של ה-BLS
      ומתעדכנים מעצמם. <b>מחיר מכולה בנתיב ספציפי לחיפה אינו קיים בשום מקור חינמי</b> — המשלחים
      מתמחרים פרטנית. לכן מזינים הצעת מחיר אמיתית אחת לנתיב, והמערכת מציגה לפיה אומדן היסטורי
      מוצמד למדד, מסומן <b>אומדן</b>. זמני המעבר הם טווחי שייט טיפוסיים לתכנון, לא התחייבות של מוביל.</div>
    </div>
    <div class="tblwrap"><table>
      <thead><tr>
        <th>מוצא</th><th>מכולה</th><th class="num">זמן מעבר</th><th class="num">מחיר נוכחי</th>
        <th class="num">רבעון קודם</th><th class="num">שנה שעברה</th>
        <th class="num">שינוי רבעון</th><th class="num">שינוי שנה</th><th>הצעת מחיר</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="statusbar">
      <span class="live-dot"></span>
      <b>סטטוס שוק ההובלה</b>
      ${statusText(idx, daily)}
    </div>
  </div>`;
}

function statusText(idx, daily) {
  const q = idx.chg?.d90, y = idx.chg?.d365, d = daily.chg?.d7;
  if (q == null && d == null) return '<span>אין עדיין נתוני מדד. לחץ רענון.</span>';
  const tone = q == null ? '' : q > 4 ? 'שוק מתהדק' : q < -4 ? 'שוק מתרופף' : 'שוק יציב';
  return `<span>${esc(tone)} · מדד ההובלה הימית ${pc(q)} ברבעון, ${pc(y)} בשנה` +
    (d == null ? '' : ` · מדד יומי ${pc(d)} בשבוע`) +
    ` · ${esc(idx.lastDate || '')}</span>`;
}

export function wireLanes(root, rerender) {
  root.querySelectorAll('[data-lane-save]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.laneSave;
      const input = root.querySelector(`[data-lane="${CSS.escape(key)}"]`);
      const v = Number(input?.value);
      const quotes = loadQuotes();
      if (!Number.isFinite(v) || v <= 0) delete quotes[key];
      else quotes[key] = { price: v, date: new Date().toISOString().slice(0, 10) };
      saveQuotes(quotes);
      rerender();
    };
  });
  const clr = root.querySelector('[data-lane-clear]');
  if (clr) clr.onclick = () => { saveQuotes({}); rerender(); };
}
