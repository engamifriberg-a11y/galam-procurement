// PUT /api/series-bulk → הזנת כמה נקודות סדרה בבת אחת, מקובץ.
// { rows: [{ series, value, date?, source? }] }
import { hasDb, putPoints } from './_lib/db.js';
import { catalog } from './_lib/market.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'PUT') { res.setHeader('Allow', 'PUT'); return res.status(405).json({ error: 'method not allowed' }); }
  if (!hasDb()) return res.status(503).json({ error: 'no database' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'אין שורות' });

    const defs = await catalog();
    const known = new Map(defs.map(d => [d.id, d]));
    const points = [], skipped = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const r of rows) {
      const def = known.get(String(r.series || '').trim());
      const v = Number(r.value);
      if (!def) { skipped.push({ series: r.series, why: 'מזהה סדרה לא מוכר' }); continue; }
      if (!Number.isFinite(v)) { skipped.push({ series: r.series, why: 'ערך לא מספרי' }); continue; }
      const d = /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : today;
      points.push({ series_id: def.id, d, value: v, source: r.source || 'קובץ', tier: def.tier });
    }
    if (!points.length) return res.status(400).json({ error: 'אף שורה לא התאימה לסדרה מוכרת', skipped: skipped.slice(0, 10) });
    await putPoints(points);
    return res.status(200).json({ ok: true, rows: points.length, skipped: skipped.length, examples: skipped.slice(0, 5) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
