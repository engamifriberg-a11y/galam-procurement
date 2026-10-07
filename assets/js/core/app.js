// נקודת האתחול. מייבאת את הליבה ואת מודולי הלשוניות, ואז בונה את הממשק.
//
// חשוב: מודולי הלשוניות מייבאים את base.js בלבד, לעולם לא את הקובץ הזה.
// ייבוא הדדי בין השניים יוצר תלות מעגלית שנתקעת ומשאירה דף ריק.
//
// הוספת לשונית חדשה = שורת import אחת כאן, והמודול רושם את עצמו ב-registerTab.
import { $, $$, esc, get, clearCache, loading, empty, tabs, LIVE, since, userIsTyping } from './base.js';
import '../tabs/volatility/index.js';
import '../tabs/suppliers/index.js';
import '../tabs/settings/index.js';

const TABS = tabs();

function routeFromHash() {
  const [tab, sub] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  return { tab: tab || TABS[0]?.id, sub: sub || null };
}

async function render() {
  const view = $('#view');
  if (!view) return;
  if (!TABS.length) { view.innerHTML = empty('לא נטענה אף לשונית', 'בדוק את מסוף הדפדפן.'); return; }
  const { tab, sub } = routeFromHash();
  const def = TABS.find(t => t.id === tab) || TABS[0];
  $$('#tabs .tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === def.id)));
  view.innerHTML = loading();
  try {
    await def.render(view, { sub, go: (t, s) => { location.hash = s ? `${t}/${s}` : t; } });
  } catch (e) {
    console.error(e);
    view.innerHTML = empty('שגיאה בהצגת הלשונית', String(e?.message || e));
  }
}

function buildTabs() {
  $('#tabs').innerHTML = TABS.map(t => `<button class="tab" role="tab" data-id="${esc(t.id)}"
      aria-selected="false" ${t.disabled ? 'disabled' : ''}>${esc(t.he)}</button>`).join('');
  $$('#tabs .tab').forEach(b => b.onclick = () => { if (!b.disabled) location.hash = b.dataset.id; });
}

// רשת ביטחון: תקלה בטעינה לא תשאיר מסך לבן בלי הסבר.
function fatal(msg) {
  const view = $('#view');
  if (view) view.innerHTML = empty('המערכת לא נטענה', msg);
}
window.addEventListener('error', e => fatal(String(e.message || e.error || 'שגיאה לא ידועה')));
window.addEventListener('unhandledrejection', e => fatal(String(e.reason?.message || e.reason || 'שגיאה לא ידועה')));

$('#theme').onclick = () => {
  const dark = getComputedStyle(document.documentElement).getPropertyValue('--page').trim().toLowerCase().startsWith('#0d');
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  render().then(() => { LIVE.lastAt = Date.now(); startLive(); });
};

$('#refresh').onclick = async () => {
  const b = $('#refresh');
  b.disabled = true; b.textContent = 'מרענן…';
  clearCache();
  await get('/api/market?refresh=1', { fresh: true });
  await render();
  b.disabled = false; b.textContent = 'רענון נתונים';
};

window.addEventListener('hashchange', render);

/* ---------- עדכון אוטומטי ---------- */
function paintStamp() {
  const el = $('#stamp');
  if (!el) return;
  el.innerHTML = LIVE.on
    ? `<span class="live-dot"></span>${esc(since(LIVE.lastAt))}`
    : `עדכון אוטומטי כבוי · ${esc(since(LIVE.lastAt))}`;
}

async function pull({ quiet = true } = {}) {
  // לא מושכים כשהלשונית מוסתרת, וגם לא באמצע הקלדה — זה היה דורס שדות
  if (document.hidden || userIsTyping()) return;
  const tab = routeFromHash().tab;
  if (tab === 'settings') return;
  clearCache();
  await get('/api/market?refresh=1', { fresh: true });
  LIVE.lastAt = Date.now();
  await render();
  paintStamp();
  if (!quiet) console.info('עודכן');
}

function startLive() {
  clearInterval(LIVE.timer); clearInterval(LIVE.ticker);
  LIVE.ticker = setInterval(paintStamp, LIVE.tickMs);
  if (LIVE.on) LIVE.timer = setInterval(pull, LIVE.everyMs);
  paintStamp();
}

try { LIVE.on = localStorage.getItem('live') !== 'off'; } catch { /* ברירת מחדל דלוקה */ }

const liveBtn = $('#liveToggle');
if (liveBtn) liveBtn.onclick = () => {
  LIVE.on = !LIVE.on;
  try { localStorage.setItem('live', LIVE.on ? 'on' : 'off'); } catch {}
  liveBtn.setAttribute('aria-pressed', String(LIVE.on));
  liveBtn.textContent = LIVE.on ? 'עדכון אוטומטי פועל' : 'עדכון אוטומטי כבוי';
  startLive();
  if (LIVE.on) pull();
};
if (liveBtn) {
  liveBtn.setAttribute('aria-pressed', String(LIVE.on));
  liveBtn.textContent = LIVE.on ? 'עדכון אוטומטי פועל' : 'עדכון אוטומטי כבוי';
}

// חוזרים ללשונית אחרי שהיתה מוסתרת — מעדכנים מיד אם עבר מספיק זמן
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && LIVE.on && LIVE.lastAt && Date.now() - LIVE.lastAt > LIVE.everyMs) pull();
});

buildTabs();
if (!location.hash) location.hash = TABS[0].id;
render().then(() => { LIVE.lastAt = Date.now(); startLive(); });
