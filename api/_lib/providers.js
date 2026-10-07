// מתאמי מקורות. כל מתאם מחזיר [{series_id, d, value, source, tier}] או זורק שגיאה.
// הוספת מקור חדש = פונקציה אחת + רישום ב-ADAPTERS. שום קוד אחר לא משתנה.

const today = () => new Date().toISOString().slice(0, 10);

async function j(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': 'galam-procurement/1.0', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]}`);
  return r.json();
}
async function t(url, ms = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 galam-procurement/1.0', accept: 'text/csv,text/plain,*/*' } });
    if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]}`);
    return r.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`חריגת זמן ${ms / 1000}ש׳ מול ${url.split('?')[0]}`);
    throw e;
  } finally { clearTimeout(timer); }
}

// ---------- בנק ישראל: שער יציג רשמי ----------
async function boi() {
  const data = await j('https://boi.org.il/PublicApi/GetExchangeRates?asJson=true');
  const list = data.exchangeRates || [];
  const pick = k => list.find(x => x.key === k);
  const d = (list[0]?.lastUpdate || today()).slice(0, 10);
  const out = [];
  const usd = pick('USD'), eur = pick('EUR');
  if (usd) out.push({ series_id: 'fx.usdils', d, value: usd.currentExchangeRate / (usd.unit || 1), source: 'בנק ישראל', tier: 'A' });
  if (eur) out.push({ series_id: 'fx.eurils', d, value: eur.currentExchangeRate / (eur.unit || 1), source: 'בנק ישראל', tier: 'A' });
  if (!out.length) throw new Error('boi: no rates');
  return out;
}

// ---------- ECB דרך Frankfurter ----------
async function ecb() {
  const data = await j('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,ILS');
  const d = data.date || today();
  const out = [];
  if (data.rates?.USD) out.push({ series_id: 'fx.eurusd', d, value: data.rates.USD, source: 'ECB', tier: 'A' });
  return out;
}

// ---------- ציטוטי סחורות: Stooq ואז Yahoo כגיבוי ----------
async function stooq(symbol, seriesId) {
  const csv = await t(`https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`);
  const line = csv.trim().split('\n')[1];
  if (!line) throw new Error('stooq: empty');
  const c = line.split(',');
  const d = c[1], close = Number(c[6]);
  if (!close || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('stooq: bad row');
  return { series_id: seriesId, d, value: close, source: 'Stooq', tier: 'A' };
}

async function yahoo(symbol, seriesId) {
  const data = await j(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
  const res = data.chart?.result?.[0];
  const ts = res?.timestamp || [];
  const close = res?.indicators?.quote?.[0]?.close || [];
  for (let i = close.length - 1; i >= 0; i--) {
    if (close[i] != null) {
      return { series_id: seriesId, d: new Date(ts[i] * 1000).toISOString().slice(0, 10), value: close[i], source: 'Yahoo Finance', tier: 'A' };
    }
  }
  throw new Error('yahoo: no close');
}

async function quote(def) {
  const [s1, s2] = def.symbols || [];
  const errs = [];
  for (const [fn, sym] of [[stooq, s1], [yahoo, s2]]) {
    if (!sym) continue;
    try { return [await fn(sym, def.id)]; } catch (e) { errs.push(`${sym}: ${e.message}`); }
  }
  throw new Error(errs.join(' | ') || 'no symbols');
}

/* FRED — מדדי המחירים ליצרן של ה-BLS האמריקאי. מקור רשמי, חינמי, בלי מפתח,
   עם היסטוריה מלאה. חודשי ולא יומי, ולכן מפגר כחודש — אבל הוא המקור הציבורי
   האמין היחיד למחירי עיסה, קרטון ומשטחים. */
async function bls(seriesId, fredId, years) {
  const now = new Date().getFullYear();
  const body = { seriesid: [fredId], startyear: String(now - years), endyear: String(now) };
  if (process.env.BLS_API_KEY) body.registrationkey = process.env.BLS_API_KEY;
  const r = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`bls ${r.status}`);
  const d = await r.json();
  const rows = d.Results?.series?.[0]?.data || [];
  const out = [];
  for (const x of rows) {
    const m = /^M(\d{2})$/.exec(x.period || '');
    const v = Number(x.value);
    if (!m || !Number.isFinite(v)) continue;
    out.push({ series_id: seriesId, d: `${x.year}-${m[1]}-01`, value: v, source: 'BLS', tier: 'A' });
  }
  if (!out.length) throw new Error(`bls ${fredId}: אין תצפיות (${d.message || d.status || ''})`);
  return out.sort((a, b) => a.d < b.d ? -1 : 1);
}

