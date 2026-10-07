// משימת רקע יומית: מריצה את סריקת המשברים ושומרת אותה במטמון, כדי שהמשתמש
// יקבל תוצאה מיידית ולא ימתין למודל.
import { runTask } from '../_lib/scan.js';
import { hasDb, kvSet } from '../_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.authorization || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const payload = await runTask('risk');
    const summary = { task: 'risk', ok: true, at: payload.at, alerts: payload.data?.alerts?.length ?? 0, via: 'cron' };
    if (hasDb()) { try { await kvSet('ai:lastrun', summary); } catch {} }
    return res.status(200).json(summary);
  } catch (e) {
    console.error(e);
    const summary = { task: 'risk', ok: false, at: new Date().toISOString(), error: String(e.message || e), via: 'cron' };
    if (hasDb()) { try { await kvSet('ai:lastrun', summary); } catch {} }
    return res.status(502).json(summary);
  }
}
