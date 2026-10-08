// לשונית: תנודתיות חומרי גלם ומדדי מאקרו.
// מבנה: תת-לשוניות עצמאיות, כל אחת מקבלת את אותו מטען נתונים.
import { registerTab, esc, loading } from '../../core/base.js';
import { loadMarket, loadChemicals, loadPrices, indexSeries } from './data.js';
import { groupView, wireInputs } from './market-view.js';
import { chemicalsView, wireChemicals } from './chemicals-view.js';
import { riskView } from './risk-view.js';
import { wireAiPanel } from './ai-panel.js';
import { lanesPanel, wireLanes } from './freight-view.js';
import { uploadPanel, wireUpload, pick, pickNum } from '../../core/upload.js';

const SUBS = [
  // סדר עברי: הראשון ברשימה יושב הכי ימינה. הכימיקלים הם הלב, ולכן ראשונים,
  // וההובלה לצידם כי היא רכיב העלות שמזין את ההמלצות שלהם.
  { id: 'chem', he: 'כימיקלים של גלעם' },
  { id: 'freight', he: 'הובלה ימית' },
  { id: 'paper', he: 'מחירי נייר' },
  { id: 'energy', he: 'אנרגיה ופלסטיק' },
  { id: 'fx', he: 'שערי מטבע' },
  { id: 'risk', he: 'משברים ומחסור' }
];

// sort/dir שולטים על טבלת הכימיקלים. ברירת המחדל: טונות מהגבוה לנמוך.
const state = { win: 'd90', sort: 'tons', dir: -1 };

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
        groups: ['paper', 'wood'], title: 'מחירי נייר, עץ ומשטחים',
        lead: `<div><b>לעץ יש מחיר שוק חי, לעיסת נייר אין.</b> חוזה העצה נסחר ב-CME ומתעדכן מעצמו,
          וכך גם מדד היערנות העולמי ומניית מפעילת מאגר המשטחים הגדולה בעולם. מחירי העיסה והקרטון
          עצמם מתפרסמים רק בדוחות בתשלום של FOEX, RISI ו-EUWID, ולכן הם נשארים אינדקסים מנוהלים.
          כדי שבכל זאת תהיה תמונה חיה, הוספתי שלוש יצרניות עיסה וקרטון נסחרות כמדדים עקיפים —
          הן מסומנות <b>עקיף</b> ואסור לקרוא אותן כמחיר טון עיסה.</div>`
      },
      energy: {
        aiTitle: 'קריאת שוק האנרגיה והפולימרים',
        groups: ['energy', 'plastic'], title: 'אנרגיה ופלסטיקים',
        lead: `<div><b>הכל כאן מתעדכן מעצמו.</b> ברנט, WTI וגז טבעי מציטוטי הבורסה היומיים.
          הפולימרים דרך מדדי היצרן של ה-BLS לשרפי פלסטיק ולתרמופלסטיים — חודשיים אך רשמיים —
          ולצידם שתי יצרניות פוליאולפינים נסחרות כמדד יומי עקיף.</div>`
      },
      fx: {
        aiTitle: 'קריאת שוק המטבע',
        groups: ['fx'], title: 'שערי מטבע מול השקל',
        lead: `<div><b>מקור רשמי.</b> הדולר והאירו נמשכים מהשער היציג של בנק ישראל, שהוא גם השער
          הקובע לצורכי חשבונאות ורכש. שער האירו־דולר מגיע מ-ECB.</div>`
      },
      freight: {
        aiTitle: 'קריאת שוק ההובלה',
        groups: ['freight'], title: 'מדדי הובלה חיים',
        lead: `<div><b>מדד ההובלה הימית הרשמי של ה-BLS, ולצידו מדדים נסחרים יומיים</b> — ובהם ZIM,
          המוביל המרכזי לנמלי הארץ. מדדי FBX ו-Drewry הם מסחריים ואינם זמינים. טבלת הנתיבים לחיפה
          נמצאת מתחת.</div>`
      }
    }[active];

    host.innerHTML = groupView(market, cfg.groups, cfg)
      + (active === 'freight' ? await lanesPanel(byId) + uploadPanel({
          id: 'freight',
          title: 'טעינת מחירי הובלה מקובץ',
          hint: 'הצעות מחיר מהמשלח. כל שורה מעדכנת סדרה אחת במאגר',
          columns: 'עמודות: מזהה סדרה (למשל fr.wci_feu), ערך, תאריך, מקור'
        }) : '');
    wireInputs(host, rerender, active);
    if (active === 'freight') {
      wireLanes(host, rerender);
      wireUpload(host, {
        id: 'freight', endpoint: '/api/ops?task=series',
        mapRow: row => {
          const id = pick(row, 'מזהה סדרה', 'series', 'id');
          const value = pickNum(row, 'ערך', 'value', 'מחיר');
          if (!id || value == null) return null;
          return { series: id, value, date: pick(row, 'תאריך', 'date'), source: pick(row, 'מקור', 'source') || 'קובץ משלח' };
        },
        onDone: rerender
      });
    }
    wireAiPanel(host, `/api/ai?task=brief&group=${active}`);
  }
});
