// עוגן המציאות של מודול המשברים.
//
// מודל שפה בלי חיפוש ימציא אירועים משכנעים שלא קרו. לכן אנחנו לא שואלים אותו
// "מה קורה בעולם" — אנחנו מביאים כותרות אמיתיות ממקור חדשות ומבקשים ממנו רק
// לסווג ולנתח אותן, עם ציטוט לפי מספר הפריט. כך אין לו מאיפה להמציא מקור.
//
// המקור: Google News RSS. חינמי, בלי מפתח, מחזיר כותרת, מקור, תאריך וקישור.

const FEED = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

// שאילתות ממוקדות לשרשרת האספקה של גלעם ולצווארי הבקבוק שמשפיעים על ישראל
export const QUERIES = [
  'caustic soda OR chlor-alkali plant shutdown OR force majeure',
  'potassium hydroxide OR potash export restriction',
  'soda ash plant OR Turkey soda ash export',
  'sulphur OR sulphuric acid price supply',
  'hydrogen peroxide plant OR shortage',
  'citric acid China export price OR anti-dumping',
  'chemical tanker freight Mediterranean OR Israel port',
  'Red Sea OR Suez Canal shipping disruption container rates',
  'container freight rates Asia Europe index',
  'Israel chemical imports OR Haifa Ashdod port disruption',
  'pulp price NBSK OR BHKP market',
  'European chemical industry energy costs production cuts'
];

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

function parseRss(xml, maxItems) {
  const out = [];
  const blocks = xml.split('<item>').slice(1);
  for (const b of blocks.slice(0, maxItems)) {
    const grab = tag => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? decode(m[1]) : '';
    };
    const title = grab('title');
    if (!title) continue;
    out.push({ title, url: grab('link'), date: grab('pubDate').slice(0, 16), source: grab('source') });
  }
  return out;
}

const DAY = 864e5;

export async function fetchNews({ queries = QUERIES, perQuery = 8, maxAgeDays = 60, limit = 90 } = {}) {
  const results = await Promise.allSettled(queries.map(async q => {
    const r = await fetch(FEED(q), { headers: { 'User-Agent': 'Mozilla/5.0 galam-procurement/1.0' } });
    if (!r.ok) throw new Error(`${r.status} ${q}`);
    return parseRss(await r.text(), perQuery).map(it => ({ ...it, q }));
  }));

  const failed = [];
  const seen = new Set();
  let items = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') { failed.push({ q: queries[i], error: String(r.reason?.message || r.reason) }); return; }
    for (const it of r.value) {
      const key = it.title.toLowerCase().replace(/\W+/g, '').slice(0, 70);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
    }
  });

  const cutoff = Date.now() - maxAgeDays * DAY;
  items = items
    .filter(it => { const t = Date.parse(it.date); return !Number.isFinite(t) || t >= cutoff; })
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
    .slice(0, limit)
    .map((it, i) => ({ i: i + 1, ...it }));

  return { items, failed, queries: queries.length };
}

export function digest(items) {
  return items.map(it => `[${it.i}] ${it.date} · ${it.source || 'ללא מקור'} · ${it.title}`).join('\n');
}
