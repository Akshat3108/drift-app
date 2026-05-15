export const UNIT_CLASS = {
  kg: 'mass', g: 'mass', lb: 'mass', oz: 'mass',
  L: 'volume', mL: 'volume',
  pcs: 'count', dozen: 'count',
  pack: 'pack',
};

export const CANONICAL = {
  mass: 'kg',
  volume: 'L',
  count: 'pcs',
  pack: 'pack',
};

export const FACTOR_TO_CANONICAL = {
  kg: 1,
  g: 0.001,
  lb: 0.45359237,
  oz: 0.02834952,
  L: 1,
  mL: 0.001,
  pcs: 1,
  dozen: 12,
  pack: 1,
};

export const UNIT_OPTIONS = ['kg', 'g', 'lb', 'oz', 'L', 'mL', 'pcs', 'pack', 'dozen'];

const UNIT_ALIASES = [
  ['kg',    /^(kg|kgs|kilo|kilos|kilogram|kilograms)$/i],
  ['g',     /^(g|gm|gms|gram|grams)$/i],
  ['lb',    /^(lb|lbs|pound|pounds)$/i],
  ['oz',    /^(oz|ounce|ounces)$/i],
  ['L',     /^(l|ltr|litre|litres|liter|liters)$/i],
  ['mL',    /^(ml|millilitre|millilitres|milliliter|milliliters)$/i],
  ['pcs',   /^(pc|pcs|piece|pieces|nos|no|ea|each|unit|units)$/i],
  ['pack',  /^(pk|pkt|pack|packet|packs)$/i],
  ['dozen', /^(dz|doz|dozen|dozens)$/i],
];

export function normaliseUnit(raw) {
  if (!raw) return null;
  const t = String(raw).trim();
  for (const [unit, re] of UNIT_ALIASES) {
    if (re.test(t)) return unit;
  }
  return null;
}

export function toCanonical(qty, unit) {
  const cls = UNIT_CLASS[unit] || 'count';
  const canonical_unit = CANONICAL[cls];
  const factor = FACTOR_TO_CANONICAL[unit] ?? 1;
  return {
    canonical_qty: +(qty * factor).toFixed(6),
    canonical_unit,
  };
}

const UNIT_TOKEN_RE = /(\d+(?:[.,]\d+)?)\s*(kgs?|kilograms?|kilos?|gms?|grams?|g\b|lbs?|pounds?|oz|ounces?|ltrs?|litres?|liters?|l\b|ml|milliliters?|millilitres?|pcs?|pieces?|nos?|each|units?|packs?|pkts?|pk\b|dozens?|dz)\b/i;

export function parseUnitToken(raw) {
  if (!raw) return null;
  const m = String(raw).match(UNIT_TOKEN_RE);
  if (!m) return null;
  const qty = parseFloat(m[1].replace(',', '.'));
  const unit = normaliseUnit(m[2]);
  if (!unit || !isFinite(qty) || qty <= 0) return null;
  return { qty, unit, match: m[0], index: m.index };
}

export function priceLabel(canonical_unit, sym) {
  return `${sym}/${canonical_unit}`;
}
