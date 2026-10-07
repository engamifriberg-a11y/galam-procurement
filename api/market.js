// GET  /api/market                → כל הסדרות: ערך אחרון, שינויים, תנודתיות, היסטוריה
// GET  /api/market?refresh=1      → מרענן קודם מהמקורות החיים ואז מחזיר
// PUT  /api/market?series=pl.pp   → הזנת ערך לאינדקס מנוהל  { value, date?, source? }
import { readFile } from 'node:fs/promises';
import { hasDb, putPoints, history } from './_lib/db.js';
import { collect } from './_lib/providers.js';

let CATALOG = null;
async function catalog() {
  CATALOG ||= JSON.parse(await readFile(new URL('../assets/data/series.json', import.meta.url), 'utf8')).series;
  return CATALOG;
}

const pctChange = (a, b) => (a == null || b == null || !b) ? null : (a - b) / b * 100;

function nearest(points, daysAgo) {
  if (!points.length) return null;
  const target = Date.now() - daysAgo * 864e5;
  let best = null, bestGap = Infinity;
  for (const p of points) {
    const gap = Math.abs(new Date(p.d).getTime() - target);
    if (gap < bestGap) { bestGap = gap; best = p; }
  }
  return bestGap <= daysAgo * 864e5 * 0.6 + 10 * 864e5 ? best : null;
}

// סטיית תקן שנתית של תשואות יומיות — מדד התנודתיות
function volatility(points) {
  const recent = points.slice(-90);
  if (recent.length < 8) return null;
  const rets = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].v > 0) rets.push(Math.log(recent[i].v / recent[i - 1].v));
  }
  if (rets.length < 6) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varc = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(varc) * Math.sqrt(252) * 100;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const defs = await catalog();

  try {
    if (req.method === 'PUT') {
      if (!hasDb()) return res.status(503).json({ error: 'no database' });
      const id = req.query.series;
      const def = defs.find(d => d.id === id);
      if (!def) return res.status(400).json({ error: 'unknown series' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const value = Number(body.value);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'value must be a number' });
      const d = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : new Date().toISOString().slice(0, 10);
      await putPoints([{ series_id: id, d, value, source: body.source || 'הזנה ידנית', tier: def.tier }]);
      return res.status(200).json({ ok: true, series: id, d, value });
    }

    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, PUT'); return res.status(405).json({ error: 'method not allowed' }); }

    let refreshed = null;
    if (req.query.refresh) {
      const { points, failed } = await collect(defs);
      if (hasDb() && points.length) await putPoints(points);
      refreshed = { ok: points.length, failed, at: new Date().toISOString(), stored: hasDb() };
    }

    let hist = {};
    if (hasDb()) {
      try { hist = await history(defs.map(d => d.id), 400); } catch (e) { hist = { _error: String(e.message) }; }
    }

    // אם אין בסיס נתונים, לפחות נחזיר את הערך החי של הרגע הזה
    if (!hasDb()) {
      const { points } = await collect(defs);
      for (const p of points) (hist[p.series_id] ||= []).push({ d: p.d, v: p.value, src: p.source, tier: p.tier });
    }

    const out = defs.map(def => {
      const pts = (hist[def.id] || []).filter(p => Number.isFinite(p.v));
      const last = pts[pts.length - 1] || null;
      const at = n => nearest(pts, n)?.v ?? null;
      return {
        ...def,
        last: last ? last.v : null,
        lastDate: last ? last.d : null,
        source: last ? last.src : null,
        points: pts.length,
        chg: {
          d1: pctChange(last?.v, at(1)),
          d7: pctChange(last?.v, at(7)),
          d30: pctChange(last?.v, at(30)),
          d90: pctChange(last?.v, at(90)),
          d365: pctChange(last?.v, at(365))
        },
        vol90: volatility(pts),
        hist: pts.slice(-180).map(p => [p.d, p.v])
      };
    });

    return res.status(200).json({ series: out, refreshed, db: hasDb(), at: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
