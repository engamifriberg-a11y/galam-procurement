// יועץ הרכש, איכות הנתונים וטעינת קובץ חדש.
import { esc, send, get, clearCache } from '../../core/base.js';
import {
  M, F, IDX, idxWhere, ALL, scanWindow, curWindow, sum, nuniq, sumBy, topMap, agg,
  dstr, dayOf, money, moneyC, num, pct, price, MEASURABLE,
  SUPN, ITEM, IDESC, UNIT, PTYP, STAT, CUR, buildModel, resetF
} from './model.js';
import { factsPack, priceGaps, clearAnalyticsCache } from './analytics.js';
import { EL, panel, tiles, table, note, grp, kv, toast, drill } from './ui.js';
import { cssv } from './charts.js';

/* ======================= 18 · יועץ רכש מבוסס AI ======================= */
const SUGG = [
  'מהם 20 המק״טים שבהם כדאי להתחיל משא ומתן?',
  'מהם 10 הספקים הגדולים ביותר בגלעם?',
  'איזה ספק העלה מחירים הכי הרבה בשנה האחרונה?',
  'באילו מק״טים אנחנו משלמים יותר לעומת העבר?',
  'מה פוטנציאל החיסכון ברכש אריזות?',
  'באילו סוגי ספקים גדלה ההוצאה?',
  'אילו מק״טים נרכשים אצל כמה ספקים במחירים שונים?',
  'היכן קיימת אפשרות לאיחוד הזמנות?',
  'מה החשיפה שלנו לספק יחיד?',
  'מה מצב ההתחייבויות הפתוחות ומה באיחור?'
];

