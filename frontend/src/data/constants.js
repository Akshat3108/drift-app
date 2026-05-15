export const CURRENCIES = {
  USD: { symbol: '$', code: 'USD' },
  EUR: { symbol: '€', code: 'EUR' },
  GBP: { symbol: '£', code: 'GBP' },
  INR: { symbol: '₹', code: 'INR' },
  JPY: { symbol: '¥', code: 'JPY' },
};

export function fmt(amount, sym = '$', opts = {}) {
  const { decimals = 2, compact = false } = opts;
  if (compact && Math.abs(amount) >= 1000) {
    return `${sym}${(amount / 1000).toFixed(1)}k`;
  }
  const n = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${amount < 0 ? '−' : ''}${sym}${n}`;
}

export const POT_COLORS = ['cream', 'mint', 'sky', 'blush', 'butter', 'lilac'];

export const potBg = (F, c) =>
  ({ cream: F.cream, mint: F.mint, sky: F.sky, blush: F.blush, butter: F.butter, lilac: F.lilac }[c] || F.cream);
