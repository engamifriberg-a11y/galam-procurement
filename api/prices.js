// GET /api/prices            → המחירים האחרונים ששולמו בפועל לכל כימיקל, כפי שהוזנו
// PUT /api/prices            → { "5091506": { price: 1840, cur: "USD", unit: "טון", date: "2026-07-01", supplier: "..." }, ... }
//
// זהו הקלט שהופך את ההמלצה לאמיתית: בלעדיו המערכת יודעת לאן השוק זז, אבל לא
// אם גלעם משלמת יותר מדי. שדה המפתח הוא קוד הפריט או מספרו ברשימה.
import { hasDb, kvGet, kvSet } from './_lib/db.js';

const KEY = 'prices:paid';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!hasDb()) return res.status(503).json({ error: 'no database' });

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await kvGet(KEY) || {});
    }
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'body must be an object keyed by item' });
      }
      const current = await kvGet(KEY) || {};
      const merged = { ...current };
      for (const [k, v] of Object.entries(body)) {
        if (v === null) { delete merged[k]; continue; }
        const price = Number(v.price);
        if (!Number.isFinite(price)) return res.status(400).json({ error: `bad price for ${k}` });
        merged[k] = {
          price,
          cur: v.cur || 'USD',
          unit: v.unit || 'טון',
          date: /^\d{4}-\d{2}-\d{2}$/.test(v.date || '') ? v.date : new Date().toISOString().slice(0, 10),
          supplier: v.supplier || '',
          prev: Number.isFinite(Number(v.prev)) ? Number(v.prev) : (current[k]?.price ?? null)
        };
      }
      await kvSet(KEY, merged);
      return res.status(200).json(merged);
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
