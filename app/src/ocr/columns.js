// X-axis column inference. Given merged OCR rows that carry per-token
// `{text, x, width}` records, walk every token across every row and build a
// 1-D occupancy histogram bucketed at HIST_BUCKET_PX. Runs of empty buckets
// at least GAP_MIN_PX wide are column separators; the spans between them
// are columns. Used by extractItemsColumnar (4.13) to bucket tokens into
// name/qty/rate/amount columns instead of relying on the trailing-amount
// heuristic that extractItemsTabular uses.
//
// Returns `{ columns: [{x0, x1}, …], gapWidths: [px, …] }`. When fewer than
// MIN_COLUMNS clean columns are found the columnar strategy auto-falls back
// to tabular — see the dispatch arm in parseReceipt.js.

const HIST_BUCKET_PX = 5;
const GAP_MIN_PX = 30;

export function detectColumns(rows) {
  const tokens = [];
  let maxX = 0;
  for (const r of rows) {
    const list = r?.tokens || [];
    for (const t of list) {
      if (!t || typeof t.x !== 'number' || typeof t.width !== 'number') continue;
      if (!t.text) continue;
      tokens.push(t);
      if (t.x + t.width > maxX) maxX = t.x + t.width;
    }
  }
  if (!tokens.length || maxX <= 0) {
    return { columns: [], gapWidths: [] };
  }

  // Build the histogram. histo[i] = number of tokens whose [x, x+width)
  // overlaps bucket [i*B, (i+1)*B). Bucket-set instead of bucket-count keeps
  // long words (which span many buckets) from dominating the signal.
  const bucketCount = Math.ceil(maxX / HIST_BUCKET_PX) + 1;
  const histo = new Uint16Array(bucketCount);
  for (const t of tokens) {
    const start = Math.max(0, Math.floor(t.x / HIST_BUCKET_PX));
    const end = Math.min(bucketCount - 1, Math.floor((t.x + t.width - 1) / HIST_BUCKET_PX));
    for (let i = start; i <= end; i++) histo[i] += 1;
  }

  // Find runs of zero-occupancy buckets long enough to count as a gap. Skip
  // the leading zero-run (whitespace before the first token) and the
  // trailing one (after the last token) — they're margins, not separators.
  const gaps = [];
  let firstNonZero = -1;
  let lastNonZero = -1;
  for (let i = 0; i < bucketCount; i++) {
    if (histo[i] > 0) {
      if (firstNonZero < 0) firstNonZero = i;
      lastNonZero = i;
    }
  }
  if (firstNonZero < 0) return { columns: [], gapWidths: [] };

  let runStart = -1;
  for (let i = firstNonZero; i <= lastNonZero; i++) {
    if (histo[i] === 0) {
      if (runStart < 0) runStart = i;
    } else {
      if (runStart >= 0) {
        const widthPx = (i - runStart) * HIST_BUCKET_PX;
        if (widthPx >= GAP_MIN_PX) {
          gaps.push({ start: runStart, end: i - 1, widthPx });
        }
        runStart = -1;
      }
    }
  }

  // Convert gaps → column boundaries. A column is the span between two
  // adjacent gaps (or between a gap and the row margin).
  const colEdges = [firstNonZero, ...gaps.flatMap(g => [g.start - 1, g.end + 1]), lastNonZero];
  const columns = [];
  for (let i = 0; i < colEdges.length; i += 2) {
    const a = colEdges[i];
    const b = colEdges[i + 1];
    if (a == null || b == null || b < a) continue;
    columns.push({
      x0: a * HIST_BUCKET_PX,
      x1: (b + 1) * HIST_BUCKET_PX,
    });
  }

  return {
    columns,
    gapWidths: gaps.map(g => g.widthPx),
  };
}

// Pick the column index whose [x0, x1) covers the centre of a token.
// Returns -1 if the token sits outside every column (shouldn't happen for
// well-formed rows, but possible after preprocessing trimmed an outlier).
export function tokenColumn(columns, token) {
  if (!token || typeof token.x !== 'number') return -1;
  const centre = token.x + (token.width || 0) / 2;
  for (let i = 0; i < columns.length; i++) {
    if (centre >= columns[i].x0 && centre < columns[i].x1) return i;
  }
  return -1;
}
