// לשונית הספקים: סיכון, אנשי קשר, פילוח ותנאי תשלום.
import { registerTab, esc, nf, get, loading, empty, clearCache } from '../../core/base.js';
import { uploadPanel, wireUpload, pick, pickNum } from '../../core/upload.js';
import { riskView } from './risk-view.js';
import { contactsView, wireContacts } from './contacts-view.js';
import { segmentView, wireSegment } from './segment-view.js';
import { termsView, wireTerms } from './terms-view.js';

const SUBS = [
  { id: 'risk', he: 'סיכון ספקים' },
  { id: 'contacts', he: 'אנשי קשר' },
  { id: 'segment', he: 'פילוח' },
  { id: 'terms', he: 'תנאי תשלום' },
  { id: 'data', he: 'עדכון נתונים' }
];

// מצב משותף לכל תתי-הלשוניות, כדי שלחיצה על גרף תעביר סינון
export const S = { q: '', scope: 'all', t: '', st: '', city: '', cn: '', cur: '', pt: '', own: '', cls: '', risk: '', limit: 60, sort: { k: 'nm', d: 1 } };

export async function loadSuppliers(fresh = false) {
  const r = await get('/api/suppliers', { fresh });
  if (!r.ok) return { rows: [], error: r.body?.error || `HTTP ${r.status}` };
  const rows = (r.body.rows || []).map(d => ({
    ...d,
    scr: d.scr == null ? null : Number(d.scr),
    ind: d.ind == null ? null : Number(d.ind),
    crd: d.crd == null ? null : Number(d.crd),
    act: d.st === 'פעיל',
    blob: [d.nm, d.en, d.id, d.tel, d.fax, d.em, d.ad, d.city, d.cn, d.vat, d.cls, d.t, d.ptd, d.own, d.field]
      .filter(Boolean).join(' ').toLowerCase()
  }));
  return { rows, version: r.body.version, origin: r.body.origin, uploadedAt: r.body.uploadedAt };
}

/* דירוג הסיכון לפי הסקור בלבד, כפי שהוגדר: מתחת ל-15 ספק מסוכן.
   הסקור הענפי מוצג לצידו כהשוואה, אך אינו משנה את הדירוג. */
export function riskOf(d) {
  if (d.scr == null) return { code: 'none', he: 'לא נסקר', cls: 'low', rank: 3 };
  if (d.scr < 15) return { code: 'high', he: 'מסוכן', cls: 'high', rank: 0 };
  if (d.scr < 30) return { code: 'watch', he: 'במעקב', cls: 'medium', rank: 1 };
  return { code: 'ok', he: 'תקין', cls: 'ok', rank: 2 };
}

export function applyFilters(rows) {
  return rows.filter(d => {
    if (S.q && !d.blob.includes(S.q)) return false;
    if (S.t && d.t !== S.t) return false;
    if (S.st && d.st !== S.st) return false;
    if (S.city && d.city !== S.city) return false;
    if (S.cn && d.cn !== S.cn) return false;
    if (S.cur && d.cur !== S.cur) return false;
    if (S.pt && d.ptd !== S.pt) return false;
    if (S.own && d.own !== S.own) return false;
    if (S.cls && d.cls !== S.cls) return false;
    if (S.risk && riskOf(d).code !== S.risk) return false;
    return true;
  });
}

export function tally(rows, f) {
  const m = new Map();
  rows.forEach(d => { const k = f(d); if (k != null && k !== '') m.set(k, (m.get(k) || 0) + 1); });
  return [...m].sort((a, b) => b[1] - a[1]);
}

