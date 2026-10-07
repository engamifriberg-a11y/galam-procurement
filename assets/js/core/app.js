// נקודת האתחול. מייבאת את הליבה ואת מודולי הלשוניות, ואז בונה את הממשק.
//
// חשוב: מודולי הלשוניות מייבאים את base.js בלבד, לעולם לא את הקובץ הזה.
// ייבוא הדדי בין השניים יוצר תלות מעגלית שנתקעת ומשאירה דף ריק.
//
// הוספת לשונית חדשה = שורת import אחת כאן, והמודול רושם את עצמו ב-registerTab.
import { $, $$, esc, get, clearCache, loading, empty, tabs } from './base.js';
import '../tabs/volatility/index.js';
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
  render();
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

buildTabs();
if (!location.hash) location.hash = TABS[0].id;
render();
