// תת-לשונית סיכון גיאופוליטי: סריקת AI אחר משברים וחוסרים צפויים בכימיקלים של גלעם.
// הפלט כאן מסומן במפורש כהערכה, לא כציטוט שוק.
import { esc, get, clearCache, loading } from '../../core/base.js';

const STATE = { he: { calm: 'רגוע', watch: 'במעקב', strained: 'מתוח' } };

export async function riskView(root, { force = false } = {}) {
  root.innerHTML = loading(force
    ? 'מריץ סריקה חדשה. המודל קורא עשרות כותרות ומסווג אותן — זה לוקח עד דקה.'
    : 'טוען את הסריקה האחרונה');
  const r = await get(`/api/ai?task=risk${force ? '&force=1' : ''}`, { fresh: force });

  if (r.status === 503 && r.body?.error === 'no_ai_key') {
    root.innerHTML = notConfigured();
    return;
  }
  if (!r.ok) {
    root.innerHTML = `<div class="panel"><div class="pb"><div class="empty">
      <b>הסריקה נכשלה</b>${esc(r.body?.message || r.body?.error || 'שגיאה לא ידועה')}</div>
      <div style="text-align:center"><button class="btn" data-retry>נסה שוב</button></div></div></div>`;
    const retry = root.querySelector('[data-retry]');
    if (retry) retry.onclick = () => { clearCache(); riskView(root, { force: true }); };
    return;
  }

  const d = r.body.data || {};
  const g = r.body.grounding;
  const alerts = Array.isArray(d.alerts) ? d.alerts : [];
  const sev = s => ['high', 'medium', 'low'].indexOf(s) < 0 ? 2 : ['high', 'medium', 'low'].indexOf(s);
  alerts.sort((a, b) => sev(a.severity) - sev(b.severity));

  root.innerHTML = `
  <div class="banner warn">
    <div><b>הערכת AI, לא ציטוט שוק.</b> המודל אינו מחפש בעצמו — הוא מקבל כותרות חדשות אמיתיות
    ומסווג אותן בלבד, וכל התרעה חייבת להפנות לכותרת ממשית. התרעה בלי עוגן נפסלת אוטומטית.
    הסריקה מפנה את תשומת לב הקניין, לא מחליפה אישור מול הספק.
    ${g ? `נסרקו ${g.items} כותרות מ-${g.queries} שאילתות ב-${esc(g.source)}.` : ''}
    ${r.body.cached ? `התוצאה מהסריקה האחרונה${Number.isFinite(r.body.ageHours) ? `, לפני ${r.body.ageHours} שעות` : ''}${r.body.stale ? ' — ישנה, כדאי לסרוק מחדש' : ''}.` : ''}
    נסרק ${esc(r.body.at?.slice(0, 16).replace('T', ' ') || '')} · ${esc(r.body.provider || '')}${r.body.model ? ' · ' + esc(r.body.model) : ''}</div>
  </div>

  <div class="panel">
    <div class="ph">
      <h2>תמונת מצב</h2>
      <p>${esc(d.asOf || '')}</p>
      <span class="right">
        <span class="pill ${d.overall === 'strained' ? 'high' : d.overall === 'watch' ? 'medium' : 'low'}">${esc(STATE.he[d.overall] || d.overall || '—')}</span>
        <button class="btn sm" data-rescan>סריקה מחדש</button>
        <span class="sub">סריקה אוטומטית רצה כל בוקר</span>
      </span>
    </div>
    <div class="pb">${esc(d.summary || 'אין סיכום.')}</div>
  </div>

  <div class="panel">
    <div class="ph"><h2>התרעות</h2><p>${alerts.length ? `${alerts.length} אירועים שעשויים להשפיע על אספקה לישראל` : 'לא זוהה מחסור צפוי בישראל'}</p></div>
    ${alerts.length ? `<div class="tblwrap"><table>
      <thead><tr><th>כימיקל</th><th>חומרה</th><th>אופק</th><th>השפעה בישראל</th><th>האירוע</th><th>פעולה מומלצת</th></tr></thead>
      <tbody>${alerts.map(a => `<tr>
        <td>${esc(a.chemical || '—')}</td>
        <td><span class="pill ${['high','medium','low'].includes(a.severity) ? a.severity : 'low'}">${esc({high:'גבוהה',medium:'בינונית',low:'נמוכה'}[a.severity] || a.severity || '—')}</span></td>
        <td class="sub">${esc({ '0-3m':'עד 3 חודשים','3-6m':'3 עד 6 חודשים','6-12m':'6 עד 12 חודשים' }[a.horizon] || a.horizon || '—')}</td>
        <td>${esc(a.israelImpact || '—')}</td>
        <td>${esc(a.headline || '')}<span class="sub">${esc(a.detail || '')}</span>
          ${(a.refTitles || []).slice(0, 3).map((t, i) => `<a href="${esc((a.sources || [])[i] || '#')}" target="_blank" rel="noopener" class="sub" style="display:block">${esc(t)}</a>`).join('')
            || (a.sources || []).slice(0, 3).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener" class="sub" style="display:inline-block;margin-inline-end:8px">מקור ${i + 1}</a>`).join('')}</td>
        <td>${esc(a.action || '')}</td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="pb"><div class="empty"><b>אין מחסור צפוי בישראל</b>הסריקה לא מצאה אירוע מהותי שצפוי לפגוע באספקת הכימיקלים של גלעם בחודשים הקרובים.</div></div>`}
  </div>`;

  const rescan = root.querySelector('[data-rescan]');
  if (rescan) rescan.onclick = () => { clearCache(); riskView(root, { force: true }); };
}

function notConfigured() {
  return `<div class="panel">
    <div class="ph"><h2>סריקה גיאופוליטית</h2><p>דורשת מפתח AI</p></div>
    <div class="pb">
      <div class="banner warn"><div><b>לא הוגדר מפתח AI.</b> זו תת-הלשונית היחידה שבאמת דורשת מודל שפה —
      כל שאר הלשוניות עובדות על נתוני שוק ישירים.</div></div>
      <p>כדי להפעיל אותה, יש להוסיף בפרויקט ב-Vercel, תחת Settings ← Environment Variables, אחד מהשניים:</p>
      <ul style="color:var(--ink2);line-height:1.9">
        <li><code>NVIDIA_API_KEY</code> — NVIDIA NIM, עם עוגן כותרות חדשות אמיתיות</li>
        <li><code>ANTHROPIC_API_KEY</code> — עם חיפוש ברשת מובנה</li>
        <li><code>GEMINI_API_KEY</code> — עם Google Search מובנה</li>
      </ul>
      <p class="note">אחרי ההוספה צריך Redeploy אחד כדי שהמשתנה ייכנס לתוקף. התוצאה נשמרת במטמון ל-12 שעות
      כדי לא לבזבז קריאות.</p>
    </div>
  </div>`;
}
