// PS-49 — Custom accent colour.
//
// The Flow palette (theme/index.js) uses `coral` as its single accent, with
// `coralD` as the pressed/darker variant. PS-49 lets the user override that
// accent with one of eight named swatches or a custom 7-char hex. The override
// is applied at theme-composition time in ThemeContext, so every `F.coral` /
// `F.coralD` consumer (and `palette(F)`, which reads `F.coral`) picks it up
// with zero churn.
//
// `accent_color` (settings, v51) stores either a named-palette key or a hex
// string; NULL means "use the default coral" (no override).

// Eight named accents. Each value is the base (light-mode) hex. The dark-mode
// variant is derived by nudging lightness up — mirroring how the default
// FT.coral (#e85d44) lightens to FTD.coral (#f17a62) — so contrast holds in
// both themes regardless of which swatch is picked.
export const ACCENTS = {
  coral:   '#e85d44',
  saffron: '#f4a300',
  sage:    '#7da587',
  olive:   '#8a8f3c',
  indigo:  '#5b6cc4',
  rose:    '#d6608f',
  teal:    '#2fa3a3',
  amber:   '#e0922b',
};

// Display order for the swatch row.
export const ACCENT_KEYS = ['coral', 'saffron', 'sage', 'olive', 'indigo', 'rose', 'teal', 'amber'];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Resolve a stored `accent_color` value to a concrete hex, or null when there's
// no valid override (→ fall back to the theme's default coral).
export function resolveAccent(value) {
  if (!value || typeof value !== 'string') return null;
  if (ACCENTS[value]) return ACCENTS[value];
  if (HEX_RE.test(value)) return value.toLowerCase();
  return null;
}

const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));

function parseHex(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('');
}

// Linear mix of `hex` toward `target` ({r,g,b}) by factor f in [0,1].
function mix(hex, target, f) {
  const c = parseHex(hex);
  if (!c) return hex;
  return toHex({
    r: c.r + (target.r - c.r) * f,
    g: c.g + (target.g - c.g) * f,
    b: c.b + (target.b - c.b) * f,
  });
}

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

export const darken = (hex, f = 0.15) => mix(hex, BLACK, f);
export const lighten = (hex, f = 0.12) => mix(hex, WHITE, f);

// Given a resolved accent hex and the dark-mode flag, return the {coral, coralD}
// pair to overlay onto the base theme. Light mode keeps the picked hex as the
// accent and darkens it for the pressed variant; dark mode lightens the accent
// (so it stays legible on the dark surface) and keeps the picked hex as coralD.
export function accentVariants(hex, dark) {
  if (dark) return { coral: lighten(hex, 0.12), coralD: hex };
  return { coral: hex, coralD: darken(hex, 0.15) };
}
