// לשונית הגדרות. גם הוכחה שהמבנה מודולרי: קובץ אחד ושורת import אחת.
import { registerTab, $, esc, get, send, clearCache, loading } from '../../core/base.js';

registerTab({
  id: 'settings',
  he: 'הגדרות',
  async render(view) {
    view.innerHTML = loading('טוען הגדרות');
    const r = await get('/api/settings', { fresh: true });
    if (!r.ok) {
      view.innerHTML = `<div class="panel"><div class="pb"><div class="empty"><b>ההגדרות לא נטענו</b>${esc(r.body?.error || '')}</div></div></div>`;
      return;
    }
    const s = r.body;
    const a = s.active;

    view.innerHTML = `
    <div class="panel">
      <div class="ph"><h2>מנוע ה-AI</h2><p>מי מנסח את הקריאות, הנימוקים וסריקת המשברים</p></div>
      <div class="pb">
        ${a ? `<p style="margin:0 0 10px">פעיל כעת: <b>${esc(a.provider)}</b> · ${esc(a.model || '')} ·
          מקור ההגדרה: ${esc(a.source)} ·
          ${a.search ? 'עם חיפוש ברשת' : 'ללא חיפוש ברשת, מסתמך על עוגן כותרות'}</p>`
          : `<p style="margin:0 0 10px">לא מוגדר מנוע AI.</p>`}
        <p class="note" style="margin:0">
          זמינים במשתני הסביבה: ${[s.env.anthropic && 'Anthropic', s.env.gemini && 'Gemini', s.env.nvidia && 'NVIDIA'].filter(Boolean).join(', ') || 'אין'}.
          מפתח שמוזן כאן גובר עליהם.
        </p>
      </div>
    </div>

    <div class="panel">
      <div class="ph"><h2>מפתח Gemini</h2><p>מוסיף לאתר חיפוש חי ברשת</p></div>
      <div class="pb">
        <div class="banner ${s.protected ? '' : 'warn'}">
          <div>${s.protected
            ? '<b>השינוי מוגן בקוד ניהול.</b> יש להזין אותו כדי לשמור או למחוק.'
            : '<b>המסך הזה אינו מוגן.</b> האתר פומבי, ולכן כל מי שמגיע לכתובת יכול להחליף את המפתח ולשרוף את המכסה שלך. להגנה: הוסף ב-Vercel משתנה סביבה בשם <code>ADMIN_CODE</code> עם קוד לבחירתך.'}
          </div>
        </div>

        <div class="inline-form" style="margin-bottom:10px">
          <input class="inp" id="gk" type="password" placeholder="${s.saved.geminiKey ? 'שמור: ' + esc(s.saved.geminiKey) : 'הדבק מפתח Gemini'}"
                 style="width:330px;text-align:start" autocomplete="off">
          <select class="inp" id="gm" style="width:190px;text-align:start">
            ${['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'].map(m =>
              `<option ${s.saved.geminiModel === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          ${s.protected ? '<input class="inp" id="code" type="password" placeholder="קוד ניהול" style="width:130px;text-align:start">' : ''}
          <button class="btn primary" id="save">בדוק ושמור</button>
          ${s.saved.geminiKey ? '<button class="btn" id="del">מחק מפתח</button>' : ''}
        </div>
        <p class="note" id="msg" style="margin:0">
          המפתח נבדק מול Google לפני השמירה, כדי שלא יישמר מפתח שבור.
          ${s.saved.updatedAt ? `עודכן לאחרונה ${esc(s.saved.updatedAt.slice(0, 16).replace('T', ' '))}.` : ''}
          השג מפתח חינמי ב-<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>.
        </p>
      </div>
    </div>

    <div class="panel">
      <div class="ph"><h2>מה משתנה עם Gemini</h2></div>
      <div class="pb">
        <p style="margin:0 0 8px">בלשוניות הנייר, האנרגיה וההובלה נפתח כפתור <b>שלוף ערכים מהרשת</b>.
        המודל מחפש את הערך המפורסם של כל אינדקס מנוהל ומציע אותו בשדה ההזנה, עם קישור למקור.</p>
        <p class="note" style="margin:0">הערך המוצע אינו נשמר מעצמו. הוא ממלא את השדה, אתה בודק את המקור
        ולוחץ שמור. זו החלטה מכוונת: מודל שפה יכול לטעות ביחידות או לצטט מקור ישן, ומספר שגוי
        בסדרה מרעיל את כל ההמלצות שנגזרות ממנה.</p>
      </div>
    </div>`;

    const msg = (t, bad) => { const el = $('#msg'); if (!el) return; el.textContent = t; el.style.color = bad ? 'var(--up)' : 'var(--down)'; };

    const saveBtn = $('#save');
    if (saveBtn) saveBtn.onclick = async () => {
      const key = ($('#gk')?.value || '').trim();
      if (!key) { msg('לא הוזן מפתח.', true); return; }
      saveBtn.disabled = true; saveBtn.textContent = 'בודק…';
      const r2 = await send('/api/settings', 'PUT', {
        geminiKey: key, geminiModel: $('#gm')?.value, code: $('#code')?.value || undefined
      });
      saveBtn.disabled = false; saveBtn.textContent = 'בדוק ושמור';
      if (!r2.ok) { msg(r2.body?.message || 'השמירה נכשלה.', true); return; }
      clearCache();
      msg('המפתח נבדק ונשמר. מנוע ה-AI הוחלף ל-Gemini עם חיפוש ברשת.');
      setTimeout(() => this.render(view, {}), 900);
    };

    const del = $('#del');
    if (del) del.onclick = async () => {
      del.disabled = true;
      const r2 = await send('/api/settings', 'DELETE', { code: $('#code')?.value || undefined });
      del.disabled = false;
      if (!r2.ok) { msg(r2.body?.message || 'המחיקה נכשלה.', true); return; }
      clearCache();
      this.render(view, {});
    };
  }
});
