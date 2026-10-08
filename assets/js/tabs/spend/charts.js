// שכבת הגרפים. ECharts נטענת על פי דרישה בדיוק כמו שמנוע האקסל נטען
// ב-core/upload.js — אין טעם להוריד ספריית גרפים למי שלא פתח את SPEND.
//
// הצבעים נקראים ממשתני ה-CSS של האתר בכל בנייה מחדש, ולכן מעבר בין מצב
// בהיר לכהה מצייר את הגרפים בפלטה הנכונה בלי קוד נוסף.

import { moneyC, money, price, num } from './model.js';

// שלושה מקורות ולא אחד. הגרסה שהייתה כאן קודם, 5.5.1, פשוט אינה קיימת
// ב-cdnjs (יש 5.5.0 ו-5.5.1-rc בלבד), ולכן כל גרף במסך נשאר עם חיווי
// טעינה בלי שום הודעת שגיאה. כתובת אחת שבורה לא תשתק שוב את כל המסכים.
const CDNS = [
  'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js',
  'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js',
  'https://unpkg.com/echarts@5.5.0/dist/echarts.min.js'
];
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(src));
    document.head.appendChild(el);
  });
}

export function loadECharts() {
  if (window.echarts) return Promise.resolve(window.echarts);
  loading ||= (async () => {
    for (const src of CDNS) {
      try {
        await loadScript(src);
        if (window.echarts) return window.echarts;
      } catch { /* המקור הבא */ }
    }
    loading = null;   // כישלון אינו סופי: ריענון או מסך אחר ינסו שוב
    throw new Error('טעינת ספריית הגרפים נכשלה מכל המקורות');
  })();
  return loading;
}

export const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const pal = () => [cssv('--c1'), cssv('--c2'), cssv('--c3'), cssv('--c4'), cssv('--c5'), cssv('--c6'), cssv('--violet'), cssv('--warn')];

const CH = [];
export function disposeCharts() {
  while (CH.length) { const c = CH.pop(); try { c.dispose(); } catch {} }
}
function track(c, bag) { (bag || CH).push(c); return c; }

let rzTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(rzTimer);
  rzTimer = setTimeout(() => CH.forEach(c => { try { c.resize(); } catch {} }), 140);
});
export function resizeCharts() { CH.forEach(c => { try { c.resize(); } catch {} }); }

function base() {
  const fg = cssv('--ink'), mut = cssv('--ink3'), line = cssv('--line'), surf = cssv('--surface');
  return {
    animationDuration: 300,
    textStyle: { fontFamily: 'Heebo, "Segoe UI", Arial, sans-serif', color: fg },
    color: pal(),
    grid: { left: 10, right: 14, top: 26, bottom: 6, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: surf, borderColor: line, textStyle: { color: fg, fontSize: 12.5 },
      extraCssText: 'direction:rtl;box-shadow:0 6px 22px rgba(0,0,0,.18);border-radius:8px'
    },
    legend: { textStyle: { color: mut, fontSize: 11.5 }, itemWidth: 12, itemHeight: 7, top: 0, right: 0 },
    xAxis: { axisLine: { lineStyle: { color: line } }, axisLabel: { color: mut, fontSize: 11 }, axisTick: { show: false }, splitLine: { show: false } },
    yAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: mut, fontSize: 11 }, splitLine: { lineStyle: { color: line, type: 'dashed' } } }
  };
}
export const axMoney = { axisLabel: { formatter: v => moneyC(v) } };

/* מחזיר את הקופסה מיד ומצייר כשהספרייה מוכנה, כדי שהמסך לא יחכה לרשת. */
export function box(parent, height, cls) {
  const d = document.createElement('div');
  d.className = 'chartbox' + (cls ? ' ' + cls : '');
  if (height) d.style.height = height;
  d.innerHTML = '<span class="spin"></span>';
  parent.appendChild(d);
  return d;
}

export async function draw(el, opt, onClick, bag) {
  let echarts;
  try { echarts = await loadECharts(); }
  catch (e) { el.innerHTML = `<span class="chartfail">${e.message}</span>`; return null; }
  if (!el.isConnected) return null;
  el.innerHTML = '';
  const c = echarts.init(el, null, { renderer: 'canvas' });
  c.setOption(echarts.util.merge(base(), opt, true), true);
  if (onClick) c.on('click', onClick);
  track(c, bag);
  return c;
}

