// GET  /api/market              → כל הסדרות עם שינויים ותנודתיות
// GET  /api/market?refresh=1    → מרענן מהמקורות החיים ואז מחזיר
// PUT  /api/market?series=pl.pp → הזנת ערך לאינדקס מנוהל { value, date?, source? }
import { hasDb, putPoints } from './_lib/db.js';
import { collect } from './_lib/providers.js';
import { catalog, buildSeries } from './_lib/market.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const defs = await catalog();

    if (req.method === 'PUT') {
      if (!hasDb()) return res.status(503).json({ error: 'no database' });
      const def = defs.find(d => d.id === req.query.series);
      if (!def) return res.status(400).json({ error: 'unknown series' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const value = Number(body.value);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'value must be a number' });
      const d = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : new Date().toISOString().slice(0, 10);
      await putPoints([{ series_id: def.id, d, value, source: body.source || 'הזנה ידנית', tier: def.tier }]);
      return res.status(200).json({ ok: true, series: def.id, d, value });
    }

    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, PUT'); return res.status(405).json({ error: 'method not allowed' }); }

    let refreshed = null;
    if (req.query.refresh) {
      const { points, failed } = await collect(defs);
      if (hasDb() && points.length) await putPoints(points);
      refreshed = { ok: points.length, failed, at: new Date().toISOString(), stored: hasDb() };
    }

    let series = await buildSeries();
    // מצב תמציתי: בלי מערכי ההיסטוריה, לבדיקות ולניטור
    if (req.query.brief) series = series.map(({ hist, ...rest }) => rest);
    return res.status(200).json({ series, refreshed, db: hasDb(), at: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
