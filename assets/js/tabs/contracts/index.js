// לשונית חוזי אחזקה. הועברה מהארטיפקט "מעקב הסכמים וספקים" והותאמה
// לארכיטקטורה ולעיצוב של המערכת. השינוי המהותי: השינויים נשמרים בשרת
// ולא בדפדפן, כך שכל מי שפותח את האתר רואה את אותו מצב.
import { registerTab, esc, nf, get, send, clearCache, loading, empty } from '../../core/base.js';
import { uploadPanel, wireUpload, pick, pickNum } from '../../core/upload.js';
import { boardHtml, sheetHtml, kpisHtml, filtersHtml } from './view.js';
import { drawerHtml, readDrawer } from './drawer.js';
import { merged, status, money, isOff, badDate, passes, searchHit, sortList, FILTERS, toCsv } from './model.js';

const SUBS = [{ id: 'track', he: 'מעקב חוזים' }, { id: 'data', he: 'עדכון נתונים' }];
export const C = { filter: 'all', q: '', sort: 'urgency', openId: null, showPast: false };

let DATA = { rows: [], overrides: {} };

async function load(fresh = false) {
  const r = await get('/api/contracts', { fresh });
  if (!r.ok) return { rows: [], overrides: {}, error: r.body?.error || `HTTP ${r.status}` };
  return { rows: r.body.rows || [], overrides: r.body.overrides || {}, version: r.body.version, origin: r.body.origin };
}

/* שמירת שינוי לחוזה אחד. מעדכן מקומית מיד ושולח לשרת ברקע. */
export async function patch(id, p, rerender) {
  DATA.overrides[id] = { ...(DATA.overrides[id] || {}), ...p, updatedAt: new Date().toISOString() };
  rerender();
  const r = await send(`/api/contracts?id=${encodeURIComponent(id)}`, 'PUT', p);
  if (!r.ok) toast('השמירה נכשלה — נסה שוב');
  clearCache();
}

export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 1900);
}

registerTab({
  id: 'contracts',
  he: 'חוזי אחזקה',
  async render(view, { sub, go }) {
    const active = SUBS.find(s => s.id === sub) ? sub : SUBS[0].id;
    view.innerHTML = `
      <nav class="subtabs" role="tablist">
        ${SUBS.map(s => `<button class="subtab" role="tab" data-sub="${s.id}" aria-selected="${s.id === active}">${esc(s.he)}</button>`).join('')}
      </nav>
      <div id="subview">${loading('טוען חוזים')}</div>`;
    view.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => go('contracts', b.dataset.sub));

    const host = view.querySelector('#subview');
    DATA = await load();
    if (DATA.error) { host.innerHTML = empty('החוזים לא נטענו', DATA.error); return; }

    const rerender = () => this.render(view, { sub: active, go });

    if (active === 'data') {
      host.innerHTML = dataView(DATA);
      wireUpload(host, {
        id: 'contracts', endpoint: '/api/contracts',
        mapRow: row => {
          const supplier = pick(row, 'ספק', 'שם ספק');
          if (!supplier) return null;
          return {
            supplier,
            service: pick(row, 'שירות / מוצר', 'שירות', 'מוצר'),
            annual: pickNum(row, 'שנתי', 'עלות שנתית'),
            monthly: pickNum(row, 'חודשי', 'עלות חודשית'),
            start: pick(row, 'תחילת התקשרות', 'תאריך התחלה'),
            end: pick(row, 'סיום חוזה', 'תאריך סיום'),
            ins: pick(row, 'אישור ביטוח עד', 'אישור ביטוח'),
            contact: pick(row, 'איש קשר'), email: pick(row, 'אימייל', 'e-mail'),
            notes: pick(row, 'הערות'), nda: pick(row, 'NDA'), safety: pick(row, 'בטיחות')
          };
        },
        onDone: rerender
      });
      const rev = host.querySelector('[data-reset]');
      if (rev) rev.onclick = async () => {
        if (!confirm('לנקות את כל השינויים ולחזור לנתוני הבסיס?')) return;
        await fetch('/api/contracts', { method: 'DELETE' });
        clearCache(); rerender();
      };
      return;
    }

    const list = merged(DATA.rows, DATA.overrides);
    const shown = sortList(list.filter(r => passes(r, C.filter) && searchHit(r, C.q)), C.sort);

    host.innerHTML = `
      ${kpisHtml(list)}
      ${boardHtml(list, C)}
      ${filtersHtml(list, C)}
      ${sheetHtml(shown, list.length)}
      <div class="scrim" id="scrim"></div>
      <aside class="drawer" id="drawer" aria-hidden="true" aria-label="עריכת הסכם"></aside>`;

    wire(host, list, rerender);
  }
});

