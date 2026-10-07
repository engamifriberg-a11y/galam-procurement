// חישוב הסדרות: ערך אחרון, שינויים לפי חלונות זמן, ותנודתיות.
// מופרד מהנתיב כדי שגם מודול הניתוח וגם ה-AI יעבדו על אותם מספרים בדיוק.
import { readFile } from 'node:fs/promises';
import { hasDb, history } from './db.js';
import { collect } from './providers.js';

let CATALOG = null;
export async function catalog() {
  CATALOG ||= JSON.parse(await readFile(new URL('../../assets/data/series.json', import.meta.url), 'utf8')).series;
  return CATALOG;
}

export const pctChange = (a, b) => (a == null || b == null || !b) ? null : (a - b) / b * 100;

export function nearest(points, daysAgo) {
  if (!points.length) return null;
  const target = Date.now() - daysAgo * 864e5;
  let best = null, bestGap = Infinity;
  for (const p of points) {
    const gap = Math.abs(new Date(p.d).getTime() - target);
    if (gap < bestGap) { bestGap = gap; best = p; }
  }
  return bestGap <= daysAgo * 864e5 * 0.6 + 10 * 864e5 ? best : null;
}

// סטיית תקן שנתית של תשואות יומיות
export function volatility(points) {
  const recent = points.slice(-90);
  if (recent.length < 8) return null;
  const rets = [];
  for (let i = 1; i < recent.length; i++) if (recent[i - 1].v > 0) rets.push(Math.log(recent[i].v / recent[i - 1].v));
  if (rets.length < 6) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varc = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(varc) * Math.sqrt(252) * 100;
}

export async function buildSeries({ live = false } = {}) {
  const defs = await catalog();
  let hist = {};
  if (hasDb()) {
    try { hist = await history(defs.map(d => d.id), 400); } catch { hist = {}; }
  }
  if (!hasDb() || live) {
    const { points } = await collect(defs);
    for (const p of points) (hist[p.series_id] ||= []).push({ d: p.d, v: p.value, src: p.source, tier: p.tier });
  }
  return defs.map(def => {
    const pts = (hist[def.id] || []).filter(p => Number.isFinite(p.v));
    const last = pts[pts.length - 1] || null;
    const at = n => nearest(pts, n)?.v ?? null;
    return {
      ...def,
      last: last ? last.v : null,
      lastDate: last ? last.d : null,
      source: last ? last.src : null,
      points: pts.length,
      chg: { d1: pctChange(last?.v, at(1)), d7: pctChange(last?.v, at(7)), d30: pctChange(last?.v, at(30)),
             d90: pctChange(last?.v, at(90)), d365: pctChange(last?.v, at(365)) },
      vol90: volatility(pts),
      hist: pts.slice(-180).map(p => [p.d, p.v])
    };
  });
}
