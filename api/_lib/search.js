// שכבת החיפוש של האתר.
//
// מודל שפה בלי חיפוש ממציא. עד היום העוגן היה כותרות מ-Google News RSS —
// חינמי אבל רדוד: כותרת בלבד, בלי גוף הכתבה. Tavily מחזירה גם תמצית תוכן
// רלוונטית לשאילתה, ולכן המודל מסווג על בסיס מה שבאמת כתוב ולא על ניחוש
// מהכותרת. בלי מפתח המערכת ממשיכה לעבוד על ה-RSS.
import { hasDb, kvGet } from './db.js';
import { fetchNews, QUERIES } from './news.js';

export async function searchKey() {
  if (process.env.TAVILY_API_KEY) return { key: process.env.TAVILY_API_KEY, source: 'סביבה' };
  if (hasDb()) {
    try {
      const s = await kvGet('settings:ai');
      if (s?.tavilyKey) return { key: s.tavilyKey, source: 'ממשק' };
    } catch { /* ממשיכים בלי */ }
  }
  return null;
}

export async function tavily(query, { key, depth = 'basic', max = 5, days = 60, topic = 'news' } = {}) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      search_depth: depth,
      max_results: max,
      topic,
      ...(topic === 'news' ? { days } : {})
    })
  });
  if (!r.ok) throw new Error(`tavily ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return (d.results || []).map(x => ({
    title: x.title, url: x.url, content: (x.content || '').slice(0, 420),
    date: (x.published_date || '').slice(0, 10), source: hostOf(x.url), score: x.score
  }));
}

const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/* העוגן למודול המשברים: Tavily אם יש מפתח, אחרת RSS. */
export async function gatherEvidence({ limit = 18 } = {}) {
  const sk = await searchKey();
  if (!sk) {
    const news = await fetchNews({ perQuery: 5, limit });
    return { engine: 'Google News RSS', items: news.items, failed: news.failed, queries: news.queries, rich: false };
  }

  const results = await Promise.allSettled(
    QUERIES.map(q => tavily(q, { key: sk.key, max: 4 }))
  );
  const failed = [];
  const seen = new Set();
  let items = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') { failed.push({ q: QUERIES[i], error: String(r.reason?.message || r.reason) }); return; }
    for (const it of r.value) {
      const k = (it.title || '').toLowerCase().replace(/\W+/g, '').slice(0, 70);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      items.push(it);
    }
  });
  items = items
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || (b.score || 0) - (a.score || 0))
    .slice(0, limit)
    .map((it, i) => ({ i: i + 1, ...it }));

  if (!items.length) {
    const news = await fetchNews({ perQuery: 5, limit });
    return { engine: 'Google News RSS (גיבוי)', items: news.items, failed, queries: QUERIES.length, rich: false };
  }
  return { engine: 'Tavily', items, failed, queries: QUERIES.length, rich: true, keySource: sk.source };
}

/* חיפוש ערך מפורסם למדד מנוהל בודד */
export async function findIndexValue(def, key) {
  const q = `${def.he} ${def.id.startsWith('fr.') ? 'freight rate index' : 'price index'} current value ${def.unit}`;
  const hits = await tavily(q, { key, max: 4, topic: 'general' });
  return hits.map(h => ({ ...h, forSeries: def.id }));
}