function wire(root, list, rerender) {
  const byId = new Map(list.map(r => [r.id, r]));

  root.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { C.filter = b.dataset.filter; rerender(); });
  const tp = root.querySelector('[data-togglepast]');
  if (tp) tp.onclick = () => { C.showPast = !C.showPast; rerender(); };

  const q = root.querySelector('#cq');
  if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { C.q = q.value.trim().toLowerCase(); rerender(); }, 180); }; }
  const sort = root.querySelector('#csort');
  if (sort) sort.onchange = () => { C.sort = sort.value; rerender(); };

  const csv = root.querySelector('[data-csv]');
  if (csv) csv.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + toCsv(sortList(list, C.sort))], { type: 'text/csv;charset=utf-8' }));
    a.download = 'maintenance-contracts.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  const add = root.querySelector('[data-add]');
  if (add) add.onclick = () => {
    const id = 'new-' + Date.now().toString(36);
    patch(id, { isNew: true, supplier: '', service: '' }, rerender);
  };

  // מתג פעיל/מבוטל
  root.querySelectorAll('[data-state]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const r = byId.get(b.dataset.state);
    const nowOff = !isOff(r);
    patch(b.dataset.state, { active: !nowOff }, rerender);
    toast(nowOff ? 'ההסכם סומן כמבוטל' : 'ההסכם סומן כפעיל');
  });

  // עריכה מהירה של סכום בתוך הטבלה
  root.querySelectorAll('[data-money]').forEach(el => el.onclick = e => {
    e.stopPropagation();
    inlineEdit(el, byId.get(el.dataset.id), el.dataset.money, rerender);
  });

  // מגירת העריכה
  const drawer = root.querySelector('#drawer');
  const scrim = root.querySelector('#scrim');
  const close = () => {
    C.openId = null;
    drawer.classList.remove('on'); drawer.setAttribute('aria-hidden', 'true'); scrim.classList.remove('on');
  };
  const open = id => {
    const r = byId.get(id);
    if (!r) return;
    C.openId = id;
    drawer.innerHTML = drawerHtml(r);
    drawer.classList.add('on'); drawer.setAttribute('aria-hidden', 'false'); scrim.classList.add('on');
    drawer.querySelector('[data-close]').onclick = close;
    drawer.querySelector('[data-save]').onclick = () => {
      patch(id, readDrawer(drawer, r), rerender);
      toast('השינויים נשמרו');
      close();
    };
    const del = drawer.querySelector('[data-del]');
    if (del) del.onclick = () => {
      if (!confirm('להסיר את הרשומה מהממשק? ניתן לשחזר רק מנתוני הבסיס.')) return;
      patch(id, { deleted: true }, rerender);
      toast('הרשומה הוסרה');
      close();
    };
    drawer.querySelectorAll('[data-mode]').forEach(sel => sel.onchange = () => {
      const kind = sel.dataset.mode;
      drawer.querySelectorAll(`[data-for="${kind}"]`).forEach(f => { f.hidden = f.dataset.when !== sel.value; });
    });
  };
  root.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = e => { if (e.target.closest('[data-state],[data-money],a')) return; open(el.dataset.open); };
    el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); open(el.dataset.open); } };
  });
  scrim.onclick = close;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && C.openId) close(); });
}

function inlineEdit(el, r, field, rerender) {
  if (!r) return;
  const cur = typeof r[field] === 'number' ? r[field] : '';
  const inp = document.createElement('input');
  inp.type = 'number'; inp.className = 'inp'; inp.value = cur; inp.min = '0'; inp.step = '1';
  inp.style.width = '110px';
  inp.setAttribute('aria-label', field === 'monthly' ? 'סכום חודשי' : 'סכום שנתי');
  el.replaceWith(inp);
  inp.focus(); inp.select();
  let done = false;
  const commit = save => {
    if (done) return; done = true;
    if (!save) return rerender();
    const v = inp.value.trim();
    const p = { [field]: v === '' ? null : Number(v) };
    if (v !== '') p[field + 'Text'] = null;
    patch(r.id, p, rerender);
    toast('הסכום נשמר');
  };
  inp.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  };
  inp.onblur = () => commit(true);
}

function dataView(data) {
  const n = Object.keys(data.overrides || {}).length;
  return `
  ${uploadPanel({
    id: 'contracts',
    title: 'עדכון מאגר החוזים',
    hint: `${nf(data.rows.length, 0)} חוזים · מקור: ${esc(data.origin || '')}${data.version ? ' · גרסה ' + esc(data.version) : ''}`,
    columns: 'עמודות: ספק, שירות / מוצר, חודשי, שנתי, תחילת התקשרות, סיום חוזה, אישור ביטוח עד, איש קשר, אימייל, הערות, NDA'
  })}
  <div class="panel">
    <div class="ph"><h2>שינויים שנשמרו</h2><p>${n} חוזים נערכו מאז העלאת הבסיס</p></div>
    <div class="pb">
      <p style="margin:0 0 10px">העריכות שלך נשמרות בנפרד מנתוני הבסיס, כך שהעלאת קובץ חדש אינה מוחקת אותן.
      הן נשמרות בשרת ולא בדפדפן, כך שכל מי שפותח את האתר רואה את אותו מצב.</p>
      <button class="btn" data-reset>ניקוי כל השינויים</button>
    </div>
  </div>`;
}
