import { all, exec, one } from '../../db';

// 4.22 — Per-merchant receipt-template learning.
//
// One row per merchant in `receipt_templates`. Captured by ScanService after
// every successful Scan-save; applied by parseReceipt() at parse time when
// the merchant's template has accumulated enough samples to trust.
//
// Lifecycle:
//   recordSample({merchantId, parsed}) — upsert. First sample creates the
//     row with sample_count=1 and the parsed fractions/format as-is.
//     Subsequent samples update via running average. The 40% relative-
//     deviation guard weights wildly out-of-band samples at 0.25 instead of
//     1.0 and bumps `outlier_count` for diagnostics. Format is tracked as
//     the running mode (most-common format wins).
//   getByMerchant(merchantId) — returns the row or null. Callers gate apply
//     on `sample_count >= 3` themselves (the repo doesn't filter; some
//     consumers may want to inspect even sub-threshold rows for UI).
//   removeByMerchant(merchantId) — provided for completeness; not wired
//     into any UI surface today.
//
// All callers read/write inside the standard exec/one/all helpers (no
// transaction wrapper) — recordSample is a single UPSERT and a single read,
// so there's no atomicity risk worth the locking cost. Concurrent Scan
// saves on the same merchant produce SQLite "database is locked" retries
// at the driver layer; that's acceptable given the path is rare (one
// scan-save at a time per device).

const ACTIVATION_SAMPLES = 3;
const OUTLIER_REL_THRESHOLD = 0.40;   // ratio of |new - mean| / mean
const OUTLIER_WEIGHT = 0.25;
const MAX_KEYWORD_LEN = 60;

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

// Weighted running mean: `mean' = (mean*n + value*w) / (n+w)`. When the
// new sample is an outlier we use w=0.25 so it pulls the mean only 25% as
// hard. n+w (not just n+1) keeps the denominator correct so future updates
// still converge.
function weightedMean(currentMean, n, value, weight) {
  return (currentMean * n + value * weight) / (n + weight);
}

// Returns true when |value - mean| / mean exceeds the threshold AND we
// have enough samples to know what "normal" looks like (need n >= 2).
function isOutlier(currentMean, n, value) {
  if (n < 2) return false;
  if (!isFiniteNumber(currentMean) || currentMean <= 0) return false;
  if (!isFiniteNumber(value) || value <= 0) return false;
  return Math.abs(value - currentMean) / currentMean > OUTLIER_REL_THRESHOLD;
}

// Build the column_map JSON from a parsed.columns array. detectColumns
// returns objects with extra metadata; we strip to {x0,x1} to keep the
// payload small and forward-compatible.
function serializeColumns(columns) {
  if (!Array.isArray(columns) || !columns.length) return null;
  const trimmed = columns
    .filter(c => isFiniteNumber(c?.x0) && isFiniteNumber(c?.x1))
    .map(c => ({ x0: Math.round(c.x0), x1: Math.round(c.x1) }));
  if (!trimmed.length) return null;
  return JSON.stringify(trimmed);
}

// Inverse of serializeColumns — returns null on any parse failure so the
// orchestrator can silently fall back to detectColumns(rows) at parse time
// rather than crashing on a corrupt blob.
export function parseColumnMap(json) {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    const out = arr.filter(c => isFiniteNumber(c?.x0) && isFiniteNumber(c?.x1));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export const templates = {
  async getByMerchant(merchantId) {
    if (!merchantId) return null;
    return one(
      `SELECT id, merchant_id, format, column_map, header_frac, footer_frac,
              item_start_keyword, item_end_keyword,
              sample_count, outlier_count, created_at, updated_at
         FROM receipt_templates
        WHERE merchant_id = ?`,
      [merchantId]
    );
  },

  async list() {
    return all(
      `SELECT id, merchant_id, format, header_frac, footer_frac,
              sample_count, outlier_count, updated_at
         FROM receipt_templates
        ORDER BY sample_count DESC, updated_at DESC`
    );
  },

  async removeByMerchant(merchantId) {
    if (!merchantId) return;
    await exec(`DELETE FROM receipt_templates WHERE merchant_id = ?`, [merchantId]);
  },

  // Threshold exposed so callers (ScanService) don't hardcode the magic
  // number. Tests use it too.
  ACTIVATION_SAMPLES,

  async recordSample({ merchantId, parsed }) {
    if (!merchantId || !parsed) return null;
    const newFormat = parsed.format || 'generic';
    const newHeader = isFiniteNumber(parsed.bands?.header_frac)
      ? parsed.bands.header_frac
      : null;
    const newFooter = isFiniteNumber(parsed.bands?.footer_frac)
      ? parsed.bands.footer_frac
      : null;
    const newColumns = serializeColumns(parsed.columns);
    const newStartKw = trimKeyword(parsed.itemStartKeyword);
    const newEndKw   = trimKeyword(parsed.itemEndKeyword);

    const existing = await this.getByMerchant(merchantId);
    if (!existing) {
      await exec(
        `INSERT INTO receipt_templates
           (merchant_id, format, column_map, header_frac, footer_frac,
            item_start_keyword, item_end_keyword, sample_count, outlier_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          merchantId,
          newFormat,
          newColumns,
          newHeader ?? 0.15,
          newFooter ?? 0.20,
          newStartKw,
          newEndKw,
        ]
      );
      return this.getByMerchant(merchantId);
    }

    const n = existing.sample_count || 0;
    let outlierBump = 0;
    let header = existing.header_frac;
    let footer = existing.footer_frac;

    if (newHeader != null) {
      const outlier = isOutlier(existing.header_frac, n, newHeader);
      const w = outlier ? OUTLIER_WEIGHT : 1;
      if (outlier) outlierBump = 1;
      header = weightedMean(existing.header_frac, n, newHeader, w);
    }
    if (newFooter != null) {
      const outlier = isOutlier(existing.footer_frac, n, newFooter);
      const w = outlier ? OUTLIER_WEIGHT : 1;
      if (outlier) outlierBump = 1;
      footer = weightedMean(existing.footer_frac, n, newFooter, w);
    }

    // Format is the running mode — but tracking a histogram across all
    // observed formats would require either a side table or a JSON blob.
    // Cheaper approximation: keep the existing format unless 3+ consecutive
    // outliers have used a different one (we don't track consecutiveness
    // today, so for v1 we update format only when the new format matches
    // the prior one OR sample_count is still low — i.e. the first 2
    // samples can flip format, but after that it sticks). This avoids one
    // bad detectFormat() result swapping a stable learned format.
    const format = (n < 2 || newFormat === existing.format)
      ? newFormat
      : existing.format;

    // column_map: keep the latest non-outlier sample's columns. If the new
    // sample was an outlier, retain the existing map.
    const columnMap = outlierBump
      ? existing.column_map
      : (newColumns || existing.column_map);

    await exec(
      `UPDATE receipt_templates
          SET format = ?, column_map = ?,
              header_frac = ?, footer_frac = ?,
              item_start_keyword = COALESCE(?, item_start_keyword),
              item_end_keyword   = COALESCE(?, item_end_keyword),
              sample_count = sample_count + 1,
              outlier_count = outlier_count + ?,
              updated_at = datetime('now')
        WHERE merchant_id = ?`,
      [
        format,
        columnMap,
        header,
        footer,
        newStartKw,
        newEndKw,
        outlierBump,
        merchantId,
      ]
    );
    return this.getByMerchant(merchantId);
  },
};

function trimKeyword(kw) {
  if (!kw || typeof kw !== 'string') return null;
  const t = kw.trim();
  if (!t) return null;
  return t.slice(0, MAX_KEYWORD_LEN);
}