export async function fred(fredId, seriesId, { years = 4 } = {}) {
  let csv;
  try {
    csv = await t(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(fredId)}`);
  } catch (e) {
    // FRED חוסם או איטי מהענן — אותן סדרות זמינות ישירות מ-BLS
    return bls(seriesId, fredId, years);
  }
  const lines = csv.trim().split('\n');
  const cutoff = Date.now() - years * 365 * 864e5;
  const out = [];
  for (const line of lines.slice(1)) {
    const [day, raw] = line.split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;              // ערך חסר מסומן בנקודה
    if (Date.parse(day) < cutoff) continue;
    out.push({ series_id: seriesId, d: day, value: v, source: 'FRED · BLS', tier: 'A' });
  }
  if (!out.length) throw new Error(`fred ${fredId}: אין תצפיות`);
  return out;
}

/* Drewry WCI — מדד מחירי המכולות בדולרים בפועל, לא מדד מנורמל. זהו העוגן
   היחיד שמתרגם אחוזים לכסף. דורש מפתח חינמי מ-oilpriceapi.com; בלעדיו
   הסדרה נשארת מנוהלת ומתעדכנת בהזנה או בשליפה מהרשת. */
export async function oilprice(def) {
  const key = process.env.OILPRICE_API_KEY;
  if (!key) throw new Error('לא הוגדר OILPRICE_API_KEY');
  const r = await fetch(`https://api.oilpriceapi.com/v1/prices/latest?by_code=${encodeURIComponent(def.code)}`, {
    headers: { authorization: `Token ${key}`, accept: 'application/json' }
  });
  if (!r.ok) throw new Error(`oilpriceapi ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  const px = d?.data?.price ?? d?.price;
  const when = (d?.data?.created_at || d?.created_at || new Date().toISOString()).slice(0, 10);
  if (!Number.isFinite(Number(px))) throw new Error('oilpriceapi: אין מחיר בתשובה');
  return [{ series_id: def.id, d: when, value: Number(px), source: 'Drewry WCI', tier: 'A' }];
}

export const ADAPTERS = { boi, ecb, quote };

// מריץ את כל המתאמים הדרושים לקבוצת סדרות ומחזיר גם את מה שנכשל, בשמו.
export async function collect(defs) {
  const points = [], failed = [];
  const byProvider = new Map();
  for (const def of defs) {
    if (def.provider === 'managed') continue;
    if (!byProvider.has(def.provider)) byProvider.set(def.provider, []);
    byProvider.get(def.provider).push(def);
  }
  const jobs = [];
  for (const [prov, list] of byProvider) {
    if (prov === 'quote') {
      for (const def of list) jobs.push([def.id, () => quote(def)]);
    } else if (prov === 'oilprice') {
      for (const def of list) jobs.push([def.id, () => oilprice(def)]);
    } else if (prov === 'fred') {
      for (const def of list) jobs.push([def.id, async () => (await fred(def.fredId, def.id, { years: 1 })).slice(-1)]);
    } else if (ADAPTERS[prov]) {
      jobs.push([prov, () => ADAPTERS[prov]()]);
    }
  }
  const settled = await Promise.allSettled(jobs.map(([, fn]) => fn()));
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') points.push(...r.value);
    else failed.push({ name: jobs[i][0], error: String(r.reason?.message || r.reason) });
  });
  return { points, failed };
}


/* ================= משיכת היסטוריה =================
   צילום יומי בונה היסטוריה בקצב של נקודה ביום, ולכן בימים הראשונים כל
   עמודות השינוי מראות אפס והתנודתיות ריקה. המקורות עצמם מחזיקים שנים
   אחורה — צריך רק לבקש. זה ממלא את הסדרה בבת אחת. */

async function yahooHistory(symbol, seriesId, range = '2y') {
  const d = await j(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
  const res = d.chart?.result?.[0];
  const ts = res?.timestamp || [];
  const close = res?.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    if (close[i] == null || !Number.isFinite(close[i])) continue;
    out.push({ series_id: seriesId, d: new Date(ts[i] * 1000).toISOString().slice(0, 10), value: close[i], source: 'Yahoo Finance', tier: 'A' });
  }
  if (!out.length) throw new Error(`yahoo history ריק עבור ${symbol}`);
  return out;
}

async function frankfurterHistory(base, symbol, seriesId, invert = false) {
  const from = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
  const d = await j(`https://api.frankfurter.dev/v1/${from}..?base=${base}&symbols=${symbol}`);
  const out = [];
  for (const [day, rates] of Object.entries(d.rates || {})) {
    const v = rates[symbol];
    if (!Number.isFinite(v)) continue;
    out.push({ series_id: seriesId, d: day, value: invert ? 1 / v : v, source: 'ECB (היסטוריה)', tier: 'A' });
  }
  if (!out.length) throw new Error(`frankfurter history ריק עבור ${base}/${symbol}`);
  return out;
}

const FX_HISTORY = {
  'fx.usdils': () => frankfurterHistory('USD', 'ILS', 'fx.usdils'),
  'fx.eurils': () => frankfurterHistory('EUR', 'ILS', 'fx.eurils'),
  'fx.eurusd': () => frankfurterHistory('EUR', 'USD', 'fx.eurusd')
};

export async function backfill(defs, { range = '2y' } = {}) {
  const jobs = [];
  for (const def of defs) {
    if (FX_HISTORY[def.id]) { jobs.push([def.id, FX_HISTORY[def.id]]); continue; }
    if (def.provider === 'fred') { jobs.push([def.id, () => fred(def.fredId, def.id, { years: 5 })]); continue; }
    if (def.provider === 'quote') {
      const sym = (def.symbols || [])[1] || (def.symbols || [])[0];
      if (sym) jobs.push([def.id, () => yahooHistory(sym, def.id, range)]);
    }
  }
  const settled = await Promise.allSettled(jobs.map(([, fn]) => fn()));
  const points = [], failed = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') points.push(...r.value);
    else failed.push({ name: jobs[i][0], error: String(r.reason?.message || r.reason) });
  });
  return { points, failed };
}