/* markdown מצומצם: טבלאות, כותרות, רשימות והדגשה. */
function md(txt) {
  const lines = String(txt).split('\n'), out = [];
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  let i = 0;
  while (i < lines.length) {
    if (/^\s*\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const head = lines[i].split('|').slice(1, -1).map(s => s.trim());
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { body.push(lines[i].split('|').slice(1, -1).map(s => s.trim())); i++; }
      out.push(`<div class="tblwrap"><table><thead><tr>${head.map(h => `<th>${inl(h)}</th>`).join('')}</tr></thead><tbody>${
        body.map(r => `<tr>${r.map(c => `<td class="${/^[₪\d\-+.,% ]+$/.test(c) ? 'num' : ''}">${inl(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^#{1,4}\s/.test(lines[i])) { out.push(`<h4>${inl(lines[i].replace(/^#+\s/, ''))}</h4>`); i++; continue; }
    if (/^\s*[-*•]\s/.test(lines[i])) {
      const li = [];
      while (i < lines.length && /^\s*[-*•]\s/.test(lines[i])) { li.push(inl(lines[i].replace(/^\s*[-*•]\s/, ''))); i++; }
      out.push('<ul>' + li.map(x => `<li>${x}</li>`).join('') + '</ul>');
      continue;
    }
    if (lines[i].trim() === '') { i++; continue; }
    out.push(`<p>${inl(lines[i])}</p>`);
    i++;
  }
  return out.join('');
}

export function viewAdvisor(root, idx, ctx) {
  const st = ctx.state('ai', { log: [] });
  const b = panel(root, 'שיחה עם היועץ',
    `הסינון הפעיל: ${ctx.activeChips().map(c => c.label).join(' · ') || 'ללא סינון — כל הנתונים'} · ${num(idx.length)} שורות · ${moneyC(sum(idx, M.a))}`);

  const log = EL('div', { class: 'chatlog' });
  if (!st.log.length) log.appendChild(EL('div', { class: 'msg a', html:
    '<b>שלום.</b> אני עונה רק מתוך הנתונים שבמערכת. לפני כל שאלה הדפדפן מחשב חבילת עובדות מההזמנות המסוננות ושולח אותה למודל — כך שאין מספר בתשובה שלא חושב מהקובץ.<br><br>הסינון שבחרת בשורת הפילטרים חל גם על התשובות.' }));
  st.log.forEach(x => log.appendChild(EL('div', { class: 'msg ' + x.r, html: x.r === 'u' ? esc(x.t) : md(x.t) })));
  b.appendChild(log);

  const sg = EL('div', { class: 'qsug' });
  SUGG.forEach(q => sg.appendChild(EL('button', { class: 'btn sm', text: q, onclick: () => { ta.value = q; ask(); } })));
  b.appendChild(sg);

  const row = EL('div', { class: 'inline-form', style: 'margin-top:12px' });
  const ta = EL('textarea', {
    class: 'inp', style: 'flex:1 1 320px;min-height:72px;text-align:start;width:auto',
    placeholder: 'מה תרצה לדעת? לדוגמה: באילו מק״טים כדאי לפתוח משא ומתן ברבעון הקרוב?',
    onkeydown: e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } }
  });
  const btn = EL('button', { class: 'btn primary', text: 'שאל', onclick: () => ask() });
  row.append(ta, btn);
  b.appendChild(row);
  b.appendChild(EL('p', { class: 'note', text: 'Ctrl+Enter לשליחה. השיחה אינה נשמרת בשרת.' }));

  async function ask() {
    const q = ta.value.trim();
    if (!q) return;
    ta.value = '';
    st.log.push({ r: 'u', t: q });
    log.appendChild(EL('div', { class: 'msg u', text: q }));
    const ans = EL('div', { class: 'msg a', html: '<span class="spin"></span> מחשב על הנתונים…' });
    log.appendChild(ans);
    log.scrollTop = log.scrollHeight;
    btn.disabled = true;
    try {
      const facts = factsPack(IDX(), ctx.track.opps);
      const r = await send('/api/spend?ai=1', 'POST', { question: q, facts });
      if (!r.ok) {
        ans.innerHTML = r.status === 503
          ? '<b>לא מוגדר ספק AI בשרת.</b> שאר המסכים עונים על אותן שאלות ישירות: מיקוד משא ומתן במסך ניתוח מק״טים, פערי מחיר במודיעין מחירים, חיסכון בהזדמנויות, תלות בספקים ובהשוואה בין שנים.'
          : `<b>השאילתה נכשלה.</b> ${esc(r.body?.error || 'שגיאה ' + r.status)}`;
      } else {
        ans.innerHTML = md(r.body.answer || '');
        if (r.body.provider) ans.appendChild(EL('div', { class: 'src', text: `נענה על ידי ${r.body.provider} · ${r.body.model || ''}` }));
        st.log.push({ r: 'a', t: r.body.answer || '' });
      }
    } catch (e) {
      ans.innerHTML = '<b>השאילתה נכשלה.</b> ' + esc(e.message || e);
    } finally {
      btn.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  }

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  {
    const c = panel(g, 'מה היועץ מחשב', 'כל פריט כאן הוא אגרגציה אמיתית על הנתונים, לא ידע כללי');
    c.appendChild(EL('ul', {}, [
      'היקף הרכש וההתחייבויות בכל סינון', 'דירוג ספקים ומק״טים לפי היקף',
      'מחיר ממוצע משוקלל, מינימום, מקסימום ואחרון', 'פערי מחיר בין ספקים לאותו מק״ט ויחידת מידה',
      'שינויי מחיר עם הפרדת השפעת מחיר מהשפעת כמות', 'הזדמנויות חיסכון עם בסיס החישוב וההנחות',
      'תלות בספקים, HHI ומק״טים בספק יחיד', 'איחוד הזמנות והזמנות קטנות',
      'השוואה בין שנים', 'ההתראות והחריגות הפעילות'
    ].map(x => `<li>${esc(x)}</li>`).join('')));
  }
  {
    const c = panel(g, 'מה היועץ לא יכול', 'מידע שאינו קיים בקובץ');
    c.appendChild(EL('ul', {}, [
      'חשבוניות, תשלומים ואספקות בפועל — הקובץ הוא הזמנות רכש',
      'תנאי הסכם, הנחות כמות או מחירי מחירון',
      'מפרט טכני, ולכן אין איחוד מק״טים דומים בלי בדיקה',
      'עלות תהליך הזמנה — נאמדת ולא נמדדת',
      'מדדי שוק חיצוניים או מחירי סחורות עולמיים',
      'קריטיות מק״ט לייצור — אין שדה כזה בקובץ',
      'מפעל, מחלקה או מרכז עלות — אין עמודה כזו'
    ].map(x => `<li>${esc(x)}</li>`).join('')));
  }
}

/* ======================= איכות נתונים ======================= */
export function dqStats() {
  const cnt = t => { let n = 0; for (let k = 0; k < M.N; k++) if (t(k)) n++; return n; };
  let tot = 0;
  for (let k = 0; k < M.N; k++) tot += M.a[k];
  let cmpSpend = 0;
  for (let k = 0; k < M.N; k++) if (M.itemComparable[M.i[k]] && !M.itemCatchAll[M.i[k]]) cmpSpend += M.a[k];
  const dupSet = new Set();
  let dup = 0;
  for (let k = 0; k < M.N; k++) { const key = M.p[k] + '|' + M.ln[k] + '|' + M.i[k]; if (dupSet.has(key)) dup++; else dupSet.add(key); }
  return {
    רשומות: M.N,
    טיוטות_שמוחרגות: cnt(k => M.st[k] === M.statDraft),
    כפילות_הזמנה_שורה_מקט: dup,
    מקטים_ללא_תאור: M.dims.itemDesc.filter(d => !d).length,
    ספקים_ללא_סיווג: M.dims.supInfo.filter(x => !x.typeDesc).length,
    שורות_של_ספקים_ללא_סיווג: cnt(k => !M.dims.supInfo[M.s[k]].typeDesc),
    מחיר_אפס_או_שלילי: cnt(k => !(M.up[k] > 0)),
    כמות_אפס_או_שלילית: cnt(k => !(M.q[k] > 0)),
    סכום_אפס_או_שלילי: cnt(k => !(M.a[k] > 0)),
    יתרה_שלילית: cnt(k => M.oq[k] < 0),
    יתרה_גדולה_מהכמות: cnt(k => M.oq[k] > M.q[k]),
    סגורות_עם_יתרה: cnt(k => M.st[k] === M.statClosed && M.oq[k] > 0),
    ללא_תאריך_אספקה: cnt(k => M.dd[k] < 0),
    אספקה_לפני_הזמנה: cnt(k => M.dd[k] >= 0 && M.dd[k] < M.d[k]),
    ללא_סוג_הזמנה: cnt(k => PTYP(M.pt[k]) === '(ללא סוג)'),
    קודי_מרכז_עלות: [...M.itemCatchAll].filter(x => x).length,
    כיסוי_ניתוח_מחירים_אחוז: +(cmpSpend / tot * 100).toFixed(1),
    סך_הוצאה_שח: Math.round(tot)
  };
}

export function viewDataQuality(root, idx, ctx) {
  const s = dqStats();
  let tot = 0;
  for (let k = 0; k < M.N; k++) tot += M.a[k];

  tiles(root, [
    { k: 'רשומות שנקלטו', v: num(s.רשומות), d: `${num(M.dims.po.length)} הזמנות · ${num(M.dims.sup.length)} ספקים · ${num(M.dims.item.length)} מק״טים`, lead: true },
    { k: 'סך ההוצאה בקובץ', v: moneyC(s.סך_הוצאה_שח), d: `${dstr(M.minD)} – ${dstr(M.maxD)}` },
    { k: 'כפילויות', v: num(s.כפילות_הזמנה_שורה_מקט), d: s.כפילות_הזמנה_שורה_מקט ? 'נדרשת בדיקה' : 'אין — אין ספירה כפולה' },
    { k: 'כיסוי ניתוח המחירים', v: s.כיסוי_ניתוח_מחירים_אחוז + '%', d: 'מההוצאה במק״טים בני-השוואה', hint: 'יחידת מידה מדידה, או פיזור מחירים סביר' },
    { k: 'קודי מרכז-עלות', v: num(s.קודי_מרכז_עלות), d: 'מוחרגים מניתוחי מחיר' },
    { k: 'טיוטות שמוחרגות', v: num(s.טיוטות_שמוחרגות), d: 'סטטוס טיוטא' }
  ]);

  const g = EL('div', { class: 'grid2' });
  root.appendChild(g);
  const issues = [
    ['שורות עם מחיר יחידה אפס או שלילי', s.מחיר_אפס_או_שלילי, 'נכללות בסך ההוצאה, מוחרגות מכל ניתוח מחירים', k => !(M.up[k] > 0), 'warn'],
    ['שורות עם כמות אפס או שלילית', s.כמות_אפס_או_שלילית, 'מוחרגות מחישוב מחיר משוקלל ומכמויות', k => !(M.q[k] > 0), 'warn'],
    ['שורות עם סכום אפס או שלילי', s.סכום_אפס_או_שלילי, 'בדרך כלל שורות ביטול או התאמה', k => !(M.a[k] > 0), 'info'],
    ['הזמנות סגורות שנשארה בהן יתרה', s.סגורות_עם_יתרה, 'אי-התאמה בין הסטטוס ליתרה. מוחרגות מההתחייבויות הפתוחות כדי לא לנפח אותן', k => M.st[k] === M.statClosed && M.oq[k] > 0, 'crit'],
    ['יתרה לאספקה שלילית', s.יתרה_שלילית, 'אספקה מעבר להזמנה או תיקון. מוחרגת מההתחייבויות', k => M.oq[k] < 0, 'warn'],
    ['יתרה גדולה מהכמות שהוזמנה', s.יתרה_גדולה_מהכמות, 'אי-עקביות בנתון המקור', k => M.oq[k] > M.q[k], 'warn'],
    ['שורות ללא תאריך אספקה', s.ללא_תאריך_אספקה, 'לא ניתן לשבץ אותן בלוח האספקות הצפוי', k => M.dd[k] < 0, 'info'],
    ['תאריך אספקה לפני תאריך ההזמנה', s.אספקה_לפני_הזמנה, 'תאריך לא תקין. לא נפסל מהסכומים', k => M.dd[k] >= 0 && M.dd[k] < M.d[k], 'warn'],
    ['שורות של ספקים ללא סיווג', s.שורות_של_ספקים_ללא_סיווג, 'נכנסות לקטגוריה ״לא מסווג״ ולא נעלמות מהסכומים', k => !M.dims.supInfo[M.s[k]].typeDesc, 'warn'],
    ['שורות ללא סוג הזמנת רכש', s.ללא_סוג_הזמנה, 'מוצגות כ-(ללא סוג) בפילוחים', k => PTYP(M.pt[k]) === '(ללא סוג)', 'info']
  ];
  {
    const b = panel(g, 'בעיות שזוהו בנתונים', 'לחיצה על שורה מציגה את השורות עצמן');
    table(b, [
      { k: 'n', t: 'בעיה', w: true },
      { k: 'v', t: 'שורות', n: true, f: v => v ? num(v) : '<span class="down">0</span>' },
      { k: 'eff', t: 'ההשפעה על הניתוח', w: true },
      { k: 'sev', t: 'חומרה', f: v => `<span class="pill ${v === 'crit' ? 'high' : v === 'warn' ? 'medium' : 'wait'}">${v === 'crit' ? 'חמורה' : v === 'warn' ? 'בינונית' : 'לידיעה'}</span>` }
    ], issues.map(([n, v, eff, test, sev]) => ({ n, v, eff, sev, _t: test })),
    { all: true, sort: 1, name: 'בעיות נתונים', onRow: r => { if (r.v) drill(r.n, idxWhere(r._t, ALL())); } });
  }
  {
    const b = panel(g, 'מטבעות ושערי המרה', 'עמודת סכום (ILS) כבר מומרת במקור. השער המשתמע = סכום(ILS)/(כמות×מחיר)');
    const rows = M.dims.cur.map((cu, n) => {
      const v = [];
      let spend = 0, rowsN = 0;
      for (let k = 0; k < M.N; k++) {
        if (M.c[k] !== n) continue;
        rowsN++; spend += M.a[k];
        if (isFinite(M.fx[k])) v.push(M.fx[k]);
      }
      v.sort((a, b2) => a - b2);
      return { cur: cu, rows: rowsN, spend, fx: v.length ? v[Math.floor(v.length / 2)] : null };
    });
    table(b, [
      { k: 'cur', t: 'מטבע' }, { k: 'rows', t: 'שורות', n: true },
      { k: 'spend', t: 'הוצאה ₪', n: true, f: v => money(v) },
      { k: 'fx', t: 'שער משתמע (חציון)', n: true, f: v => v == null ? '—' : num(v, 4) }
    ], rows, { all: true, sort: 2, name: 'מטבעות' });
    b.appendChild(EL('p', { class: 'note', text: 'אין שורות שלא ניתן להמיר: לכל שורה יש סכום בשקלים במקור. השער המשתמע מוצג כבקרה — פיזור בתוך אותו מטבע נובע משערים שונים לפי מועד ההזמנה, וזה סביר.' }));
  }
  {
    const b = panel(g, 'כיסוי הניתוחים', 'איזה חלק מההוצאה כל ניתוח מכסה בפועל');
    const covOf = test => { let x = 0; for (let k = 0; k < M.N; k++) if (test(k)) x += M.a[k]; return +(x / tot * 100).toFixed(1); };
    const rows = [
      { n: 'סכומי הוצאה, דירוג ספקים ומק״טים, ABC, השוואה בין שנים', cov: 100, note: 'כל השורות' },
      { n: 'ניתוחי מחיר, פערים בין ספקים, התייקרויות', cov: s.כיסוי_ניתוח_מחירים_אחוז, note: 'רק מק״טים בני-השוואה' },
      { n: 'מחיר ממוצע משוקלל', cov: covOf(k => M.q[k] > 0 && M.u[k] === M.itemUnit[M.i[k]]), note: 'כמות חיובית ביחידת המידה העיקרית' },
      { n: 'התחייבויות פתוחות', cov: covOf(k => M.openStat[M.st[k]] && M.oq[k] > 0), note: 'שורות פתוחות עם יתרה' },
      { n: 'פילוח לפי קטגוריה', cov: covOf(k => !!M.dims.supInfo[M.s[k]].typeDesc), note: 'ספקים עם סיווג; השאר ב״לא מסווג״' },
      { n: 'מגמות ביקוש כמותיות', cov: covOf(k => MEASURABLE.has(UNIT(M.u[k]))), note: 'רק יחידות מידה מדידות' }
    ];
    table(b, [
      { k: 'n', t: 'ניתוח', w: true },
      { k: 'cov', t: 'כיסוי', n: true, f: v => `<span class="cellbar"><i style="width:${v}%"></i></span><span>${v}%</span>` },
      { k: 'note', t: 'מה נכלל', w: true }
    ], rows, { all: true, sort: 1, name: 'כיסוי' });
  }
  {
    const b = panel(g, 'מניעת ספירה כפולה', 'איך המערכת מוודאת שכל שקל נספר פעם אחת');
    kv(b, [
      ['מפתח ייחודי', `הזמנה + שורה + מק״ט — ${num(s.כפילות_הזמנה_שורה_מקט)} כפילויות`],
      ['בסיס הסכום', 'עמודת סכום (ILS) בלבד, לא כמות×מחיר, כדי לא לכפול המרות מטבע'],
      ['התחייבות פתוחה', 'חלק יחסי מאותה שורה, לא שורה נוספת'],
      ['אספקות וחשבוניות', 'אינן בקובץ — אין מה לכפול מולן'],
      ['טיוטות', `${num(s.טיוטות_שמוחרגות)} שורות מוחרגות כברירת מחדל, ניתן להחזיר בשורת הסינון`]
    ]);
    b.appendChild(EL('p', { class: 'note', text: 'כל ניתוח במערכת רץ על אותו מנוע סינון ועל אותה עמודת סכום, ולכן אין נתיב שבו שורה נספרת פעמיים.' }));
  }
  {
    const b = panel(g, 'שדות שאינם בקובץ', 'ניתוחים שלא ניתן לבצע, ומה נדרש כדי לבצע אותם');
    const miss = [
      ['מפעל / מחלקה / מרכז עלות', 'פילוח ההוצאה לפי יחידה ארגונית', 'עמודה עם קוד מרכז עלות בכל שורה'],
      ['קריטיות מק״ט לייצור', 'זיהוי מק״טים קריטיים בספק יחיד', 'סימון קריטיות ברשומת המק״ט'],
      ['חשבוניות ותשלומים', 'השוואת הזמנה לחשבונית ולתשלום בפועל', 'קובץ חשבוניות עם קישור להזמנה'],
      ['אספקות בפועל', 'מדידת עמידה במועדי אספקה', 'תנועות קבלה עם תאריך וכמות'],
      ['תנאי הסכם ומחירון', 'בדיקת מחיר מול הסכם', 'טבלת הסכמי מחיר לפי ספק ומק״ט'],
      ['מפרט טכני ומק״טים חלופיים', 'איחוד מק״טים דומים', 'שדה מפרט או קוד מק״ט חלופי'],
      ['תקציב', 'השוואת מימוש לתקציב', 'תקציב לפי קטגוריה — ניתן להזין ידנית במסך התחזית'],
      ['עלות תהליך הזמנה', 'חישוב חיסכון מאיחוד הזמנות במקום אומדן', 'עלות טיפול ממוצעת להזמנה']
    ];
    const tw = EL('div', { class: 'tblwrap' });
    tw.innerHTML = '<table><thead><tr><th>שדה חסר</th><th>מה לא ניתן לנתח</th><th>מה נדרש</th></tr></thead><tbody>' +
      miss.map(r => `<tr><td class="wrap">${esc(r[0])}</td><td class="wrap">${esc(r[1])}</td><td class="wrap">${esc(r[2])}</td></tr>`).join('') + '</tbody></table>';
    b.appendChild(tw);
  }

  const t = panel(root, 'מה המערכת מחשבת', 'כל מדד ואופן חישובו');
  const defs = [
    ['שווי רכש', 'סכום עמודת סכום (ILS) של השורות המסוננות. לא חשבוניות ולא אספקות.'],
    ['התחייבות פתוחה', 'סכום(ILS) × (יתרה לאספקה / כמות), רק בשורות בסטטוס שאינו סגורה ועם יתרה חיובית.'],
    ['מחיר ממוצע משוקלל', 'סך סכום(ILS) חלקי סך הכמות, ביחידת המידה העיקרית של המק״ט. לא ממוצע פשוט של מחירי שורות.'],
    ['מחיר ליחידה בשקלים', 'סכום(ILS) חלקי כמות — ניטרלי למטבע, בלי צורך בשער המרה.'],
    ['השפעת מחיר', '(מחיר נוכחי − מחיר בסיס) × הכמות שנרכשה בתקופה הנוכחית.'],
    ['השפעת כמות', '(כמות נוכחית − כמות בסיס) × מחיר הבסיס.'],
    ['פער מחיר בין ספקים', 'מחיר משוקלל לכל ספק, ברמת מק״ט ויחידת מידה. נדרשים שני ספקים עם 2 הזמנות ומעלה.'],
    ['חיסכון מחושב', '(מחיר הספק − המחיר הטוב שהושג בפועל) × הכמות שנרכשה ממנו. אפס אם שלילי.'],
    ['חיסכון באומדן', 'אחוז מוצהר מהיקף המק״ט או עלות תהליך מוצהרת להזמנה. מסומן במפורש כאומדן.'],
    ['מק״ט בר-השוואה', 'יחידת מידה מדידה (KG/T/LT/M/M3/HR), או יחידה אחרת עם פיזור מחירים עד פי 5 ולפחות 3 תצפיות.'],
    ['קוד מרכז עלות', 'יחידה שאינה מדידה, פיזור מחירים מעל פי 10 ולפחות 5 תצפיות. מוחרג מניתוחי מחיר.'],
    ['ABC', 'מיון יורד לפי הוצאה וסיווג לפי אחוז מצטבר. ספים 80% ו-95%, ניתנים לשינוי.'],
    ['HHI', 'סכום ריבועי נתחי הספקים באחוזים. מעל 2,500 — ריכוזי מאוד.'],
    ['תקופה מקבילה', 'אותם חודשים וימים בשנה הקודמת, עם אותם פילטרים. לא זמין לטווח ארוך משנה.'],
    ['תחזית', 'מגמה קווית על 24 החודשים האחרונים × מקדם עונתיות חודשי. לא תקציב ולא התחייבות.']
  ];
  const tw2 = EL('div', { class: 'tblwrap' });
  tw2.innerHTML = '<table><thead><tr><th>מדד</th><th>אופן החישוב</th></tr></thead><tbody>' +
    defs.map(r => `<tr><td>${esc(r[0])}</td><td class="wrap">${esc(r[1])}</td></tr>`).join('') + '</tbody></table>';
  t.appendChild(tw2);
}

/* ======================= טעינת נתונים ======================= */
const FIELDS = [
  { k: 'sid', t: 'מספר ספק', req: true, alias: ["מס' ספק", 'מס.ספק', 'מספר ספק', 'קוד ספק'] },
  { k: 'sname', t: 'שם ספק', alias: ['שם ספק'] },
  { k: 'std', t: 'תאור סוג ספק', alias: ['תאור סוג ספק', 'סוג ספק'] },
  { k: 'po', t: 'הזמנת רכש', req: true, alias: ['הזמנת רכש', 'מספר הזמנה'] },
  { k: 'line', t: 'שורה בהזמנה', alias: ['שורה בהזמנה', 'שורה'] },
  { k: 'odate', t: 'תאריך ההזמנה', req: true, alias: ['תאריך ההזמנה', 'תאריך הזמנה'] },
  { k: 'status', t: 'סטטוס הזמנה', alias: ['סטטוס הזמנה', 'סטטוס'] },
  { k: 'ptyp', t: 'תאור סוג הזמנת רכש', alias: ['תאור סוג הזמנת רכש', 'סוג הזמנה'] },
  { k: 'item', t: 'מק״ט', req: true, alias: ["מק'ט", 'מקט', 'מק״ט'] },
  { k: 'idesc', t: 'תאור מוצר', alias: ['תאור מוצר', 'תיאור מוצר'] },
  { k: 'qty', t: 'כמות', req: true, alias: ['כמות'] },
  { k: 'unit', t: 'יחידת מידה', alias: ["יח'", 'יחידה', 'יחידת מידה'] },
  { k: 'cprice', t: 'מחיר ליחידה', req: true, alias: ['מחיר ליחידה', 'מחיר יחידה'] },
  { k: 'cur', t: 'מטבע', alias: ['מטבע ההזמנה', 'מטבע'] },
  { k: 'amt', t: 'סכום (ILS)', req: true, alias: ['סכום (ils)', 'סכום בשקלים', 'סכום'] },
  { k: 'ddate', t: 'תאריך אספקה', alias: ['ת. אספקה', 'תאריך אספקה'] },
  { k: 'openq', t: 'יתרה לאספקה', alias: ['יתרה לאספקה', 'יתרה'] },
  { k: 'buyer', t: 'קניין / לטיפול', alias: ['לטיפול', 'קניין'] }
];
const norm = s => String(s ?? '').trim().toLowerCase().replace(/[״"'`]/g, '').replace(/\s+/g, ' ');

/* סדר המועמדים הוא שקובע, לא סדר העמודות בקובץ. בלי זה, גיליון שמכיל גם
   ״סוג ספק״ (הקוד) וגם ״תאור סוג ספק״ (הטקסט) היה נתפס לפי העמודה
   המוקדמת יותר, והסיווג היה מתמלא במספרים. */
export function autoMap(headers) {
  const out = {}, used = new Set();
  FIELDS.forEach(f => {
    const cands = [norm(f.t), ...f.alias.map(norm)];
    let hit = -1;
    for (const c of cands) {
      hit = headers.findIndex((h, n) => !used.has(n) && norm(h) === c);
      if (hit >= 0) break;
    }
    if (hit < 0) for (const c of cands) {
      if (c.length <= 3) continue;
      hit = headers.findIndex((h, n) => !used.has(n) && norm(h).includes(c));
      if (hit >= 0) break;
    }
    if (hit >= 0) { out[f.k] = hit; used.add(hit); }
  });
  return out;
}
const EPOCH_ISO = '2014-01-01';
const EPOCH_MS = Date.parse(EPOCH_ISO + 'T00:00:00Z');
const dnum = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - EPOCH_MS) / 864e5);
function xlDate(v) {
  if (v instanceof Date) return dnum(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
    return dnum(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/);
    if (m) {
      let [, a, b, c] = m.map(Number), y, mo, d;
      if (a > 31) { y = a; mo = b; d = c; } else { d = a; mo = b; y = c < 100 ? 2000 + c : c; }
      return dnum(y, mo, d);
    }
  }
  return -1;
}
const numOf = v => {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(/,/g, ''));
  return isFinite(n) ? n : 0;
};

export function ingest(rowsIn, map, fileName) {
  const errs = [];
  const dims = { sup: [], supInfo: [], item: [], itemDesc: [], po: [], buyer: [], status: [], potype: [], unit: [], cur: [] };
  const ix = { sup: new Map(), item: new Map(), po: new Map(), buyer: new Map(), status: new Map(), potype: new Map(), unit: new Map(), cur: new Map() };
  const push = (d, m, v) => { v = v === '' || v == null ? '' : String(v).trim(); if (m.has(v)) return m.get(v); const n = dims[d].length; dims[d].push(v); m.set(v, n); return n; };
  const R = { s: [], i: [], p: [], b: [], st: [], pt: [], u: [], c: [], ln: [], d: [], dd: [], q: [], up: [], a: [], oq: [] };
  const seen = new Set();
  let dup = 0, badDate = 0;
  const supMeta = new Map();
  rowsIn.forEach((r, n) => {
    const g = k => map[k] == null ? undefined : r[map[k]];
    const sid = String(g('sid') ?? '').trim(), item = String(g('item') ?? '').trim(), po = String(g('po') ?? '').trim();
    const d = xlDate(g('odate'));
    if (!sid || !item || !po) { errs.push({ row: n + 2, why: 'חסר מספר ספק, מק״ט או מספר הזמנה' }); return; }
    if (d < 0) { badDate++; errs.push({ row: n + 2, why: 'תאריך הזמנה לא תקין: ' + String(g('odate')) }); return; }
    const ln = Math.round(numOf(g('line'))) || 1;
    const key = po + '|' + ln + '|' + item;
    if (seen.has(key)) { dup++; return; }
    seen.add(key);
    const si = push('sup', ix.sup, sid);
    if (!supMeta.has(si)) supMeta.set(si, { name: String(g('sname') ?? sid).trim(), typeDesc: String(g('std') ?? '').trim() });
    const ii = push('item', ix.item, item);
    if (!dims.itemDesc[ii]) dims.itemDesc[ii] = String(g('idesc') ?? '').trim();
    R.s.push(si); R.i.push(ii); R.p.push(push('po', ix.po, po));
    R.b.push(push('buyer', ix.buyer, g('buyer') ?? '—'));
    R.st.push(push('status', ix.status, g('status') ?? '—'));
    R.pt.push(push('potype', ix.potype, String(g('ptyp') ?? '').trim() || '(ללא סוג)'));
    R.u.push(push('unit', ix.unit, String(g('unit') ?? '').trim() || 'EAC'));
    R.c.push(push('cur', ix.cur, String(g('cur') ?? '').trim() || 'ILS'));
    R.ln.push(ln); R.d.push(d); R.dd.push(xlDate(g('ddate')));
    R.q.push(numOf(g('qty'))); R.up.push(numOf(g('cprice'))); R.a.push(numOf(g('amt'))); R.oq.push(numOf(g('openq')));
  });
  if (!R.s.length) return { ok: false, errs, msg: 'לא נקלטה אף שורה תקינה.' };
  dims.sup.forEach((id, n) => {
    const mt = supMeta.get(n) || {};
    dims.supInfo.push({ name: mt.name || id, typeCode: '', typeDesc: mt.typeDesc || '', status: '', terms: '', opened: -1, city: '', country: '', classDesc: '' });
  });
  dims.itemDesc = dims.item.map((c, n) => dims.itemDesc[n] || '');
  return {
    ok: true, errs, dup, badDate,
    payload: {
      meta: {
        epoch: EPOCH_ISO, rows: R.s.length, builtAt: new Date().toISOString().slice(0, 19),
        sourceFile: fileName, minDate: Math.min(...R.d), maxDate: Math.max(...R.d),
        amountNote: 'סכום בשקלים נלקח מהעמודה שמופתה כ-סכום (ILS).',
        openNote: 'יתרה לאספקה מטופלת ככמות; השווי = סכום×(יתרה/כמות).'
      },
      dims, rows: R
    }
  };
}

/* מערך של 42 אלף שורות שוקל כ-3.5MB כ-JSON, קרוב לתקרת גוף הבקשה של
   פונקציה בודדת. דוחסים בדפדפן ושולחים כ-650KB; השרת פורס. אם הדפדפן
   אינו תומך בדחיסה, נשלח כרגיל. */
async function putDataset(payload) {
  const json = JSON.stringify(payload);
  if (typeof CompressionStream === 'function') {
    try {
      const gz = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = await new Response(gz).arrayBuffer();
      const r = await fetch('/api/spend', {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream', 'x-spend-gzip': '1' },
        body: buf
      });
      const body = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, body };
    } catch { /* נופלים לשליחה רגילה */ }
  }
  const r = await fetch('/api/spend', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: json });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

let XLSXp = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  XLSXp ||= new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    el.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error('הספרייה נטענה אך אינה זמינה'));
    el.onerror = () => rej(new Error('טעינת מנוע האקסל נכשלה'));
    document.head.appendChild(el);
  });
  return XLSXp;
}

