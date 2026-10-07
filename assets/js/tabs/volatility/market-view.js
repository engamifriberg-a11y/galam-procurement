// תצוגת קבוצת סדרות: כרטיסים + טבלת תנודתיות + הזנת ערך לאינדקס מנוהל.
// משמשת את תתי-הלשוניות נייר, אנרגיה ופלסטיק, מטבעות והובלה ימית.
import { esc, nf, pc, dirClass, sparkline, send, clearCache } from '../../core/app.js';

export function groupView(market, groups, { title, lead, note } = {}) {
  const list = (market.series || []).filter(s => groups.includes(s.group));
  if (!list.length) return `<div class="panel"><div class="pb"><div class="empty"><b>אין סדרות בקבוצה</b></div></div></div>`;

  const live = list.filter(s => s.tier === 'A');
  const managed = list.filter(s => s.tier !== 'A');

  return `
  ${lead ? `<div class="banner">${lead}</div>` : ''}
  <div class="panel">
    <div class="ph"><h2>${esc(title)}</h2><p>${live.length} סדרות חיות · ${managed.length} אינדקסים מנוהלים</p></div>
    <div class="cards">${list.map(cardHtml).join('')}</div>
  </div>

  <div class="panel">
    <div class="ph"><h2>תנודתיות ושינויים</h2><p>שינוי באחוזים לפי חלון זמן, ותנודתיות שנתית מתוך 90 הימים האחרונים</p></div>
    <div class="tblwrap"><table>
      <thead><tr>
        <th>סדרה</th><th>מקור</th><th class="num">ערך אחרון</th><th class="num">יום</th><th class="num">שבוע</th>
        <th class="num">חודש</th><th class="num">רבעון</th><th class="num">שנה</th><th class="num">תנודתיות</th><th class="num">נק׳</th>
      </tr></thead>
      <tbody>${list.map(rowHtml).join('')}</tbody>
    </table></div>
  </div>

  ${managed.length ? `
  <div class="panel">
    <div class="ph"><h2>הזנת אינדקס מנוהל</h2><p>לסדרות שאין להן מקור חינמי. הערך נשמר עם תאריך ונכנס מיד לחישוב התנודתיות וההמלצות</p></div>
    <div class="pb"><div class="tblwrap"><table>
      <thead><tr><th>סדרה</th><th>יחידה</th><th class="num">ערך נוכחי</th><th>ערך חדש</th><th>תאריך</th><th>מקור</th><th></th></tr></thead>
      <tbody>${managed.map(inputRow).join('')}</tbody>
    </table></div>
    <p class="note">${esc(note || 'מומלץ לעדכן אינדקס מנוהל אחת לשבוע או עם קבלת הדוח התקופתי מהספק או מבית התוכן.')}</p></div>
  </div>` : ''}`;
}

function tierDot(t) { return `<i class="tier ${t.toLowerCase()}" title="${t === 'A' ? 'מקור שוק ישיר' : t === 'B' ? 'אינדקס מנוהל' : 'הערכת AI'}"></i>`; }

function cardHtml(s) {
  const d90 = s.chg?.d90;
  return `<div class="card">
    <span class="nm">${tierDot(s.tier)}${esc(s.he)}</span>
    <span class="val">${s.last == null ? '—' : nf(s.last, s.dp)}<small>${esc(s.unit)}</small></span>
    ${sparkline(s.hist, d90)}
    <span class="row">
      <b class="${dirClass(s.chg?.d30)}">חודש ${pc(s.chg?.d30)}</b>
      <b class="${dirClass(d90)}">רבעון ${pc(d90)}</b>
      ${s.lastDate ? `<span>${esc(s.lastDate)}</span>` : `<span>אין נתון</span>`}
    </span>
  </div>`;
}

function rowHtml(s) {
  const cell = v => `<td class="num ${dirClass(v)}">${pc(v)}</td>`;
  return `<tr>
    <td>${tierDot(s.tier)} ${esc(s.he)}<span class="sub">${esc(s.id)}${s.note ? ' · ' + esc(s.note) : ''}</span></td>
    <td>${s.source ? esc(s.source) : '<span class="sub">לא מחובר</span>'}</td>
    <td class="num">${s.last == null ? '—' : nf(s.last, s.dp)} <span class="sub">${esc(s.unit)}</span></td>
    ${cell(s.chg?.d1)}${cell(s.chg?.d7)}${cell(s.chg?.d30)}${cell(s.chg?.d90)}${cell(s.chg?.d365)}
    <td class="num">${s.vol90 == null ? '—' : s.vol90.toFixed(1) + '%'}</td>
    <td class="num">${s.points || 0}</td>
  </tr>`;
}

function inputRow(s) {
  const today = new Date().toISOString().slice(0, 10);
  return `<tr data-sid="${esc(s.id)}">
    <td>${esc(s.he)}<span class="sub">${esc(s.id)}</span></td>
    <td class="sub">${esc(s.unit)}</td>
    <td class="num">${s.last == null ? '—' : nf(s.last, s.dp)}</td>
    <td><input class="inp" type="number" step="any" data-f="value" placeholder="0"></td>
    <td><input class="inp" type="date" data-f="date" value="${today}" style="width:142px"></td>
    <td><input class="inp" type="text" data-f="source" placeholder="ICIS / ספק / דוח" style="width:140px;text-align:start"></td>
    <td><button class="btn sm" data-save>שמור</button></td>
  </tr>`;
}

export function wireInputs(root, onSaved) {
  root.querySelectorAll('[data-save]').forEach(btn => {
    btn.onclick = async () => {
      const tr = btn.closest('tr');
      const f = k => tr.querySelector(`[data-f="${k}"]`).value;
      const value = Number(f('value'));
      if (!Number.isFinite(value) || !f('value')) { tr.querySelector('[data-f="value"]').focus(); return; }
      btn.disabled = true; btn.textContent = '…';
      const r = await send(`/api/market?series=${encodeURIComponent(tr.dataset.sid)}`, 'PUT',
        { value, date: f('date'), source: f('source') || 'הזנה ידנית' });
      btn.disabled = false;
      btn.textContent = r.ok ? 'נשמר' : 'שגיאה';
      if (r.ok) { clearCache(); setTimeout(() => onSaved?.(), 400); }
    };
  });
}
