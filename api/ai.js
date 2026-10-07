// GET /api/ai?task=risk|trend   → תוצאת הניתוח. מוגשת מהמטמון כשהיא קיימת.
// GET /api/ai?force=1            → מריץ סריקה חדשה (עשוי לקחת עד דקה)
// GET /api/ai?step=last|ping|news|bench|models → אבחון
//
// הסריקה רצה גם כמשימת רקע יומית (api/cron/scan.js), כך שבשימוש רגיל
// התוצאה כבר מוכנה והמשתמש אינו ממתין כלל.
import { hasDb, kvGet, kvSet } from './_lib/db.js';
import { fetchNews } from './_lib/news.js';
import { provider, runTask, callNvidia, nvidiaRaw, nvidiaModels, chemicals, riskPromptGrounded, callStats, briefGroup, pitchItem, quoteGroup, aiConfig, aiConfigs, geminiModels } from './_lib/scan.js';

const TTL_MS = 12 * 3600 * 1000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const prov = provider();
  const cfg = await aiConfig();

  /* ---------- אבחון ---------- */
  if (req.query.models) {
    if (prov !== 'nvidia') return res.status(400).json({ error: 'models listing is NVIDIA-only', provider: prov });
    try { return res.status(200).json({ provider: 'nvidia', models: await nvidiaModels() }); }
    catch (e) { return res.status(502).json({ error: String(e.message) }); }
  }
  if (req.query.step === 'gmodels') {
    try { return res.status(200).json({ models: await geminiModels() }); }
    catch (e) { return res.status(502).json({ error: String(e.message) }); }
  }
  if (req.query.step === 'providers') {
    const list = await aiConfigs();
    return res.status(200).json({ order: list.map(c => ({ provider: c.prov, model: c.model, search: c.search, source: c.source })) });
  }
  if (req.query.step === 'last') {
    try { return res.status(200).json(await kvGet('ai:lastrun') || { empty: true }); }
    catch (e) { return res.status(500).json({ error: String(e.message) }); }
  }
  if (req.query.step === 'news') {
    try {
      const t0 = Date.now();
      const news = await fetchNews();
      return res.status(200).json({ step: 'news', ms: Date.now() - t0, items: news.items.length, failed: news.failed, sample: news.items.slice(0, 5) });
    } catch (e) { return res.status(502).json({ step: 'news', error: String(e.message) }); }
  }
  if (req.query.step === 'ping') {
    try {
      const t0 = Date.now();
      const out = await callNvidia('החזר בדיוק את ה-JSON הזה ותו לא: {"ok":true}', req.query.model);
      return res.status(200).json({ step: 'ping', ms: Date.now() - t0, model: req.query.model || process.env.NVIDIA_MODEL, raw: out.slice(0, 400) });
    } catch (e) { return res.status(502).json({ step: 'ping', error: String(e.message), model: req.query.model || process.env.NVIDIA_MODEL }); }
  }
  if (req.query.step === 'raw') {
    try { return res.status(200).json(await nvidiaRaw(req.query.q || 'מנה שלושה סיכונים בשרשרת אספקה של כימיקלים. החזר JSON: {"risks":["..."]}', req.query.model)); }
    catch (e) { return res.status(502).json({ error: String(e.message) }); }
  }
  if (req.query.step === 'bench') {
    const t0 = Date.now();
    try {
      const news = await fetchNews({ perQuery: 6, limit: Number(req.query.n) || 24 });
      const tNews = Date.now() - t0;
      const prompt = riskPromptGrounded(await chemicals(), news.items);
      const t1 = Date.now();
      const out = await callNvidia(prompt, req.query.model);
      const r = { step: 'bench', model: req.query.model || process.env.NVIDIA_MODEL, newsMs: tNews, modelMs: Date.now() - t1, promptChars: prompt.length, outChars: out.length, usage: callStats().lastUsage, head: out.slice(0, 200) };
      if (hasDb()) { try { await kvSet('ai:lastrun', r); } catch {} }
      return res.status(200).json(r);
    } catch (e) {
      const r = { step: 'bench', model: req.query.model || process.env.NVIDIA_MODEL, totalMs: Date.now() - t0, error: String(e.message) };
      if (hasDb()) { try { await kvSet('ai:lastrun', r); } catch {} }
      return res.status(502).json(r);
    }
  }

  /* ---------- הצעת ערכים חיים לאינדקסים מנוהלים ---------- */
  if (req.query.task === 'quote') {
    const g = req.query.group;
    if (!g) return res.status(400).json({ error: 'missing group' });
    try {
      return res.status(200).json(await quoteGroup(g));
    } catch (e) {
      const msg = String(e.message || e);
      const code = msg.startsWith('no_search') ? 400 : msg === 'no_ai_key' ? 503 : 502;
      return res.status(code).json({ error: msg.startsWith('no_search') ? 'no_search' : 'ai_failed', message: msg });
    }
  }

  /* ---------- קריאת AI לשאר הלשוניות ---------- */
  // brief = קריאת שוק לקבוצת סדרות. pitch = נימוק לשיחה מול ספק.
  if (req.query.task === 'brief' || req.query.task === 'pitch') {
    const isBrief = req.query.task === 'brief';
    const id = isBrief ? req.query.group : req.query.item;
    if (!id) return res.status(400).json({ error: isBrief ? 'missing group' : 'missing item' });
    const cacheKey = `ai:${req.query.task}:${id}:${req.query.window || 'd90'}`;

    if (!req.query.force && hasDb()) {
      try {
        const c = await kvGet(cacheKey);
        if (c && Date.now() - new Date(c.at).getTime() < TTL_MS) return res.status(200).json({ ...c, cached: true });
      } catch { /* ממשיכים */ }
    }
    if (!cfg) return res.status(503).json({ error: 'no_ai_key', message: 'לא הוגדר מפתח AI. אפשר להוסיף מפתח Gemini בלשונית ההגדרות.' });

    try {
      const out = isBrief ? await briefGroup(id) : await pitchItem(id, req.query.window);
      const payload = { ...out, provider: cfg.prov, model: cfg.model, source: cfg.source };
      if (hasDb()) { try { await kvSet(cacheKey, payload); } catch {} }
      return res.status(200).json(payload);
    } catch (e) {
      console.error(e);
      return res.status(502).json({ error: 'ai_failed', message: String(e.message || e) });
    }
  }

  /* ---------- מסלול רגיל ---------- */
  const task = req.query.task === 'trend' ? 'trend' : 'risk';

  if (!req.query.force && hasDb()) {
    try {
      const c = await kvGet(`ai:${task}`);
      if (c) {
        const age = Date.now() - new Date(c.at).getTime();
        return res.status(200).json({ ...c, cached: true, stale: age > TTL_MS, ageHours: Math.round(age / 36e5) });
      }
    } catch { /* ממשיכים בלי מטמון */ }
  }

  if (!cfg) {
    return res.status(503).json({ error: 'no_ai_key', task,
      message: 'לא הוגדר מפתח AI. אפשר להוסיף מפתח Gemini בלשונית ההגדרות, או משתנה סביבה ב-Vercel.' });
  }

  try {
    const payload = await runTask(task);
    if (hasDb()) { try { await kvSet('ai:lastrun', { task, provider: prov, ok: true, at: payload.at, alerts: payload.data?.alerts?.length ?? null }); } catch {} }
    return res.status(200).json(payload);
  } catch (e) {
    console.error(e);
    if (hasDb()) { try { await kvSet('ai:lastrun', { task, provider: prov, ok: false, at: new Date().toISOString(), error: String(e.message || e) }); } catch {} }
    return res.status(502).json({ error: 'ai_failed', message: String(e.message || e), task, provider: prov });
  }
}
