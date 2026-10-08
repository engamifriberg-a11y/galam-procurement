// שלוש פעולות תחזוקה בנקודת קצה אחת:
//
//   GET /api/ops?task=analysis&window=d30|d90|d365   מקור האמת להמלצות —
//        אותם מספרים שהמסך מציג ושה-AI מנמק. לבדיקה ולהשוואה.
//   GET /api/ops?task=backfill&range=2y              מילוי היסטוריה לכל
//        הסדרות החיות. מריצים פעם אחת, או אחרי הוספת סדרה. אידמפוטנטי.
//   PUT /api/ops?task=series   { rows: [{ series, value, date?, source? }] }
//        הזנת נקודות מקובץ, כמו הצעות מחיר מהמשלח.
//
// שלושתן חיו בקבצים נפרדים. תוכנית Hobby מגבילה ל-12 פונקציות לפריסה,
// וההגנה על האתר שווה יותר משלוש נקודות קצה נפרדות לפעולות נדירות.
import { hasDb, putPoints } from './_lib/db.js';
import { catalog } from './_lib/market.js';
import { analyse } from './_lib/analysis.js';
import { backfill } from './_lib/providers.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const task = String(req.query.task || '');
  try {
    if (task === 'analysis') {
      const win = ['d30', 'd90', 'd365'].includes(req.query.window) ? req.query.window : 'd90';
      return res.status(200).json(await analyse(win));
    }
    if (task === 'backfill') return await doBackfill(req, res);
    if (task === 'series') return await doSeries(req, res);
    return res.status(400).json({ error: 'unknown task', tasks: ['analysis', 'backfill', 'series'] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}

async function doBackfill(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.authorization || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!hasDb()) return res.status(503).json({ error: 'no database' });
  const defs = await catalog();
  const { points, failed } = await backfill(defs, { range: req.query.range || '2y' });
  let stored = 0;
  for (let i = 0; i < points.length; i += 400) {
    stored += await putPoints(points.slice(i, i + 400), { mode: 'fill' });
  }
  const bySeries = {};
  for (const p of points) bySeries[p.series_id] = (bySeries[p.series_id] || 0) + 1;
  return res.status(200).json({ ok: true, stored, bySeries, failed, at: new Date().toISOString() });
}

async function doSeries(req, res) {
  if (req.method !== 'PUT') { res.setHeader('Allow', 'PUT'); return res.status(405).json({ error: 'method not allowed' }); }
  if (!hasDb()) return res.status(503).json({ error: 'no database' });
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
}
