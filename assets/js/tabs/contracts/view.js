// תצוגת מעקב החוזים: מדדים, לוח התראות, סינון וטבלה.
import { esc } from '../../core/base.js';
import { alertItems, badDate, endKind, insKind, isOff, money, status, days, fmtD, fmtN, rel, FILTERS, passes } from './model.js';

export function kpisHtml(list) {
  let soon = 0, exp = 0, miss = 0, total = 0;
  for (const r of list) {
    if (isOff(r)) continue;
    const st = status(r), mo = money(r);
    if (!r.handled) { if (st.k === 'soon') soon++; if (st.k === 'expired') exp++; }
    if (mo.missing) miss++;
    if (mo.est !== null) total += mo.est;
  }
  const today = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="panel">
    <div class="ph"><h2>חוזי אחזקה</h2><p>נכון ל-${esc(today)} · התראה לכל מה שמסתיים בתוך 30 יום</p>
      <span class="right">
        <button class="btn sm" data-add>הוספת הסכם</button>
        <button class="btn sm" data-csv>ייצוא CSV</button>
      </span></div>
    <div class="cards">
      <div class="card"><span class="nm">מסתיים תוך 30 יום</span><span class="val ${soon ? 'up' : ''}">${soon}</span><span class="row dim">דורש טיפול</span></div>
      <div class="card"><span class="nm">כבר פג</span><span class="val ${exp ? 'up' : ''}">${exp}</span><span class="row dim">ממתין להחלטה</span></div>
      <div class="card"><span class="nm">חסר סכום</span><span class="val">${miss}</span><span class="row dim">לא ניתן לתמחר</span></div>
      <div class="card"><span class="nm">עלות שנתית ידועה</span><span class="val">${fmtN(total)}<small>₪</small></span><span class="row dim">מתוך ${list.length} חוזים</span></div>
    </div>
  </div>`;
}

export function boardHtml(list, C) {
  const a = alertItems(list);
  let h = '';
  if (a.soon.length) {
    h += `<div class="panel board hot"><div class="ph"><h2>דורש טיפול בחודש הקרוב</h2>
      <p>${a.soon.length} פריטים שמועד הסיום שלהם בתוך 30 יום</p></div>
      <div class="alist">${a.soon.map(aRow).join('')}</div></div>`;
  } else {
    h += `<div class="panel board calm"><div class="ph"><h2>אין סיומים ב-30 הימים הקרובים</h2>
      <p>כל התאריכים הידועים רחוקים מעבר לחודש</p></div></div>`;
  }
  if (a.past.length) {
    const shown = C.showPast ? a.past : a.past.slice(0, 3);
    h += `<div class="panel board hot"><div class="ph"><h2>פג תוקף וממתין להחלטה</h2>
      <p>${a.past.length} פריטים שהתאריך שלהם כבר עבר</p></div>
      <div class="alist">${shown.map(aRow).join('')}</div>
      ${a.past.length > 3 ? `<button class="more" data-togglepast>${C.showPast ? 'הצג פחות' : `הצג את כל ${a.past.length} הפריטים`}</button>` : ''}</div>`;
  }
  const bad = list.filter(r => badDate(r) && !isOff(r));
  if (bad.length) {
    h += `<div class="banner warn"><div>תאריכים שלא ניתן לפענח ב-<b>${bad.length}</b> רשומות, למשל 31/06/2026 או תאריך משנת 1905.
      <button class="linkish" data-filter="bad">הצג אותן לתיקון</button></div></div>`;
  }
  return h;
}

const aRow = x => `<div class="aitem" data-open="${esc(x.r.id)}" role="button" tabindex="0">
  <span class="cd">${x.d < 0 ? '—' : x.d}<small>${x.d < 0 ? 'פג' : 'ימים'}</small></span>
  <span><b>${esc(x.r.supplier || 'ללא שם')}</b><span class="sub">${esc(x.kind)} · ${esc(x.r.service || 'ללא פירוט')}</span></span>
  <span class="when">${fmtD(x.date)} · ${rel(x.d)}</span></div>`;

export function filtersHtml(list, C) {
  return `<div class="panel"><div class="bar" style="border-top:0">
    <div class="search plain" style="flex:1 1 240px">
      <input id="cq" type="search" value="${esc(C.q)}" placeholder="חיפוש ספק, שירות, איש קשר או הערה" autocomplete="off">
    </div>
    <select class="inp" id="csort" style="width:auto;text-align:start">
      <option value="urgency" ${C.sort === 'urgency' ? 'selected' : ''}>לפי דחיפות</option>
      <option value="end" ${C.sort === 'end' ? 'selected' : ''}>לפי תאריך סיום</option>
      <option value="cost" ${C.sort === 'cost' ? 'selected' : ''}>לפי עלות שנתית</option>
      <option value="supplier" ${C.sort === 'supplier' ? 'selected' : ''}>לפי שם ספק</option>
    </select>
    <div class="chips">${FILTERS.map(f => {
      const n = list.filter(r => passes(r, f.k)).length;
      if ((f.k === 'bad' || f.k === 'off') && !n) return '';
      return `<button class="chip ${f.c || ''}" data-filter="${f.k}" aria-pressed="${C.filter === f.k}">${esc(f.t)} <span class="n">${n}</span></button>`;
    }).join('')}</div>
  </div></div>`;
}

export function sheetHtml(shown, total) {
  if (!shown.length) return `<div class="panel"><div class="pb"><div class="empty"><b>אין רשומות שמתאימות לסינון</b>נקה את החיפוש או בחר מסנן אחר.</div></div></div>`;
  return `<div class="panel">
    <div class="tblwrap"><table>
      <thead><tr><th>סטטוס</th><th>ספק</th><th>שירות / מוצר</th><th>סיום חוזה</th><th>אישור ביטוח</th>
        <th class="num">חודשי</th><th class="num">שנתי</th></tr></thead>
      <tbody>${shown.map(rowHtml).join('')}</tbody>
    </table></div>
    <div class="pb"><p class="note" style="margin:0">מוצגות ${shown.length} מתוך ${total} רשומות.
      לחיצה על שורה פותחת עריכה מלאה, לחיצה על סכום מאפשרת מילוי מהיר.</p></div>
  </div>`;
}

function rowHtml(r) {
  const st = status(r), mo = money(r), off = isOff(r);
  return `<tr class="click crow s-${st.k}${r.handled ? ' handled' : ''}${off ? ' cancelled' : ''}" data-open="${esc(r.id)}" tabindex="0">
    <td><button class="state ${off ? 'off' : 'on'}" data-state="${esc(r.id)}" aria-pressed="${!off}"
      title="לחיצה משנה בין פעיל למבוטל"><span class="sdot"></span>${off ? 'בוטל' : 'פעיל'}</button></td>
    <td><span class="nm">${esc(r.supplier || 'ללא שם')}</span>${r.handled ? ' <span class="pill off">טופל</span>' : ''}
      ${r.contact ? `<span class="sub">${esc(r.contact)}</span>` : ''}</td>
    <td>${esc(r.service || '—')}${r.nda ? `<span class="sub">NDA: ${esc(r.nda)}</span>` : ''}</td>
    <td>${endCell(r)}</td>
    <td>${insCell(r)}</td>
    <td class="num">${moneyCell(r, 'monthly')}</td>
    <td class="num">${moneyCell(r, 'annual')}${mo.a === null && mo.m !== null ? `<span class="sub">≈ ${fmtN(mo.m * 12)} מחושב</span>` : ''}</td>
  </tr>`;
}

function endCell(r) {
  const k = endKind(r), d = days(r.end);
  if (k === 'date') return `<b class="${d !== null && d <= 30 ? 'up' : ''}">${fmtD(r.end)}</b><span class="sub">${rel(d)}</span>`;
  if (k === 'renew') return '<span class="pill wait">מתחדש אוטומטית</span>';
  if (k === 'text') return `<span class="pill off">${esc(r.endText)}</span>`;
  return '<span class="pill medium">חסר תאריך</span>';
}
function insCell(r) {
  const k = insKind(r), d = days(r.ins);
  if (k === 'date') return `<b class="${d !== null && d <= 30 ? 'up' : ''}">${fmtD(r.ins)}</b><span class="sub">${rel(d)}</span>`;
  if (k === 'na') return '<span class="pill off">לא נדרש</span>';
  if (k === 'off') return '<span class="pill off">ספק לא פעיל</span>';
  if (k === 'text') return `<span class="pill medium">${esc(r.insText)}</span>`;
  return '<span class="pill medium">חסר</span>';
}
function moneyCell(r, field) {
  const v = r[field], txt = r[field + 'Text'];
  if (typeof v === 'number') return `<span class="money" data-money="${field}" data-id="${esc(r.id)}" tabindex="0" role="button">${fmtN(v)} <small>₪</small></span>`;
  return `<span class="fill" data-money="${field}" data-id="${esc(r.id)}" tabindex="0" role="button">${txt ? 'עדכן סכום' : 'מלא סכום'}</span>${txt ? `<span class="sub">${esc(txt)}</span>` : ''}`;
}
