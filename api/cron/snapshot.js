// משימה יומית: שומרת נקודת מחיר אחת לכל סדרה חיה. ההיסטוריה הזו היא מה שמאפשר
// לחשב תנודתיות אמיתית — אף אחד מהמקורות החינמיים לא נותן סדרה היסטורית מלאה.
import { readFile } from 'node:fs/promises';
import { hasDb, putPoints } from '../_lib/db.js';
import { collect } from '../_lib/providers.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const defs = JSON.parse(await readFile(new URL('../../assets/data/series.json', import.meta.url), 'utf8')).series;
    const { points, failed } = await collect(defs);
    let stored = 0;
    if (hasDb() && points.length) stored = await putPoints(points);
    return res.status(200).json({ ok: true, fetched: points.length, stored, failed, at: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