/* ---------- טיפוסים נפוצים ---------- */
export function hbar(parent, rows, opt = {}) {
  const el = box(parent, opt.height || Math.max(170, rows.length * 27 + 46) + 'px');
  draw(el, {
    grid: { left: 6, right: 54, top: 8, bottom: 4, containLabel: true },
    tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br><b>${opt.fmt ? opt.fmt(p[0].value) : money(p[0].value)}</b>` },
    xAxis: { type: 'value', ...(opt.noMoney ? {} : axMoney), splitLine: { lineStyle: { color: cssv('--line'), type: 'dashed' } } },
    yAxis: { type: 'category', inverse: true, data: rows.map(r => r[0]), axisLabel: { width: opt.labelW || 150, overflow: 'truncate', fontSize: 11.5 } },
    series: [{
      type: 'bar', data: rows.map(r => r[1]), barMaxWidth: 16,
      itemStyle: { borderRadius: [0, 4, 4, 0], color: opt.color || cssv('--accent') },
      label: { show: true, position: 'right', fontSize: 11, color: cssv('--ink2'), formatter: p => opt.fmt ? opt.fmt(p.value) : moneyC(p.value) }
    }]
  }, opt.onClick ? e => opt.onClick(rows[e.dataIndex]) : null, opt.bag);
  return el;
}

export function lines(parent, x, series, opt = {}) {
  const el = box(parent, opt.height || '280px');
  draw(el, {
    xAxis: { type: 'category', data: x, axisLabel: { fontSize: 10.5, rotate: x.length > 16 ? 45 : 0 } },
    yAxis: { type: 'value', ...(opt.noMoney ? {} : axMoney) },
    legend: { show: series.length > 1 },
    series: series.map(s => ({
      name: s.name, type: s.type || 'line', data: s.data, smooth: s.smooth !== false,
      symbol: 'circle', symbolSize: 5, lineStyle: { width: 2.2, color: s.color, type: s.dash ? 'dashed' : 'solid' },
      areaStyle: s.area ? { opacity: .13 } : undefined, barMaxWidth: 30,
      itemStyle: { color: s.color, borderRadius: s.type === 'bar' ? [3, 3, 0, 0] : 0 },
      yAxisIndex: s.axis || 0, showSymbol: s.showSymbol !== false, connectNulls: false
    }))
  }, opt.onClick, opt.bag);
  return el;
}

export function pareto(parent, names, vals, cum, opt = {}) {
  const el = box(parent, opt.height || '320px');
  draw(el, {
    tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br>${money(p[0].value)}<br>מצטבר <b>${p[1] ? p[1].value.toFixed(1) : '—'}%</b>` },
    xAxis: { type: 'category', data: names, axisLabel: { show: false } },
    yAxis: [{ type: 'value', ...axMoney }, { type: 'value', max: 100, axisLabel: { formatter: v => v + '%' }, splitLine: { show: false } }],
    series: [
      { name: 'הוצאה', type: 'bar', data: vals, itemStyle: { color: opt.colorFn || cssv('--accent') } },
      {
        name: 'מצטבר', type: 'line', yAxisIndex: 1, data: cum, showSymbol: false,
        lineStyle: { color: cssv('--c5'), width: 2 },
        markLine: opt.marks ? { silent: true, symbol: 'none', data: opt.marks } : undefined
      }
    ]
  }, opt.onClick, opt.bag);
  return el;
}

export function scatter(parent, points, opt = {}) {
  const el = box(parent, opt.height || '320px');
  draw(el, {
    tooltip: { trigger: 'item', formatter: opt.fmt },
    xAxis: { type: opt.logX ? 'log' : 'value', ...(opt.xMoney ? axMoney : {}), splitLine: { lineStyle: { color: cssv('--line'), type: 'dashed' } }, name: opt.xName, nameTextStyle: { color: cssv('--ink3'), fontSize: 10.5 } },
    yAxis: { type: 'value', ...(opt.yMoney ? axMoney : {}), axisLabel: opt.yPct ? { formatter: v => v + '%' } : undefined, name: opt.yName, nameTextStyle: { color: cssv('--ink3'), fontSize: 10.5 } },
    series: [{
      type: 'scatter', data: points, symbolSize: opt.size || 8,
      itemStyle: { opacity: .72, color: opt.color },
      markLine: opt.cross ? { silent: true, symbol: 'none', lineStyle: { color: cssv('--ink3') }, data: [{ xAxis: 0 }, { yAxis: 0 }] } : undefined
    }]
  }, opt.onClick, opt.bag);
  return el;
}

