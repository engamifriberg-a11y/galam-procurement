// GET    /api/contracts          → בסיס החוזים + השינויים שנשמרו
// PUT    /api/contracts?id=xx    → שמירת שינוי לחוזה אחד
// PUT    /api/contracts          → החלפת הבסיס מקובץ  { version, rows }
// DELETE /api/contracts          → ניקוי כל השינויים וחזרה לבסיס
//
// בארטיפקט המקורי השינויים נשמרו בדפדפן או במסד של הארטיפקט. כאן הם
// נשמרים ב-Neon, כך שכל מי שפותח את האתר רואה את אותו מצב.
import { hasDb, kvGet, kvSet } from './_lib/db.js';
import { readFile } from 'node:fs/promises';

const BASE = 'contracts:base';
const OVER = 'contracts:overrides';

const FIELDS = ['supplier','service','annual','annualText','monthly','monthlyText','start','startText','startFlag',
  'end','endText','endFlag','ins','insText','insFlag','contact','email','notes','nda','safety','safetySigned',
  'active','handled','deleted','isNew','updatedAt'];

async function baseRows() {
  if (hasDb()) {
    try {
      const saved = await kvGet(BASE);
      if (saved?.rows?.length) return { ...saved, origin: 'הועלה' };
    } catch { /* נופלים לקובץ */ }
  }
  const f = JSON.parse(await readFile(new URL('../assets/data/contracts.json', import.meta.url), 'utf8'));
  return { ...f, origin: 'קובץ בסיס' };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const base = await baseRows();
      let overrides = {};
      if (hasDb()) { try { overrides = await kvGet(OVER) || {}; } catch { overrides = {}; } }
      return res.status(200).json({ ...base, overrides });
    }

    if (!hasDb()) return res.status(503).json({ error: 'no database' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (req.method === 'PUT' && req.query.id) {
      const id = String(req.query.id);
      const all = await kvGet(OVER) || {};
      const clean = {};
      for (const f of FIELDS) if (body[f] !== undefined) clean[f] = body[f];
      clean.updatedAt = new Date().toISOString();
      all[id] = { ...(all[id] || {}), ...clean };
      await kvSet(OVER, all);
      return res.status(200).json({ ok: true, id, override: all[id] });
    }

    if (req.method === 'PUT') {
      const rows = Array.isArray(body.rows) ? body.rows.filter(r => r && (r.supplier || r.id)) : [];
      if (!rows.length) return res.status(400).json({ error: 'אין שורות בקובץ' });
      const withIds = rows.map((r, i) => ({ ...r, id: String(r.id || `u${i + 1}`) }));
      await kvSet(BASE, { version: body.version || new Date().toISOString().slice(0, 10), rows: withIds });
      return res.status(200).json({ ok: true, rows: withIds.length });
    }

    if (req.method === 'DELETE') {
      await kvSet(OVER, {});
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
