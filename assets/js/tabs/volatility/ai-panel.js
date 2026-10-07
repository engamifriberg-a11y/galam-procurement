// פאנל ה-AI המשותף לכל הלשוניות.
//
// עיקרון: המודל לא מביא נתונים ולא מחפש. הוא מקבל את המספרים שהשרת כבר חישב
// ומנסח מהם קריאה לקניין. לכן הפאנל תמיד מציין על כמה סדרות הוא נשען.
import { esc, get, clearCache } from '../../core/base.js';

export function aiPanelShell(title, hint) {
  return `<div class="panel" data-ai-panel>
    <div class="ph"><h2>${esc(title)}</h2><p>${esc(hint)}</p>
      <span class="right"><button class="btn sm" data-ai-run>הפק קריאה</button></span>
    </div>
    <div class="pb" data-ai-body><p class="note">המודל מנסח מתוך המספרים שבמסך בלבד, ולא מוסיף נתונים משלו.</p></div>
  </div>`;
}

export function wireAiPanel(root, url) {
  const panel = root.querySelector('[data-ai-panel]');
  if (!panel) return;
  const btn = panel.querySelector('[data-ai-run]');
  const body = panel.querySelector('[data-ai-body]');
  if (!btn || !body) return;

  const run = async (force) => {
    btn.disabled = true;
    body.innerHTML = `<p class="note"><span class="spin"></span> מנסח…</p>`;
    const r = await get(url + (force ? '&force=1' : ''), { fresh: force });
    btn.disabled = false;
    if (r.status === 503) {
      body.innerHTML = `<p class="note">לא הוגדר מפתח AI בפרויקט. שאר הלשונית עובדת כרגיל.</p>`;
      return;
    }
    if (!r.ok) {
      body.innerHTML = `<p class="note">הניסוח נכשל: ${esc(r.body?.message || r.body?.error || 'שגיאה')}</p>`;
      return;
    }
    const b = r.body;
    body.innerHTML = `
      <p style="margin:0 0 10px;line-height:1.75">${esc(b.text || '')}</p>
      <p class="note">
        ${b.empty ? '' : `נשען על ${b.basedOn} סדרות עם נתון${b.missing ? `, ${b.missing} סדרות עדיין ריקות` : ''}. `}
        ${b.cached ? 'מתוך ניסוח קודם. ' : ''}${esc(b.model || b.provider || '')}
        <button class="btn sm" data-ai-again style="margin-inline-start:8px">נסח מחדש</button>
      </p>`;
    const again = body.querySelector('[data-ai-again]');
    if (again) again.onclick = () => { clearCache(); run(true); };
  };

  btn.onclick = () => run(false);
}
