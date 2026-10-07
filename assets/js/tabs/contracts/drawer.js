// מגירת עריכת חוזה. כל שדה תאריך יכול להיות תאריך אמיתי, הערה חופשית
// או מצב מוגדר כמו "מתחדש" — כי כך הנתונים נראים בפועל בקובץ המקור.
import { esc } from '../../core/base.js';
import { endKind, insKind, isOff, money, fmtN } from './model.js';

const endMode = r => { const k = endKind(r); return k === 'date' ? 'date' : k === 'renew' ? 'renew' : k === 'text' ? 'text' : 'none'; };
const insMode = r => { const k = insKind(r); return ['date', 'na', 'off', 'text'].includes(k) ? k : 'none'; };

export function drawerHtml(r) {
  const mo = money(r), em = endMode(r), im = insMode(r);
  return `
  <div class="dh"><div>
      <h3>${esc(r.supplier || 'הסכם חדש')}</h3>
      <span class="sub">${esc(r.service || 'ללא פירוט שירות')}</span>
    </div><button class="x" data-close aria-label="סגירה">×</button></div>
  <div class="db">
    <div class="fgroup"><label for="fState">סטטוס ההסכם</label>
      <select id="fState" class="inp">
        <option value="on" ${isOff(r) ? '' : 'selected'}>פעיל</option>
        <option value="off" ${isOff(r) ? 'selected' : ''}>בוטל</option>
      </select></div>

    <label class="chkline"><input type="checkbox" id="fHandled" ${r.handled ? 'checked' : ''}>
      טופל — אל תציג בהתראות</label>

    <div class="two">
      <div class="fgroup"><label for="fSup">ספק</label><input id="fSup" class="inp" type="text" value="${esc(r.supplier || '')}"></div>
      <div class="fgroup"><label for="fSvc">שירות / מוצר</label><input id="fSvc" class="inp" type="text" value="${esc(r.service || '')}"></div>
    </div>

    <div class="two">
      <div class="fgroup"><label for="fMon">עלות חודשית (₪)</label>
        <input id="fMon" class="inp ${mo.missing ? 'need' : ''}" type="number" min="0" step="1" value="${mo.m ?? ''}">
        ${r.monthlyText ? `<div class="hint">בקובץ רשום: ${esc(r.monthlyText)}</div>` : ''}</div>
      <div class="fgroup"><label for="fAnn">עלות שנתית (₪)</label>
        <input id="fAnn" class="inp ${mo.missing ? 'need' : ''}" type="number" min="0" step="1" value="${mo.a ?? ''}">
        ${r.annualText ? `<div class="hint">בקובץ רשום: ${esc(r.annualText)}</div>`
          : (mo.a === null && mo.m !== null ? `<div class="hint">לפי החודשי: ${fmtN(mo.m * 12)} ₪</div>` : '')}</div>
    </div>

    <div class="fgroup"><label for="fEndMode">סיום חוזה</label>
      <select id="fEndMode" class="inp" data-mode="end">
        <option value="date" ${em === 'date' ? 'selected' : ''}>תאריך מוגדר</option>
        <option value="renew" ${em === 'renew' ? 'selected' : ''}>מתחדש אוטומטית</option>
        <option value="text" ${em === 'text' ? 'selected' : ''}>הערה חופשית</option>
        <option value="none" ${em === 'none' ? 'selected' : ''}>לא ידוע</option>
      </select>
      <div style="margin-top:8px">
        <input id="fEnd" class="inp" type="date" value="${esc(r.end || '')}" data-for="end" data-when="date" ${em === 'date' ? '' : 'hidden'}>
        <input id="fEndTxt" class="inp" type="text" placeholder="למשל: ניתן לסיום מיידית"
          value="${esc(em === 'text' ? (r.endText || '') : '')}" data-for="end" data-when="text" ${em === 'text' ? '' : 'hidden'}>
      </div>
      ${r.endFlag === 'bad' ? `<div class="hint">בקובץ היה תאריך לא תקין: ${esc(r.endText || '')}</div>` : ''}
    </div>

    <div class="fgroup"><label for="fInsMode">אישור ביטוח בתוקף עד</label>
      <select id="fInsMode" class="inp" data-mode="ins">
        <option value="date" ${im === 'date' ? 'selected' : ''}>תאריך מוגדר</option>
        <option value="na" ${im === 'na' ? 'selected' : ''}>לא נדרש</option>
        <option value="off" ${im === 'off' ? 'selected' : ''}>ספק לא פעיל</option>
        <option value="text" ${im === 'text' ? 'selected' : ''}>הערה חופשית</option>
        <option value="none" ${im === 'none' ? 'selected' : ''}>לא ידוע</option>
      </select>
      <div style="margin-top:8px">
        <input id="fIns" class="inp" type="date" value="${esc(r.ins || '')}" data-for="ins" data-when="date" ${im === 'date' ? '' : 'hidden'}>
        <input id="fInsTxt" class="inp" type="text" value="${esc(im === 'text' ? (r.insText || '') : '')}"
          data-for="ins" data-when="text" ${im === 'text' ? '' : 'hidden'}>
      </div>
      ${r.insFlag === 'bad' ? `<div class="hint">בקובץ היה תאריך לא תקין: ${esc(r.insText || '')}</div>` : ''}
    </div>

    <div class="two">
      <div class="fgroup"><label for="fStart">תחילת ההתקשרות</label>
        <input id="fStart" class="inp" type="date" value="${esc(r.start || '')}">
        ${r.startFlag === 'bad' ? `<div class="hint">בקובץ: ${esc(r.startText || '')}</div>` : ''}</div>
      <div class="fgroup"><label for="fNda">NDA</label><input id="fNda" class="inp" type="text" value="${esc(r.nda || '')}"></div>
    </div>

    <div class="two">
      <div class="fgroup"><label for="fContact">איש קשר</label><input id="fContact" class="inp" type="text" value="${esc(r.contact || '')}"></div>
      <div class="fgroup"><label for="fEmail">אימייל</label><input id="fEmail" class="inp" type="text" value="${esc(r.email || '')}"></div>
    </div>

    <div class="fgroup"><label for="fNotes">הערות</label>
      <textarea id="fNotes" class="inp">${esc(r.notes || '')}</textarea></div>
  </div>
  <div class="dfoot">
    <button class="btn primary" data-save>שמירה</button>
    <button class="btn" data-close>ביטול</button>
    <button class="btn danger" data-del>הסרה</button>
  </div>`;
}

