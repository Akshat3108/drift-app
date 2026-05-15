import { parseUnitToken } from './units';

const PLURALS = [
  [/ies\b/, 'y'],
  [/oes\b/, 'o'],
  [/ses\b/, 's'],
  [/s\b/, ''],
];

const NUM_LEAD_RE = /^\s*\d+(?:[.,]\d+)?\s*(?:[x×]\s*)?/i;
const SKU_RE      = /^\s*\d{4,}\s+/;

function singularise(word) {
  if (word.length < 4) return word;
  for (const [re, sub] of PLURALS) {
    if (re.test(word)) return word.replace(re, sub);
  }
  return word;
}

export function normalizeName(raw) {
  let s = String(raw || '').trim();
  if (!s) return { normalized_name: '', qty: 1, unit: 'pcs' };

  let qty = 1;
  let unit = 'pcs';

  const tok = parseUnitToken(s);
  if (tok) {
    qty = tok.qty;
    unit = tok.unit;
    s = (s.slice(0, tok.index) + s.slice(tok.index + tok.match.length)).trim();
  } else {
    const lead = s.match(/^\s*(\d+(?:[.,]\d+)?)\s*[x×]\s+/i);
    if (lead) {
      const n = parseFloat(lead[1].replace(',', '.'));
      if (n > 0 && n < 1000) {
        qty = n;
        unit = 'pcs';
        s = s.slice(lead[0].length);
      }
    } else {
      const trail = s.match(/\s+[x×]\s*(\d+(?:[.,]\d+)?)\s*$/i);
      if (trail) {
        const n = parseFloat(trail[1].replace(',', '.'));
        if (n > 0 && n < 1000) {
          qty = n;
          unit = 'pcs';
          s = s.slice(0, trail.index);
        }
      }
    }
  }

  s = s.replace(SKU_RE, '').replace(NUM_LEAD_RE, '');
  s = s.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const words = s.split(' ').filter(Boolean).map(singularise);
  const normalized_name = words.join(' ');

  return { normalized_name, qty, unit };
}