registerTab({
  id: 'suppliers',
  he: 'ספקים',
  async render(view, { sub, go }) {
    const active = SUBS.find(s => s.id === sub) ? sub : SUBS[0].id;
    view.innerHTML = `
      <nav class="subtabs" role="tablist">
        ${SUBS.map(s => `<button class="subtab" role="tab" data-sub="${s.id}" aria-selected="${s.id === active}">${esc(s.he)}</button>`).join('')}
      </nav>
      <div id="subview">${loading('טוען מאגר ספקים')}</div>`;
    view.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => go('suppliers', b.dataset.sub));

    const host = view.querySelector('#subview');
    const data = await loadSuppliers();
    if (data.error) { host.innerHTML = empty('המאגר לא נטען', data.error); return; }

    const rerender = () => this.render(view, { sub: active, go });
    const jump = (key, value, to = 'contacts') => {
      Object.assign(S, { q: '', scope: 'all', t: '', st: '', city: '', cn: '', cur: '', pt: '', own: '', cls: '', risk: '', limit: 60 });
      S[key] = value;
      go('suppliers', to);
    };

    if (active === 'risk') { host.innerHTML = riskView(data, jump); wireContacts(host, rerender, jump, data.rows); return; }
    if (active === 'contacts') { host.innerHTML = contactsView(data); wireContacts(host, rerender, jump, data.rows); return; }
    if (active === 'segment') { host.innerHTML = segmentView(data, jump); wireSegment(host, jump); return; }
    if (active === 'terms') { host.innerHTML = termsView(data, jump); wireTerms(host, jump); return; }

    host.innerHTML = dataView(data);
    wireUpload(host, {
      id: 'sup', endpoint: '/api/suppliers',
      mapRow: row => {
        const id = pick(row, 'מס.ספק', 'מס ספק', 'מספר ספק');
        if (!id) return null;
        const addr = [pick(row, 'כתובת'), pick(row, 'כתובת - שורה 2'), pick(row, 'כתובת - שורה 3')].filter(Boolean).join(' ');
        return {
          id, nm: pick(row, 'שם ספק'), en: pick(row, 'שם לועזי'),
          tc: pick(row, 'סוג ספק'), t: pick(row, 'תאור סוג ספק') || 'לא מסווג',
          st: pick(row, 'סטטוס'), cur: pick(row, 'מטבע'),
          pt: pick(row, 'תנאי תשלום') || '—', ptd: pick(row, 'תנאי תשלום') || 'לא הוגדר',
          own: pick(row, 'לטיפול'), dt: pick(row, 'תאריך פתיחה'),
          tel: pick(row, 'טלפון'), fax: pick(row, 'פקס'), em: pick(row, 'e-mail', 'אימייל'),
          ad: addr, city: pick(row, 'עיר', 'עיר ומדינה'), cn: pick(row, 'ארץ') || 'לא ידוע',
          web: pick(row, 'Web Site'), vat: pick(row, 'מס. עוסק מורשה'),
          scr: pickNum(row, 'סקור'), ind: pickNum(row, 'סקור ענפי'), crd: pickNum(row, 'המלצת אשראי'),
          cls: pick(row, 'סיווג תאור'), emp: pickNum(row, 'מספר עובדים'), yr: pickNum(row, 'שנת הקמה'),
          ord: pick(row, 'דרישה\\הזמנה'), field: pick(row, 'תחום עיסוק')
        };
      },
      onDone: rerender
    });
    const rev = host.querySelector('[data-revert]');
    if (rev) rev.onclick = async () => {
      rev.disabled = true;
      await fetch('/api/suppliers', { method: 'DELETE' });
      clearCache(); rerender();
    };
  }
});

function dataView(data) {
  return `
  ${uploadPanel({
    id: 'sup',
    title: 'עדכון מאגר הספקים',
    hint: `במאגר ${nf(data.rows.length, 0)} ספקים · מקור: ${esc(data.origin || '')}${data.version ? ' · גרסה ' + esc(data.version) : ''}`,
    columns: 'ייצוא Priority עם העמודות: מס.ספק, שם ספק, תאור סוג ספק, סטטוס, תנאי תשלום, סקור, סקור ענפי, המלצת אשראי, טלפון, e-mail, כתובת, עיר, ארץ'
  })}
  <div class="panel">
    <div class="ph"><h2>כיצד זה עובד</h2></div>
    <div class="pb">
      <p style="margin:0 0 8px">הקובץ נקרא בדפדפן שלך, מוצגת לך דגימה, ורק אחרי אישור הוא נשמר במאגר.
      העלאה חדשה מחליפה את הקודמת במלואה.</p>
      <p class="note" style="margin:0 0 12px">שמות העמודות נקראים לפי הכותרות בשורה הראשונה, כך שייצוא
      רגיל מ-Priority עובד בלי התאמות. עמודה חסרה פשוט תישאר ריקה ולא תפיל את הטעינה.</p>
      <button class="btn" data-revert>חזרה לקובץ הבסיס</button>
    </div>
  </div>`;
}
