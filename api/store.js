// מאגר הנתונים המשותף של מערכת הרכש: טבלת key/value אחת ב-Postgres (Neon דרך Vercel).
// GET  /api/store            → כל המפתחות
// PUT  /api/store?key=data   → שמירת ערך (גוף JSON)
// DELETE /api/store?key=data → מחיקה
import { neon } from '@neondatabase/serverless';

const KEYS = new Set(['data', 'supdata', 'spenddata', 'supmeta', 'crit', 'ok']);
let ready = null;

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = neon(url);
  ready ||= sql`CREATE TABLE IF NOT EXISTS galam_store (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  return ready.then(() => sql);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const pass = process.env.APP_PASSWORD;
  if (!pass) return res.status(500).json({ error: 'APP_PASSWORD is not set' });
  if (req.headers['x-app-key'] !== pass) return res.status(401).json({ error: 'unauthorized' });

  try {
    const sql = await db();
    if (req.method === 'GET') {
      const rows = await sql`SELECT key, value, updated_at FROM galam_store`;
      const out = {};
      rows.forEach(r => { out[r.key] = { value: r.value, updated: r.updated_at }; });
      return res.status(200).json(out);
    }
    const key = req.query.key;
    if (!KEYS.has(key)) return res.status(400).json({ error: 'unknown key' });
    if (req.method === 'PUT') {
      if (req.body === undefined) return res.status(400).json({ error: 'missing body' });
      await sql`INSERT INTO galam_store (key, value, updated_at)
                VALUES (${key}, ${JSON.stringify(req.body)}::jsonb, now())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await sql`DELETE FROM galam_store WHERE key = ${key}`;
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