export function viewLoad(root, idx, ctx) {
  const cur = panel(root, 'הנתונים שנטענים כרגע');
  kv(cur, [
    ['מקור', esc(M.meta.sourceFile || '—')],
    ['שורות', num(M.N)],
    ['תקופה', `${dstr(M.minD)} – ${dstr(M.maxD)}`],
    ['הזמנות / ספקים / מק״טים', `${num(M.dims.po.length)} / ${num(M.dims.sup.length)} / ${num(M.dims.item.length)}`],
    ['סך הוצאה', money((() => { let s = 0; for (let k = 0; k < M.N; k++) s += M.a[k]; return s; })())],
    ['נקלט לשרת', esc(String(M.meta.builtAt || '').replace('T', ' '))]
  ]);

  const up = panel(root, 'העלאת קובץ חדש', 'XLSX או CSV · הקובץ נקרא בדפדפן, ורק התוצאה הדחוסה נשמרת בשרת');
  const drop = EL('div', { class: 'dropzone' });
  drop.innerHTML = '<b>גרור לכאן קובץ אקסל</b><span>או</span>';
  const fi = EL('input', { type: 'file', accept: '.xlsx,.xlsm,.xls,.csv', hidden: 'hidden' });
  const pick = EL('button', { class: 'btn', text: 'בחר קובץ', onclick: () => fi.click() });
  drop.append(pick, fi);
  up.appendChild(drop);
  const out = EL('div');
  up.appendChild(out);

  ['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', ev => { const f = ev.dataTransfer.files[0]; if (f) read(f); });
  fi.onchange = () => { if (fi.files[0]) read(fi.files[0]); };

  async function read(file) {
    out.innerHTML = '<p class="note"><span class="spin"></span> קורא את הקובץ…</p>';
    let wb;
    try {
      const XLSX = await loadXlsx();
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    } catch (e) { out.innerHTML = `<p class="banner warn">לא ניתן לקרוא את הקובץ: ${esc(e.message || e)}</p>`; return; }
    out.innerHTML = '';
    const pickS = panel(out, 'גיליון', 'בחר את הגיליון שמכיל את שורות ההזמנה');
    const sel = EL('select', { class: 'inp', style: 'width:auto' });
    wb.SheetNames.forEach(s => sel.appendChild(EL('option', { text: s, value: s, selected: /data|הזמנ|שורות/i.test(s) ? 'selected' : null })));
    pickS.appendChild(sel);
    const step = EL('div');
    out.appendChild(step);

    const load = async () => {
      const XLSX = await loadXlsx();
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sel.value], { header: 1, raw: true, blankrows: false, defval: '' });
      step.innerHTML = '';
      if (!aoa.length) { step.innerHTML = '<p class="banner warn">הגיליון ריק.</p>'; return; }
      let hr = 0;
      for (let n = 0; n < Math.min(8, aoa.length); n++) if (aoa[n].filter(x => String(x).trim()).length >= aoa[hr].filter(x => String(x).trim()).length) hr = n;
      const headers = aoa[hr].map(x => String(x ?? '').trim());
      const body = aoa.slice(hr + 1).filter(r => r.some(x => String(x).trim() !== ''));
      const map = autoMap(headers);

      const mp = panel(step, 'מיפוי עמודות', `זוהו ${num(headers.length)} עמודות ו-${num(body.length)} שורות. תקן כל מיפוי שלא זוהה נכון.`);
      const tw = EL('div', { class: 'tblwrap' });
      tw.innerHTML = '<table><thead><tr><th>שדה במערכת</th><th>עמודה בקובץ</th><th>דוגמה</th></tr></thead><tbody>' +
        FIELDS.map(f => `<tr><td>${esc(f.t)}${f.req ? ' <span class="pill high">חובה</span>' : ''}</td>
          <td><select class="inp" style="width:auto;max-width:220px" data-f="${f.k}"><option value="">— לא ממופה —</option>${
            headers.map((h, n) => `<option value="${n}"${map[f.k] === n ? ' selected' : ''}>${esc(h || 'עמודה ' + (n + 1))}</option>`).join('')}</select></td>
          <td class="wrap" id="ex_${f.k}">${esc(map[f.k] != null && body[0] ? String(body[0][map[f.k]] ?? '') : '')}</td></tr>`).join('') + '</tbody></table>';
      mp.appendChild(tw);
      tw.querySelectorAll('select[data-f]').forEach(s => s.onchange = () => {
        const n = s.value === '' ? null : +s.value;
        const cell = document.getElementById('ex_' + s.dataset.f);
        if (cell) cell.textContent = n != null && body[0] ? String(body[0][n] ?? '') : '';
      });

      const act = EL('div', { class: 'inline-form', style: 'margin-top:12px' });
      const go = EL('button', { class: 'btn primary', text: 'קלוט ושמור בשרת', onclick: async () => {
        const mm = {};
        tw.querySelectorAll('select[data-f]').forEach(s => { if (s.value !== '') mm[s.dataset.f] = +s.value; });
        const miss = FIELDS.filter(f => f.req && mm[f.k] == null);
        if (miss.length) { toast('חסר מיפוי לשדות חובה: ' + miss.map(f => f.t).join(', ')); return; }
        go.disabled = true; go.textContent = 'קולט…';
        const res = ingest(body, mm, file.name);
        if (!res.ok) { go.disabled = false; go.textContent = 'קלוט ושמור בשרת'; step.appendChild(EL('p', { class: 'banner warn', text: res.msg })); return; }
        const prevRows = M.N, prevSrc = M.meta.sourceFile;
        const r = await putDataset(res.payload);
        go.disabled = false; go.textContent = 'קלוט ושמור בשרת';
        if (!r.ok) { step.appendChild(EL('p', { class: 'banner warn', text: 'השמירה בשרת נכשלה: ' + esc(r.body?.error || r.status) })); return; }
        clearCache();
        buildModel(res.payload);
        resetF();
        clearAnalyticsCache();
        const rep = panel(step, 'דוח קליטה');
        kv(rep, [
          ['קובץ', esc(file.name)], ['שורות שנקלטו', num(M.N)], ['שורות שנדחו', num(res.errs.length)],
          ['כפילויות שהוסרו', `${num(res.dup)} <span class="sub">מפתח: הזמנה + שורה + מק״ט</span>`],
          ['תאריכים לא תקינים', num(res.badDate)],
          ['התקופה שזוהתה', `${dstr(M.minD)} – ${dstr(M.maxD)}`],
          ['סך ההוצאה', money((() => { let s = 0; for (let k = 0; k < M.N; k++) s += M.a[k]; return s; })())],
          ['הוחלף', `${esc(prevSrc || '—')} (${num(prevRows)} שורות)`]
        ]);
        if (res.errs.length) {
          const e = panel(rep, 'שורות שנפסלו והסיבה');
          table(e, [{ k: 'row', t: 'שורה בקובץ', n: true }, { k: 'why', t: 'סיבת הפסילה', w: true }], res.errs.slice(0, 500), { size: 10, name: 'שגיאות קליטה' });
        }
        rep.appendChild(EL('p', { class: 'banner', text: 'כל הניתוחים חושבו מחדש. אם הקובץ הוא צילום מצב של הזמנות פתוחות בלבד — המערכת מתייחסת לכל שורה כשורת הזמנה, ולכן טעינה כזו מחליפה את התמונה המלאה ואינה מתווספת אליה.' }));
        toast('נקלטו ' + num(M.N) + ' שורות');
        setTimeout(() => ctx.go('exec'), 700);
      } });
      act.append(go, EL('button', { class: 'btn', text: 'בטל', onclick: () => { out.innerHTML = ''; } }));
      mp.appendChild(act);

      const pv = panel(step, 'תצוגה מקדימה', '5 השורות הראשונות כפי שהן בקובץ');
      const tw2 = EL('div', { class: 'tblwrap' });
      tw2.innerHTML = '<table><thead><tr>' + headers.map(h => `<th>${esc(h || '—')}</th>`).join('') + '</tr></thead><tbody>' +
        body.slice(0, 5).map(r => '<tr>' + headers.map((_, n) => `<td>${esc(String(r[n] ?? ''))}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
      pv.appendChild(tw2);
    };
    sel.onchange = load;
    load();
  }

  const notes = panel(root, 'כללי הקליטה');
  notes.appendChild(EL('ul', {}, [
    'מיפוי אוטומטי לפי שמות העמודות, עם אפשרות לתקן כל שדה לפני הקליטה.',
    'מפתח ייחודי לשורה: הזמנת רכש + שורה בהזמנה + מק״ט. שורה שחוזרת מוסרת, כדי למנוע ספירה כפולה בטעינה חוזרת.',
    'התקופה מזוהה אוטומטית מתאריכי ההזמנה שבקובץ.',
    'שורות ללא ספק, מק״ט, הזמנה או תאריך תקין נפסלות ומוצגות בדוח הקליטה עם הסיבה.',
    'סכום ההוצאה נלקח מהעמודה שמופתה כ-סכום (ILS) ולא מחושב מכמות×מחיר, כדי לא לכפול המרות מטבע.',
    'הנתונים נשמרים במסד של האתר ולא בקובץ בתוך הקוד — הם מוגשים רק למי שמחובר.',
    'מפת הקטגוריות נשמרת בדפדפן. אחראי וסטטוס של הזדמנויות נשמרים בשרת ומשותפים לכל המשתמשים.'
  ].map(x => `<li>${esc(x)}</li>`).join('')));
}
