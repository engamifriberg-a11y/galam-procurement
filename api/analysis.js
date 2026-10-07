// GET /api/analysis?window=d30|d90|d365
// מקור האמת להמלצות: אותם מספרים שהמסך מציג ושה-AI מנמק.
import { analyse } from './_lib/analysis.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const win = ['d30', 'd90', 'd365'].includes(req.query.window) ? req.query.window : 'd90';
  try {
    return res.status(200).json(await analyse(win));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
