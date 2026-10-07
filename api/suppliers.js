// GET /api/suppliers  → מאגר הספקים. מה-DB אם הועלה קובץ, אחרת מקובץ הבסיס.
// PUT /api/suppliers  → החלפת המאגר  { version, rows: [...] }
//
// הקובץ מנותח בדפדפן ונשלח לכאן כ-JSON, כדי לא להוסיף תלות בספריית אקסל
// בצד השרת. השרת מוודא מבנה ושומר.
import { hasDb, kvGet, kvSet } from './_lib/db.js';
import { readFile } from 'node:fs/promises';

const KEY = 'suppliers:data';
const FIELDS = ['id','nm','en','tc','t','st','cur','pt','ptd','own','dt','tel','fax','em','ad','city','cn','web','vat','scr','ind','crd','cls','emp','yr','ord','field'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (hasDb()) {
        try {
          const saved = await kvGet(KEY);
          if (saved?.rows?.length) return res.status(200).json({ ...saved, origin: 'הועלה' });
        } catch { /* נופלים לקובץ הבסיס */ }
      }
      const base = JSON.parse(await readFile(new URL('../assets/data/suppliers.json', import.meta.url), 'utf8'));
      return res.status(200).json({ ...base, origin: 'קובץ בסיס' });
    }

    if (req.method === 'PUT') {
      if (!hasDb()) return res.status(503).json({ error: 'no database' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const rows = Array.isArray(body.rows) ? body.rows : null;
      if (!rows || !rows.length) return res.status(400).json({ error: 'אין שורות בקובץ' });
      if (rows.length > 20000) return res.status(400).json({ error: 'יותר מ-20,000 שורות' });
      const withId = rows.filter(r => r && String(r.id || '').trim());
      if (!withId.length) return res.status(400).json({ error: 'לא נמצאה עמודת מספר ספק' });

      // משאירים רק שדות מוכרים, כדי שקובץ חריג לא ינפח את המאגר
      const clean = withId.map(r => {
        const o = {};
        for (const f of FIELDS) if (r[f] !== undefined && r[f] !== null && r[f] !== '') o[f] = r[f];
        return o;
      });
      const payload = { version: body.version || new Date().toISOString().slice(0, 10), rows: clean, uploadedAt: new Date().toISOString() };
      await kvSet(KEY, payload);
      return res.status(200).json({ ok: true, rows: clean.length, version: payload.version });
    }

    if (req.method === 'DELETE') {
      if (!hasDb()) return res.status(503).json({ error: 'no database' });
      await kvSet(KEY, {});
      return res.status(200).json({ ok: true, reverted: 'קובץ בסיס' });
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
