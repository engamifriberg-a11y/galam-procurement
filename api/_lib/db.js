// שכבת הנתונים: Neon Postgres. שתי טבלאות בלבד —
//   series_point  : נקודת מחיר אחת לסדרה אחת ביום אחד (ההיסטוריה שממנה מחושבת התנודתיות)
//   kv            : הגדרות, מחירים אחרונים ששולמו, תוצרי ניתוח AI
import { neon } from '@neondatabase/serverless';

let ready = null;

export function hasDb() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export async function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = neon(url);
  ready ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS series_point (
      series_id text NOT NULL,
      d         date NOT NULL,
      value     double precision NOT NULL,
      source    text,
      tier      text,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (series_id, d)
    )`;
    await sql`CREATE INDEX IF NOT EXISTS series_point_sid_d ON series_point (series_id, d DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS kv (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  })();
  await ready;
  return sql;
}

export async function putPoints(points) {
  if (!points.length) return 0;
  const sql = await db();
  for (const p of points) {
    await sql`INSERT INTO series_point (series_id, d, value, source, tier)
              VALUES (${p.series_id}, ${p.d}, ${p.value}, ${p.source || null}, ${p.tier || null})
              ON CONFLICT (series_id, d) DO UPDATE
                SET value = EXCLUDED.value, source = EXCLUDED.source, tier = EXCLUDED.tier`;
  }
  return points.length;
}

export async function history(seriesIds, days = 400) {
  const sql = await db();
  const rows = await sql`SELECT series_id, d::text AS d, value, source, tier
                         FROM series_point
                         WHERE series_id = ANY(${seriesIds})
                           AND d >= CURRENT_DATE - ${days}::int
                         ORDER BY series_id, d`;
  const out = {};
  for (const r of rows) (out[r.series_id] ||= []).push({ d: r.d, v: Number(r.value), src: r.source, tier: r.tier });
  return out;
}

export async function kvGet(key) {
  const sql = await db();
  const rows = await sql`SELECT value FROM kv WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function kvSet(key, value) {
  const sql = await db();
  await sql`INSERT INTO kv (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  return true;
}