export function readDrawer(d, r) {
  const v = sel => (d.querySelector(sel)?.value || '').trim();
  const num = sel => { const x = v(sel); return x === '' ? null : Number(x); };
  const p = {
    supplier: v('#fSup'), service: v('#fSvc'),
    monthly: num('#fMon'), annual: num('#fAnn'),
    contact: v('#fContact') || null, email: v('#fEmail') || null,
    notes: v('#fNotes') || null, nda: v('#fNda') || null,
    active: v('#fState') !== 'off',
    handled: d.querySelector('#fHandled')?.checked || false,
    start: v('#fStart') || null
  };
  if (p.monthly !== null) p.monthlyText = null;
  if (p.annual !== null) p.annualText = null;
  if (p.start) { p.startText = null; p.startFlag = null; }

  const em = v('#fEndMode');
  if (em === 'date') { p.end = v('#fEnd') || null; p.endText = null; p.endFlag = null; }
  else if (em === 'renew') { p.end = null; p.endText = 'מתחדש'; p.endFlag = null; }
  else if (em === 'text') { p.end = null; p.endText = v('#fEndTxt') || null; p.endFlag = null; }
  else { p.end = null; p.endText = null; p.endFlag = null; }

  const im = v('#fInsMode');
  if (im === 'date') { p.ins = v('#fIns') || null; p.insText = null; p.insFlag = null; }
  else if (im === 'na') { p.ins = null; p.insText = 'אין צורך'; p.insFlag = null; }
  else if (im === 'off') { p.ins = null; p.insText = 'לא עובד איתנו יותר'; p.insFlag = null; }
  else if (im === 'text') { p.ins = null; p.insText = v('#fInsTxt') || null; p.insFlag = null; }
  else { p.ins = null; p.insText = null; p.insFlag = null; }

  if (r?.isNew) p.isNew = true;
  return p;
}
