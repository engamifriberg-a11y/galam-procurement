// הלוגיקה העסקית של מעקב החוזים: מיזוג שינויים, סטטוס, סינון ומיון.
const DAY = 86400000;
export const WINDOW = 30;

const FIELDS = ['supplier','service','annual','annualText','monthly','monthlyText','start','startText','startFlag',
  'end','endText','endFlag','ins','insText','insFlag','contact','email','notes','nda','safety','safetySigned',
  'active','handled','deleted','isNew','updatedAt'];

const t0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const p = s.split('-');
  if (p.length !== 3) return null;
  const d = new Date(+p[0], +p[1] - 1, +p[2]);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}
export const days = s => { const d = parseISO(s); return d === null ? null : Math.round((d - t0()) / DAY); };
export const fmtD = s => { const d = parseISO(s); return d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : (s || ''); };
export const fmtN = n => new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n);
export function rel(n) {
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === -1) return 'אתמול';
  if (n > 0) return `בעוד ${n} ימים`;
  const a = -n;
  if (a < 60) return `לפני ${a} ימים`;
  if (a < 730) return `לפני ${Math.round(a / 30)} חודשים`;
  return `לפני ${Math.floor(a / 365)} שנים`;
}

/* בסיס הנתונים נשאר כפי שהועלה; השינויים נשמרים בנפרד וממוזגים בקריאה.
   כך העלאת קובץ חדש אינה מוחקת עריכות. */
export function merged(base, overrides = {}) {
  const out = [], seen = new Set();
  for (const b of base) {
    const o = overrides[b.id];
    const r = { ...b };
    if (o) for (const f of FIELDS) if (Object.prototype.hasOwnProperty.call(o, f)) r[f] = o[f];
    seen.add(b.id);
    if (!r.deleted) out.push(r);
  }
  for (const [id, o] of Object.entries(overrides)) {
    if (seen.has(id) || !o?.isNew || o.deleted) continue;
    out.push({ id, supplier: '', service: '', ...o });
  }
  return out;
}

export function money(r) {
  const a = typeof r.annual === 'number' ? r.annual : null;
  const m = typeof r.monthly === 'number' ? r.monthly : null;
  return { a, m, est: a !== null ? a : (m !== null ? m * 12 : null), missing: a === null && m === null };
}
export const isOff = r => r.active === false;
export const badDate = r => r.endFlag === 'bad' || r.insFlag === 'bad' || r.startFlag === 'bad';

export function endKind(r) {
  if (r.end) return 'date';
  if (/מתחדש/.test(r.endText || '')) return 'renew';
  return r.endText ? 'text' : 'none';
}
export function insKind(r) {
  if (r.ins) return 'date';
  const tx = r.insText || '';
  if (/אין צורך|לא נדרש/.test(tx)) return 'na';
  if (/לא עובד|לא מאחסנים/.test(tx)) return 'off';
  return tx ? 'text' : 'none';
}
export function status(r) {
  if (isOff(r)) return { k: 'off', d: null };
  const v = [days(r.end), days(r.ins)].filter(x => x !== null);
  if (v.length) {
    const m = Math.min(...v);
    if (m < 0) return { k: 'expired', d: m };
    if (m <= WINDOW) return { k: 'soon', d: m };
    return { k: 'ok', d: m };
  }
  return endKind(r) === 'renew' ? { k: 'renew', d: null } : { k: 'none', d: null };
}

export const FILTERS = [
  { k: 'all', t: 'הכל' },
  { k: 'live', t: 'פעיל' },
  { k: 'off', t: 'בוטל' },
  { k: 'soon', t: 'מסתיים החודש', c: 'red' },
  { k: 'expired', t: 'פג תוקף', c: 'red' },
  { k: 'money', t: 'חסר סכום', c: 'amb' },
  { k: 'renew', t: 'מתחדש' },
  { k: 'nodate', t: 'ללא תאריך סיום' },
  { k: 'bad', t: 'תאריך לתיקון', c: 'amb' }
];

export function passes(r, k) {
  const st = status(r);
  if (k === 'all') return true;
  if (k === 'live') return !isOff(r);
  if (k === 'off') return isOff(r);
  if (isOff(r)) return false;
  if (k === 'soon') return st.k === 'soon' && !r.handled;
  if (k === 'expired') return st.k === 'expired' && !r.handled;
  if (k === 'money') return money(r).missing;
  if (k === 'renew') return endKind(r) === 'renew';
  if (k === 'nodate') return endKind(r) === 'none';
  if (k === 'bad') return badDate(r);
  return true;
}

export function searchHit(r, q) {
  if (!q) return true;
  const hay = [r.supplier, r.service, r.contact, r.email, r.notes, r.nda].join(' ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

const ORDER = { soon: 0, expired: 1, ok: 2, renew: 3, none: 4, off: 6 };
export function sortList(list, s) {
  return list.slice().sort((a, b) => {
    if (s === 'supplier') return (a.supplier || '').localeCompare(b.supplier || '', 'he');
    if (s === 'cost') return (money(b).est || -1) - (money(a).est || -1);
    if (s === 'end') {
      const da = days(a.end), db = days(b.end);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    }
    const sa = status(a), sb = status(b);
    const oa = ORDER[sa.k] + (a.handled ? 10 : 0), ob = ORDER[sb.k] + (b.handled ? 10 : 0);
    if (oa !== ob) return oa - ob;
    if (sa.d !== null && sb.d !== null) return sa.d - sb.d;
    return (a.supplier || '').localeCompare(b.supplier || '', 'he');
  });
}

export function alertItems(list) {
  const soon = [], past = [];
  for (const r of list) {
    if (r.handled || isOff(r)) continue;
    const de = days(r.end);
    if (de !== null) (de < 0 ? past : soon).push({ r, kind: 'סיום חוזה', date: r.end, d: de });
    const di = days(r.ins);
    if (di !== null && di <= WINDOW) (di < 0 ? past : soon).push({ r, kind: 'אישור ביטוח', date: r.ins, d: di });
  }
  return {
    soon: soon.filter(x => x.d <= WINDOW).sort((a, b) => a.d - b.d),
    past: past.sort((a, b) => b.d - a.d)
  };
}

export function toCsv(list) {
  const head = ['מס','סטטוס הסכם','ספק','שירות / מוצר','חודשי','שנתי','שנתי מחושב','תחילת התקשרות','סיום חוזה','אישור ביטוח עד','ימים לסיום','סטטוס','NDA','איש קשר','אימייל','הערות'];
  const L = { soon: 'מסתיים החודש', expired: 'פג תוקף', ok: 'בתוקף', renew: 'מתחדש', none: 'לא ידוע', off: 'בוטל' };
  const rows = list.map(r => {
    const st = status(r), mo = money(r);
    return [r.n || '', isOff(r) ? 'בוטל' : 'פעיל', r.supplier || '', r.service || '',
      mo.m === null ? (r.monthlyText || '') : mo.m,
      mo.a === null ? (r.annualText || '') : mo.a,
      mo.est === null ? '' : mo.est,
      r.start ? fmtD(r.start) : (r.startText || ''),
      r.end ? fmtD(r.end) : (r.endText || ''),
      r.ins ? fmtD(r.ins) : (r.insText || ''),
      st.d === null ? '' : st.d,
      (r.handled ? 'טופל · ' : '') + (L[st.k] || ''),
      r.nda || '', r.contact || '', r.email || '', (r.notes || '').replace(/\s+/g, ' ')];
  });
  return [head, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