export function heatmap(parent, xs, ys, data, opt = {}) {
  const el = box(parent, opt.height || Math.max(220, ys.length * 24 + 80) + 'px');
  const mx = Math.max(1, ...data.map(d => d[2]));
  draw(el, {
    tooltip: { position: 'top', formatter: p => `${ys[p.data[1]]}<br>${xs[p.data[0]]}<br><b>${money(p.data[2])}</b>` },
    grid: { left: 6, right: 12, top: 8, bottom: 52, containLabel: true },
    xAxis: { type: 'category', data: xs, splitArea: { show: true }, axisLabel: { fontSize: 10, rotate: xs.length > 16 ? 45 : 0 } },
    yAxis: { type: 'category', data: ys, splitArea: { show: true }, axisLabel: { fontSize: 10.5, width: 130, overflow: 'truncate' } },
    visualMap: {
      min: 0, max: mx, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      itemWidth: 12, itemHeight: 110, textStyle: { color: cssv('--ink3'), fontSize: 10 },
      formatter: v => moneyC(v),
      inRange: { color: [cssv('--surface2'), cssv('--accent-soft'), cssv('--accent'), cssv('--ink')] }
    },
    series: [{ type: 'heatmap', data, progressive: 2000, itemStyle: { borderColor: cssv('--surface'), borderWidth: 1 } }]
  }, opt.onClick, opt.bag);
  return el;
}

/* מפל: מראה איך הגיעו מסכום בסיס לסכום סופי דרך שלבי ביניים */
export function waterfall(parent, labels, steps, start, end, opt = {}) {
  const el = box(parent, opt.height || '300px');
  const pad = [0];
  let run = start;
  for (const s of steps) { pad.push(Math.min(run, run + s)); run += s; }
  pad.push(0);
  draw(el, {
    tooltip: { trigger: 'axis', formatter: p => { const i = p[0].dataIndex; const v = i === 0 ? start : i === labels.length - 1 ? end : steps[i - 1]; return `${p[0].name}<br><b>${money(v)}</b>`; } },
    xAxis: { type: 'category', data: labels, axisLabel: { interval: 0, fontSize: 10.5, width: 86, overflow: 'break' } },
    yAxis: { type: 'value', ...axMoney },
    series: [
      { name: 'בסיס', type: 'bar', stack: 'w', itemStyle: { color: 'transparent' }, data: pad, tooltip: { show: false } },
      {
        name: 'שינוי', type: 'bar', stack: 'w', barMaxWidth: 56,
        data: [
          { value: start, itemStyle: { color: cssv('--ink3') } },
          ...steps.map(s => ({ value: Math.abs(s), itemStyle: { color: s > 0 ? cssv('--up') : cssv('--down') } })),
          { value: end, itemStyle: { color: cssv('--accent') } }
        ],
        label: {
          show: true, position: 'top', fontSize: 10.5, color: cssv('--ink2'),
          formatter: p => moneyC(p.dataIndex === 0 ? start : p.dataIndex === labels.length - 1 ? end : steps[p.dataIndex - 1])
        }
      }
    ]
  }, null, opt.bag);
  return el;
}

export function donut(parent, data, opt = {}) {
  const el = box(parent, opt.height || '300px');
  draw(el, {
    tooltip: { trigger: 'item', formatter: p => `${p.name}<br>${money(p.value)}<br>${p.percent}%` },
    legend: { show: true, bottom: 0, right: 'center' },
    xAxis: { show: false }, yAxis: { show: false }, grid: { show: false },
    series: [{
      type: 'pie', radius: ['46%', '72%'], center: ['50%', '45%'],
      label: { formatter: p => `${p.name}\n${p.percent}%`, fontSize: 12, color: cssv('--ink') },
      data
    }]
  }, opt.onClick, opt.bag);
  return el;
}
