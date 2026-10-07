// העלאת קובץ אקסל, מנותח בדפדפן.
//
// הניתוח נעשה כאן ולא בשרת: אין צורך בתלות נוספת בצד השרת, הקובץ לא עובר
// פעמיים ברשת, והמשתמש רואה מיד כמה שורות זוהו לפני שמשהו נשמר.
import { esc, cssEsc, send, clearCache } from './base.js';

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let loading = null;

function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  loading ||= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = CDN;
    el.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('הספרייה נטענה אך אינה זמינה'));
    el.onerror = () => reject(new Error('טעינת מנוע קריאת האקסל נכשלה'));
    document.head.appendChild(el);
  });
  return loading;
}

export function uploadPanel({ id, title, hint, columns }) {
  return `<div class="panel" data-upload="${esc(id)}">
    <div class="ph"><h2>${esc(title)}</h2><p>${esc(hint)}</p></div>
    <div class="pb">
      <div class="dropzone" data-drop>
        <input type="file" accept=".xlsx,.xls,.csv" data-file hidden>
        <b>גרור לכאן קובץ אקסל</b>
        <span>או <button class="btn sm" data-pick>בחר קובץ</button></span>
        <span class="sub">${esc(columns)}</span>
      </div>
      <div class="note" data-msg></div>
      <div data-preview></div>
    </div>
  </div>`;
}

/* mapRow מקבל אובייקט שורה לפי כותרות העמודות ומחזיר את הרשומה, או null לדילוג */
export function wireUpload(root, { id, endpoint, mapRow, onDone }) {
  const panel = root.querySelector(`[data-upload="${cssEsc(id)}"]`);
  if (!panel) return;
  const input = panel.querySelector('[data-file]');
  const zone = panel.querySelector('[data-drop]');
  const msg = panel.querySelector('[data-msg]');
  const prev = panel.querySelector('[data-preview]');
  const pick = panel.querySelector('[data-pick]');

  const say = (t, bad) => { msg.innerHTML = t; msg.style.color = bad ? 'var(--up)' : 'var(--ink3)'; };

  async function handle(file) {
    if (!file) return;
    say('<span class="spin"></span> קורא את הקובץ…');
    prev.innerHTML = '';
    let rows;
    try {
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    } catch (e) {
      say(`קריאת הקובץ נכשלה: ${esc(e.message)}`, true);
      return;
    }
    if (!rows.length) { say('הגיליון הראשון ריק.', true); return; }

    const mapped = rows.map(mapRow).filter(Boolean);
    if (!mapped.length) {
      say(`זוהו ${rows.length} שורות אך אף אחת לא התאימה למבנה הצפוי. בדוק ששמות העמודות תואמים.`, true);
      prev.innerHTML = `<p class="note">העמודות שנמצאו בקובץ: ${esc(Object.keys(rows[0]).join(' · '))}</p>`;
      return;
    }

    say(`זוהו <b>${mapped.length}</b> שורות תקינות מתוך ${rows.length}. בדוק את הדגימה ואשר.`);
    prev.innerHTML = `
      <div class="tblwrap" style="margin:10px 0">
        <table><thead><tr>${Object.keys(mapped[0]).slice(0, 8).map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead>
        <tbody>${mapped.slice(0, 3).map(r => `<tr>${Object.keys(mapped[0]).slice(0, 8).map(k => `<td>${esc(String(r[k] ?? '').slice(0, 28))}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>
      <button class="btn primary" data-commit>שמור ${mapped.length} שורות למאגר</button>`;

    panel.querySelector('[data-commit]').onclick = async () => {
      const btn = panel.querySelector('[data-commit]');
      btn.disabled = true; btn.textContent = 'שומר…';
      const r = await send(endpoint, 'PUT', { version: new Date().toISOString().slice(0, 10), rows: mapped });
      btn.disabled = false;
      if (!r.ok) { say(`השמירה נכשלה: ${esc(r.body?.error || r.body?.message || 'שגיאה')}`, true); btn.textContent = 'נסה שוב'; return; }
      say(`נשמרו ${r.body.rows ?? mapped.length} שורות. המאגר עודכן.`);
      prev.innerHTML = '';
      clearCache();
      onDone?.();
    };
  }

  if (pick) pick.onclick = () => input.click();
  input.onchange = () => handle(input.files[0]);
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', e => handle(e.dataTransfer?.files?.[0]));
}

/* קורא ערך לפי כמה שמות עמודה אפשריים, כי כותרות משתנות בין ייצואים */
export function pick(row, ...names) {
  for (const n of names) {
    for (const k of Object.keys(row)) {
      if (k.trim() === n) {
        const v = String(row[k] ?? '').trim();
        if (v) return v;
      }
    }
  }
  return '';
}
export const pickNum = (row, ...names) => {
  const v = pick(row, ...names).replace(/[, ]/g, '');
  const f = Number(v);
  return Number.isFinite(f) && v !== '' ? f : null;
};
