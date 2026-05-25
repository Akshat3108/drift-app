import { exec, all, one } from '../../db';

// 7.8 — Price alerts repo.
//
// One live row per canonical item the user is watching. Either threshold
// (`ceiling_price`, `jump_pct`) may be NULL — the checker silently skips
// rows whose every threshold is NULL or whose `enabled = 0`. `baseline_price`
// is the anchor for jump_pct; stamped at create time from
// `item_summary.last_unit_price` (when available) and updated by
// `markFired` after each fire so subsequent jumps are measured from the new
// peak.
//
// Soft-deleting frees the normalized_name slot via the partial UNIQUE index.
// A later re-add creates a fresh live row.

export const priceAlertsRepo = {
  async listLive() {
    return all(
      `SELECT pa.*, s.last_unit_price AS current_unit_price, s.last_seen AS current_last_seen
         FROM price_alerts pa
    LEFT JOIN item_summary s ON s.normalized_name = pa.normalized_name
        WHERE pa.deleted_at IS NULL
     ORDER BY pa.enabled DESC, pa.display_name COLLATE NOCASE ASC`
    );
  },

  async get(id) {
    return one('SELECT * FROM price_alerts WHERE id = ?', [id]);
  },

  async getByName(normalized_name) {
    if (!normalized_name) return null;
    return one(
      `SELECT * FROM price_alerts
        WHERE deleted_at IS NULL AND normalized_name = ?`,
      [normalized_name]
    );
  },

  async create({
    normalized_name, display_name,
    ceiling_price = null, jump_pct = null,
    baseline_price = null, enabled = 1, notes = null,
  }) {
    if (!normalized_name || !display_name) {
      throw new Error('priceAlertsRepo.create: normalized_name + display_name required');
    }
    // Stamp baseline from item_summary if caller didn't supply one — gives the
    // jump_pct branch a meaningful anchor right away.
    let baseline = baseline_price;
    if (baseline == null) {
      const summary = await one(
        `SELECT last_unit_price FROM item_summary WHERE normalized_name = ?`,
        [normalized_name]
      );
      baseline = summary?.last_unit_price ?? null;
    }
    const res = await exec(
      `INSERT INTO price_alerts
         (normalized_name, display_name, ceiling_price, jump_pct,
          baseline_price, enabled, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized_name, display_name,
        ceiling_price == null ? null : Number(ceiling_price),
        jump_pct == null ? null : Number(jump_pct),
        baseline == null ? null : Number(baseline),
        enabled ? 1 : 0,
        notes,
      ]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE price_alerts SET
         display_name   = ?,
         ceiling_price  = ?,
         jump_pct       = ?,
         baseline_price = ?,
         enabled        = ?,
         notes          = ?
       WHERE id = ?`,
      [
        next.display_name,
        next.ceiling_price == null ? null : Number(next.ceiling_price),
        next.jump_pct == null ? null : Number(next.jump_pct),
        next.baseline_price == null ? null : Number(next.baseline_price),
        next.enabled ? 1 : 0,
        next.notes ?? null,
        id,
      ]
    );
    return this.get(id);
  },

  // Called by NotificationsProvider AFTER repo.log() returns a non-deduped
  // logged row. Updates last_fired_* and slides baseline_price forward so the
  // next jump_pct check is measured from the new price.
  async markFired(id, scanned_price) {
    if (id == null) return;
    await exec(
      `UPDATE price_alerts SET
         last_fired_at    = datetime('now'),
         last_fired_price = ?,
         baseline_price   = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [Number(scanned_price) || 0, Number(scanned_price) || 0, id]
    );
  },

  async toggleEnabled(id, enabled) {
    await exec(
      `UPDATE price_alerts SET enabled = ? WHERE id = ? AND deleted_at IS NULL`,
      [enabled ? 1 : 0, id]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE price_alerts SET deleted_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec('UPDATE price_alerts SET deleted_at = NULL WHERE id = ?', [id]);
  },

  // Candidate list for the EditPriceAlert picker (when user adds from
  // PriceAlerts screen rather than from ItemTrend). Items the user has bought
  // 2+ times but doesn't yet have a live alert for, ordered by recency.
  async candidates({ limit = 50 } = {}) {
    return all(
      `SELECT s.normalized_name, s.display_name, s.kind,
              s.last_unit_price, s.last_seen, s.points_count
         FROM item_summary s
        WHERE s.points_count >= 2
          AND NOT EXISTS (
                SELECT 1 FROM price_alerts a
                 WHERE a.deleted_at IS NULL
                   AND a.normalized_name = s.normalized_name
              )
        ORDER BY s.last_seen DESC, s.points_count DESC
        LIMIT ?`,
      [limit]
    );
  },
};
