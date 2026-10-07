// לשונית: תנודתיות חומרי גלם ומדדי מאקרו.
// מבנה: תת-לשוניות עצמאיות, כל אחת מקבלת את אותו מטען נתונים.
import { registerTab, esc, loading } from '../../core/base.js';
import { loadMarket, loadChemicals, loadPrices, indexSeries } from './data.js';
import { groupView, wireInputs } from './market-view.js';
import { chemicalsView, wireChemicals } from './chemicals-view.js';
import { riskView } from './risk-view.js';
import { wireAiPanel } from './ai-panel.js';

const SUBS = [
  { id: 'paper', he: 'מחירי נייר ועיסה' },
  { id: 'energy', he: 'אנרגיה ופלסטיק' },
  { id: 'fx', he: 'שערי מטבע' },
  { id: 'freight', he: 'הובלה ימית' },
  { id: 'chem', he: 'כימיקלים של גלעם' },
  { id: 'risk', he: 'משברים ומחסור' }
];

const state = { win: 'd90' };

registerTab({
  id: 'volatility',
  he: 'תנודתיות חומרי גלם',
  async render(view, { sub, go }) {
    const active = SUBS.find(s => s.id === sub) ? sub : SUBS[0].id;

    view.innerHTML = `
      <nav class="subtabs" role="tablist">
        ${SUBS.map(s => `<button class="subtab" role="tab" data-sub="${s.id}" aria-selected="${s.id === active}">${esc(s.he)}</button>`).join('')}
      </nav>
      <div id="subview">${loading()}</div>`;
    view.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => go('volatility', b.dataset.sub));

    const host = view.querySelector('#subview');
    const rerender = () => this.render(view, { sub: active, go });

    if (active === 'risk') return riskView(host);

    const market = await loadMarket();
    const byId = indexSeries(market);

    if (market.error) {
      host.innerHTML = `<div class="banner warn"><div><b>שגיאת נתונים.</b> ${esc(market.error)}</div></div>`;
      return;
    }

    if (active === 'chem') {
      const [chem, prices] = await Promise.all([loadChemicals(), loadPrices()]);
      host.innerHTML = chemicalsView(market, chem, prices, byId, state);
      wireChemicals(host, state, rerender);
      return;
    }

    const cfg = {
      paper: {
        aiTitle: 'קריאת שוק הנייר',
        groups: ['paper'], title: 'מחירי נייר ועיסת נייר',
        lead: `<div><b>אין בורסת נייר עם API חינמי.</b> מחירי העיסה והקרטון מתפרסמים בדוחות של בתי תוכן
          כמו FOEX, RISI ו-EUWID, וחוזי העיסה נסחרים בבורסת שנגחאי. לכן הסדרות כאן מנוהלות: מזינים
          את הערך התקופתי והמערכת בונה את ההיסטוריה ומחשבת תנודתיות. אם תרכשו מנוי, מחברים אותו
          כמקור אחד בשכבת המתאמים בלי לשנות שום דבר אחר.</div>`
      },
      energy: {
        aiTitle: 'קריאת שוק האנרגיה והפולימרים',
        groups: ['energy', 'plastic'], title: 'אנרגיה ופלסטיקים',
        lead: `<div><b>הנפט והגז חיים.</b> ברנט, WTI וגז טבעי נמשכים ישירות מציטוטי הבורסה.
          הפולימרים — PP, PE, PVC — אין להם מקור ציבורי חינמי, והם מנוהלים ידנית עד חיבור מנוי.</div>`
      },
      fx: {
        aiTitle: 'קריאת שוק המטבע',
        groups: ['fx'], title: 'שערי מטבע מול השקל',
        lead: `<div><b>מקור רשמי.</b> הדולר והאירו נמשכים מהשער היציג של בנק ישראל, שהוא גם השער
          הקובע לצורכי חשבונאות ורכש. שער האירו־דולר מגיע מ-ECB.</div>`
      },
      freight: {
        aiTitle: 'קריאת שוק ההובלה',
        groups: ['freight'], title: 'מחירי הובלה',
        lead: `<div><b>מכולות 20 ו-40 רגל, ומכליות.</b> מדדי FBX ו-Drewry הם מסחריים, ולכן הסדרות מנוהלות.
          שורת המפתח לגלעם היא מכלית הכימיקלים מאירופה לישראל וההובלה היבשתית בארץ — שתיהן נכנסות
          ישירות לחישוב ההמלצות בתת-הלשונית של הכימיקלים.</div>`
      }
    }[active];

    host.innerHTML = groupView(market, cfg.groups, cfg);
    wireInputs(host, rerender, active);
    wireAiPanel(host, `/api/ai?task=brief&group=${active}`);
  }
});
