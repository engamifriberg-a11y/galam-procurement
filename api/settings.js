// GET /api/settings  → מצב תצורת ה-AI, בלי לחשוף את המפתח
// PUT /api/settings  → שמירת מפתח Gemini  { geminiKey, geminiModel?, code? }
// DELETE /api/settings → מחיקת המפתח השמור
//
// אבטחה: האתר הזה פומבי. מפתח שנשמר כאן נגיש לשרת, ומי שמגיע לכתובת יכול
// להחליף אותו ולשרוף את המכסה. לכן אם מוגדר ADMIN_CODE במשתני הסביבה —
// הוא נדרש לכל שינוי. בלעדיו המסך מצהיר במפורש שהוא פתוח.
import { hasDb, kvGet, kvSet } from './_lib/db.js';
import { aiConfig, geminiFetch } from './_lib/scan.js';

const KEY = 'settings:ai';
const mask = k => !k ? null : k.slice(0, 6) + '…' + k.slice(-4);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!hasDb()) return res.status(503).json({ error: 'no database' });

  const adminCode = process.env.ADMIN_CODE || null;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  try {
    if (req.method === 'GET') {
      const saved = await kvGet(KEY) || {};
      const cfg = await aiConfig();
      return res.status(200).json({
        protected: Boolean(adminCode),
        saved: { geminiKey: mask(saved.geminiKey), geminiModel: saved.geminiModel || null, updatedAt: saved.updatedAt || null },
        active: cfg ? { provider: cfg.prov, model: cfg.model, search: cfg.search, source: cfg.source } : null,
        env: {
          nvidia: Boolean(process.env.NVIDIA_API_KEY),
          gemini: Boolean(process.env.GEMINI_API_KEY),
          anthropic: Boolean(process.env.ANTHROPIC_API_KEY)
        }
      });
    }

    if (adminCode && body.code !== adminCode) {
      return res.status(401).json({ error: 'bad_code', message: 'קוד ניהול שגוי.' });
    }

    if (req.method === 'PUT') {
      const k = String(body.geminiKey || '').trim();
      if (!k || k.length < 20) return res.status(400).json({ error: 'מפתח לא תקין' });

      // בדיקה אמיתית מול Google לפני שמירה, כדי לא לשמור מפתח שבור
      const model = String(body.geminiModel || 'gemini-2.5-flash').trim();
      try {
        await geminiFetch(model, { contents: [{ parts: [{ text: 'השב במילה אחת: בסדר' }] }] }, k);
      } catch (e) {
        return res.status(400).json({ error: 'key_rejected',
          message: `Google דחה את המפתח. ${String(e.message)}${k.startsWith('AQ.') ? ' — מפתחות בפורמט AQ. אינם נתמכים כרגע בנקודת הקצה הזו. צור מפתח בפורמט AIza.' : ''}` });
      }

      await kvSet(KEY, { geminiKey: k, geminiModel: model, updatedAt: new Date().toISOString() });
      const cfg = await aiConfig();
      return res.status(200).json({ ok: true, saved: { geminiKey: mask(k), geminiModel: model },
        active: { provider: cfg.prov, model: cfg.model, search: cfg.search, source: cfg.source } });
    }

    if (req.method === 'DELETE') {
      await kvSet(KEY, {});
      const cfg = await aiConfig();
      return res.status(200).json({ ok: true, active: cfg ? { provider: cfg.prov, model: cfg.model, source: cfg.source } : null });
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
