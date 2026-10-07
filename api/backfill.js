// GET /api/backfill  → ממלא היסטוריה של שנתיים לכל הסדרות החיות.
// מריצים פעם אחת, או שוב אחרי הוספת סדרה חדשה. הכתיבה אידמפוטנטית.
import { hasDb, putPoints } from './_lib/db.js';
import { catalog } from './_lib/market.js';
import { backfill } from './_lib/providers.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.authorization || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!hasDb()) return res.status(503).json({ error: 'no database' });
  try {
    const defs = await catalog();
    const { points, failed } = await backfill(defs, { range: req.query.range || '2y' });
    let stored = 0;
    for (let i = 0; i < points.length; i += 400) {
      stored += await putPoints(points.slice(i, i + 400));
    }
    const bySeries = {};
    for (const p of points) bySeries[p.series_id] = (bySeries[p.series_id] || 0) + 1;
    return res.status(200).json({ ok: true, stored, bySeries, failed, at: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
