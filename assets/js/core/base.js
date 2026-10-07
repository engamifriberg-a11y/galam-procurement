// ליבת המערכת: רישום לשוניות, ניתוב, ומטמון נתונים משותף.
// הוספת לשונית חדשה = קובץ אחד שקורא ל-registerTab, ושורה אחת ברשימת ה-import למטה.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// CSS.escape אינו קיים מחוץ לדפדפן, ושובר כל בדיקה אוטומטית
export const cssEsc = v => (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&');
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const nf = (v, dp = 2) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('he-IL', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const pc = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
export const dirClass = v => v == null ? 'flat' : v > 0.15 ? 'up' : v < -0.15 ? 'down' : 'flat';

const TABS = [];
export function registerTab(tab) { TABS.push(tab); }

/* ---------- מטמון נתונים משותף ---------- */
const cache = new Map();
export async function get(url, { fresh = false } = {}) {
  if (!fresh && cache.has(url)) return cache.get(url);
  const p = fetch(url).then(async r => {
    const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    return { ok: r.ok, status: r.status, body };
  }).catch(e => ({ ok: false, status: 0, body: { error: String(e.message || e) } }));
  cache.set(url, p);
  return p;
}
export async function send(url, method, payload) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}
export function clearCache() { cache.clear(); }

/* ---------- רכיבי תצוגה משותפים ---------- */
export function sparkline(points, up) {
  if (!points || points.length < 3) return '';
  const vals = points.map(p => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (vals.length - 1) * 100).toFixed(2)} ${(28 - (v - min) / span * 26).toFixed(2)}`).join(' ');
  const stroke = up == null ? 'var(--accent)' : up > 0.15 ? 'var(--up)' : up < -0.15 ? 'var(--down)' : 'var(--ink3)';
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" style="stroke:${stroke}"/></svg>`;
}

export function bars(items, { total, unit = '' } = {}) {
  const max = Math.max(1, ...items.map(i => Math.abs(i.v)));
  const sum = total ?? items.reduce((a, b) => a + b.v, 0);
  return `<div class="bars">${items.map(it => `
    <div class="brow">
      <span class="blabel" title="${esc(it.l)}">${esc(it.l)}</span>
      <span class="btrack"><span class="bfill" style="width:${Math.max(1.5, Math.abs(it.v) / max * 100)}%${it.c ? `;background:${it.c}` : ''}"></span></span>
      <span class="bval">${nf(it.v, it.dp ?? 0)}${unit}<i>${sum ? (it.v / sum * 100).toFixed(1) + '%' : ''}</i></span>
    </div>`).join('')}</div>`;
}

export function loading(text = 'טוען נתונים') {
  return `<div class="empty"><span class="spin"></span><div style="margin-top:10px">${esc(text)}</div></div>`;
}
export function empty(title, body) {
  return `<div class="empty"><b>${esc(title)}</b>${esc(body || '')}</div>`;
}

export function stamp(text) { const el = $('#stamp'); if (el) el.textContent = text || ''; }

export function tabs() { return TABS; }

/* ---------- עדכון אוטומטי ---------- */
export const LIVE = {
  on: true,
  everyMs: 5 * 60 * 1000,   // משיכה חדשה מהמקורות
  tickMs: 15 * 1000,        // רענון הכיתוב "עודכן לפני"
  lastAt: null,
  timer: null,
  ticker: null
};

export function since(ts) {
  if (!ts) return 'טרם עודכן';
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 45) return 'עודכן עכשיו';
  const min = Math.round(sec / 60);
  if (min < 60) return `עודכן לפני ${min} דק׳`;
  const hr = Math.round(min / 60);
  return `עודכן לפני ${hr} שע׳`;
}

/* אסור לדרוס שדה שהמשתמש מקליד בו באמצע. */
export function userIsTyping() {
  const el = document.activeElement;
  return Boolean(el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
}
