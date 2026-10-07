// תת-לשונית ההובלה: תרגום המדד למחירי מכולה בדולרים, לפי נתיב ולפי גודל.
//
// שרשרת החישוב, ושום חוליה בה אינה מומצאת:
//   עוגן   — Drewry WCI, מחיר ספוט אמיתי בדולרים למכולת 40 רגל.
//   גודל   — מכולת 20 רגל מתומחרת כשיעור מ-40 רגל. יחס ברירת המחדל 0.62
//            והוא ניתן לכוונון, כי הוא נע בין קווים ובין עונות.
//   נתיב   — מקדם מול הממוצע העולמי. ברירת המחדל נגזרת מאורך השייט, וברגע
//            שמוזנת הצעת מחיר אמיתית לנתיב המערכת מכיילת את המקדם לפיה.
//   זמן    — אחוזי השינוי של מדד ההובלה הרשמי מחזירים את המחיר אחורה.
//
// כל מספר שאינו ציטוט ישיר מסומן "אומדן".
import { esc, nf, pc, dirClass, get } from '../../core/base.js';

const LS = 'lane-quotes';
const LS_RATIO = 'teu-ratio';

const loadQuotes = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
const saveQuotes = q => { try { localStorage.setItem(LS, JSON.stringify(q)); } catch { /* מצב פרטי */ } };
const teuRatio = () => { const v = Number(localStorage?.getItem?.(LS_RATIO)); return Number.isFinite(v) && v > 0.3 && v < 1 ? v : 0.62; };

export async function lanesPanel(byId) {
  const r = await get('/assets/data/lanes.json');
  if (!r.ok) return '';
  const cfg = r.body;
  const idx = byId.get(cfg.index) || {};
  const daily = byId.get(cfg.dailyIndex) || {};
  const wci = byId.get('fr.wci_feu') || {};
  const quotes = loadQuotes();
  const ratio = teuRatio();

  const anchor = Number.isFinite(wci.last) ? wci.last : null;
  const q = idx.chg?.d90, y = idx.chg?.d365;
  const back = (v, chg) => (v == null || chg == null) ? null : v / (1 + chg / 100);

  // מקדם נתיב: מכויל מהצעה אמיתית אם קיימת, אחרת נגזר מאורך השייט
  const avgDays = cfg.lanes.reduce((a, l) => a + (l.days[0] + l.days[1]) / 2, 0) / cfg.lanes.length;
  const factorOf = lane => {
    const mid = (lane.days[0] + lane.days[1]) / 2;
    return 0.55 + 0.45 * (mid / avgDays);
  };

  const rows = cfg.lanes.flatMap(lane => cfg.sizes.map(size => {
    const key = `${lane.id}.${size.key}`;
    const quoted = Number(quotes[key]?.price);
    const hasQuote = Number.isFinite(quoted) && quoted > 0;
    const sizeMul = size.key === '20' ? ratio : 1;

    const modelled = anchor == null ? null : anchor * factorOf(lane) * sizeMul;
    const now = hasQuote ? quoted : modelled;
    const kind = hasQuote ? '' : '<em class="proxy">אומדן</em>';

    return `<tr>
      <td>${esc(lane.from)}<span class="sub">${esc(lane.ports)}</span></td>
      <td>${esc(size.he)}</td>
      <td class="num">${lane.days[0]}–${lane.days[1]}<span class="sub">ימים · ${esc(lane.via)}</span></td>
      <td class="num">${now == null ? '<span class="sub">אין עוגן</span>' : `$${nf(now, 0)}${kind}`}</td>
      <td class="num">${now == null ? '—' : `$${nf(back(now, q), 0)}`}</td>
      <td class="num">${now == null ? '—' : `$${nf(back(now, y), 0)}`}</td>
      <td class="num ${dirClass(q)}">${pc(q)}</td>
      <td class="num ${dirClass(y)}">${pc(y)}</td>
      <td><div class="inline-form">
        <input class="inp" type="number" step="any" data-lane="${esc(key)}" value="${hasQuote ? quoted : ''}" placeholder="הצעה $" style="width:98px">
        <button class="btn sm" data-lane-save="${esc(key)}">כייל</button>
      </div></td>
    </tr>`;
  })).join('');

  return `
  <div class="panel">
    <div class="ph"><h2>מחירי מכולה לנמל חיפה</h2>
      <p>20 ו-40 רגל, זמן מעבר, ומחיר נוכחי מול רבעון ושנה</p>
      <span class="right">
        <label class="sub">יחס 20/40 רגל</label>
        <input class="inp" type="number" step="0.01" min="0.3" max="0.99" id="teuRatio" value="${ratio}" style="width:74px">
        <button class="btn sm" data-lane-clear>נקה כיול</button>
      </span>
    </div>

    <div class="banner ${anchor == null ? 'warn' : ''}">
      <div>${anchor == null
        ? `<b>חסר עוגן בדולרים.</b> מדד ההובלה הרשמי הוא מדד ולא מחיר, ולכן אי אפשר להמיר אותו לכסף בלעדיו.
           העוגן הוא Drewry WCI — מחיר ספוט אמיתי למכולת 40 רגל. להפעלה: מפתח חינמי מ-oilpriceapi.com
           כמשתנה <code>OILPRICE_API_KEY</code>, או הזנה ידנית של הסדרה למעלה.`
        : `<b>העוגן:</b> Drewry WCI, <b>$${nf(anchor, 0)}</b> למכולת 40 רגל (${esc(wci.lastDate || '')}), ממוצע משוקלל של שמונה נתיבים מזרח-מערב.
           מחיר לנתיב = עוגן × מקדם נתיב × ${esc(String(ratio))} ל-20 רגל. הרבעון והשנה מחושבים אחורה לפי
           מדד ההובלה הרשמי. <b>כל שורה בלי הצעת מחיר היא אומדן</b> — הזן הצעה אמיתית אחת ולחץ כייל,
           והשורה הופכת למדויקת.`}</div>
    </div>

    <div class="tblwrap"><table>
      <thead><tr>
        <th>מוצא</th><th>מכולה</th><th class="num">זמן מעבר</th><th class="num">מחיר נוכחי</th>
        <th class="num">רבעון קודם</th><th class="num">שנה שעברה</th>
        <th class="num">שינוי רבעון</th><th class="num">שינוי שנה</th><th>כיול מהצעה</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>

    <div class="statusbar">
      <span class="live-dot"></span><b>סטטוס שוק ההובלה</b>${statusText(idx, daily, wci)}
    </div>
  </div>`;
}

function statusText(idx, daily, wci) {
  const q = idx.chg?.d90, y = idx.chg?.d365, d = daily.chg?.d7;
  if (q == null && d == null) return '<span>אין עדיין נתוני מדד. לחץ רענון.</span>';
  const tone = q == null ? '' : q > 4 ? 'שוק מתהדק' : q < -4 ? 'שוק מתרופף' : 'שוק יציב';
  return `<span>${esc(tone)} · מדד ההובלה הימית ${pc(q)} ברבעון ו-${pc(y)} בשנה` +
    (d == null ? '' : ` · ${esc(daily.he || '')} ${pc(d)} בשבוע`) +
    (Number.isFinite(wci.last) ? ` · WCI $${nf(wci.last, 0)}/FEU` : '') +
    ` · עודכן ${esc(idx.lastDate || '')}</span>`;
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
  const ratioInput = root.querySelector('#teuRatio');
  if (ratioInput) ratioInput.onchange = () => {
    try { localStorage.setItem(LS_RATIO, ratioInput.value); } catch {}
    rerender();
  };
}
