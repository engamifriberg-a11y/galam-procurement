// GET /api/prices            → המחירים האחרונים ששולמו בפועל לכל כימיקל, כפי שהוזנו
// PUT /api/prices            → { "5091506": { price: 1840, cur: "USD", unit: "טון", date: "2026-07-01", supplier: "..." }, ... }
//
// זהו הקלט שהופך את ההמלצה לאמיתית: בלעדיו המערכת יודעת לאן השוק זז, אבל לא
// אם גלעם משלמת יותר מדי. שדה המפתח הוא קוד הפריט או מספרו ברשימה.
//
// GET /api/prices?what=tons  → הכמויות השנתיות שהוזנו ידנית
// PUT /api/prices?what=tons  → { "5091506": 750, "5091507": null }
//
// הכמות מהקובץ היא נקודת הפתיחה, וההזנה הידנית דורסת אותה. null מחזיר
// לערך שבקובץ. הכמות אינה מספר לתצוגה בלבד — היא נכנסת לעוצמת המיקוח,
// ולכן גם להמלצה ולנימוק שה-AI מנסח.
import { hasDb, kvGet, kvSet } from './_lib/db.js';

const KEY = 'prices:paid';
const TONS = 'chem:tons';
const MAX_TONS = 1e7;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!hasDb()) return res.status(503).json({ error: 'no database' });

  try {
    if (req.query?.what === 'tons') return await tons(req, res);

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

async function tons(req, res) {
  if (req.method === 'GET') return res.status(200).json(await kvGet(TONS) || {});
  if (req.method !== 'PUT') { res.setHeader('Allow', 'GET, PUT'); return res.status(405).json({ error: 'method not allowed' }); }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'body must be an object keyed by item' });
  }
  const merged = { ...(await kvGet(TONS) || {}) };
  for (const [k, raw] of Object.entries(body)) {
    if (raw === null || raw === '') { delete merged[k]; continue; }   // חזרה לערך שבקובץ
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0 || v > MAX_TONS) {
      return res.status(400).json({ error: `כמות לא חוקית עבור ${k}`, value: raw });
    }
    merged[k] = v;
  }
  await kvSet(TONS, merged);
  return res.status(200).json(merged);
}
