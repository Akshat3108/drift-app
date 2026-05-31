// Pure chart geometry — no React, no react-native-svg. Everything here is a
// deterministic function of its inputs so it can be unit-tested in isolation
// (see /tmp validation harness) and shared by every chart render mode
// (bar / line / area / dot) inside TrendChart.
//
// Coordinate convention: SVG space, y grows downward. Callers supply the
// pixel `width`/`height` of the plot box and a `pad` inset; we map the data
// domain into the inner plot rect.

// Resolve the [min, max] value domain for a series.
//   zeroBased — clamp the floor to 0 so bars/areas grow from a zero baseline
//               (the right default for spend magnitudes). Set false for
//               index/ratio series (net worth, inflation) that read better on
//               a tight, padded domain.
//   refValue  — a reference value that must stay visible (e.g. the 1.00
//               inflation baseline, or net = 0); folded into the domain.
//   padFrac   — head/tailroom added to a non-zeroBased domain so the line
//               isn't pinned to the top/bottom edge.
export function chartDomain(values, opts = {}) {
  const { zeroBased = true, refValue = null, padFrac = 0.08 } = opts;
  const nums = (values || []).map((v) => Number(v) || 0);
  let min = nums.length ? Math.min(...nums) : 0;
  let max = nums.length ? Math.max(...nums) : 0;
  if (refValue != null && Number.isFinite(refValue)) {
    min = Math.min(min, refValue);
    max = Math.max(max, refValue);
  }
  if (zeroBased) min = Math.min(0, min);
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;

  if (min === max) {
    // Flat series — give it vertical room so a non-zero value isn't glued to
    // an edge, and an all-zero series still has a usable span.
    if (max === 0) {
      max = 1;
    } else {
      const s = Math.abs(max) * 0.1 || 1;
      min -= s;
      max += s;
      if (zeroBased) min = Math.min(0, min);
    }
  } else if (!zeroBased && padFrac > 0) {
    const span = max - min;
    min -= span * padFrac;
    max += span * padFrac;
  }
  return { min, max };
}

// Map a series into plotted points. Points are placed at band centres so the
// same x-positions serve bars (centred in their band), lines, areas and
// lollipops — keeping the geometry identical across render modes so switching
// type never shifts a datum sideways.
//
// Returns null for an empty series or a zero-sized box (caller hides the chart).
export function buildPoints({ values, width, height, pad, domain }) {
  const n = (values || []).length;
  if (!n || !width || !height) return null;
  const left = pad?.left ?? 0;
  const right = pad?.right ?? 0;
  const top = pad?.top ?? 0;
  const bottom = pad?.bottom ?? 0;
  const w = Math.max(1, width - left - right);
  const h = Math.max(1, height - top - bottom);
  const { min, max } = domain;
  const span = (max - min) || 1;
  const band = w / n;
  const yOf = (v) => top + (1 - ((Number(v) || 0) - min) / span) * h;

  const points = values.map((v, i) => ({
    x: left + band * (i + 0.5),
    y: yOf(v),
    value: Number(v) || 0,
    index: i,
  }));

  // Baseline that bars / lollipops / area fills grow from: the zero line when
  // the domain straddles zero, otherwise the domain floor.
  const floor = min < 0 && max > 0 ? 0 : min;
  const baseY = yOf(floor);

  return { points, band, baseY, yOf, plot: { left, right, top, bottom, w, h }, domain: { min, max } };
}

// "M x y L x y …" through the points. '' for < 1 point.
export function linePath(points) {
  if (!points || points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

// Closed path filling between the line and the baseline. '' for < 1 point.
export function areaPath(points, baseY) {
  if (!points || points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L ${last.x.toFixed(2)} ${baseY.toFixed(2)} L ${first.x.toFixed(2)} ${baseY.toFixed(2)} Z`;
}

// Bar rectangles centred in each band. `widthFrac` is the bar's share of its
// band (0..1). Heights are signed-correct: a bar dips below the baseline for a
// negative value.
export function barRects(geo, widthFrac = 0.62) {
  if (!geo) return [];
  const { points, band, baseY } = geo;
  const bw = Math.max(1, band * widthFrac);
  return points.map((p) => {
    const top = Math.min(p.y, baseY);
    const h = Math.max(0, Math.abs(p.y - baseY));
    return { x: p.x - bw / 2, y: top, w: bw, h, index: p.index, value: p.value };
  });
}
