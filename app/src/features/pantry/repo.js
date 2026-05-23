import { exec, all, one, getDB } from '../../db';

// 7.7 — Pantry inventory repo.
//
// One row per canonical item the user is tracking. Auto-populate is the
// `autoPopulateFromItems` entrypoint which `expRepo.createWithItems` invokes
// after writing receipt_items — gated on `item_summary.points_count >= 2`
// so single-shot purchases don't pollute. Manual rows can also be added
// directly via create().
//
// Quantity is stored in the canonical_unit copied from item_summary at
// creation time (matches the unit on receipt_items). The reorder_threshold +
// target_qty fields are NULL-by-default and the low-stock checker skips
// NULL-threshold rows so a fresh row never fires a notification until the
// user explicitly opts in.

const UNIT_FALLBACK = 'pcs';

export const pantryRepo = {
  async listLive() {
    return all(
      `SELECT * FROM pantry_items
        WHERE deleted_at IS NULL
        ORDER BY display_name COLLATE NOCASE ASC`
    );
  },

  async listLowStock() {
    return all(
      `SELECT * FROM pantry_items
        WHERE deleted_at IS NULL
          AND reorder_threshold IS NOT NULL
          AND current_qty <= reorder_threshold
        ORDER BY (current_qty / reorder_threshold) ASC,
                 display_name COLLATE NOCASE ASC`
    );
  },

  async get(id) {
    return one('SELECT * FROM pantry_items WHERE id = ?', [id]);
  },

  async getByName(normalized_name) {
    if (!normalized_name) return null;
    return one(
      `SELECT * FROM pantry_items
        WHERE deleted_at IS NULL AND normalized_name = ?`,
      [normalized_name]
    );
  },

  async create({
    normalized_name, display_name, kind = 'other',
    canonical_unit = UNIT_FALLBACK, current_qty = 0,
    reorder_threshold = null, target_qty = null,
    notes = null, icon = null,
  }) {
    if (!normalized_name || !display_name) {
      throw new Error('pantryRepo.create: normalized_name + display_name required');
    }
    const res = await exec(
      `INSERT INTO pantry_items
         (normalized_name, display_name, kind, canonical_unit, current_qty,
          reorder_threshold, target_qty, notes, icon,
          last_topped_up_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        normalized_name, display_name, kind, canonical_unit, current_qty,
        reorder_threshold, target_qty, notes, icon,
      ]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE pantry_items SET
         display_name = ?, kind = ?, canonical_unit = ?,
         current_qty = ?, reorder_threshold = ?, target_qty = ?,
         notes = ?, icon = ?
       WHERE id = ?`,
      [
        next.display_name, next.kind, next.canonical_unit,
        next.current_qty ?? 0,
        next.reorder_threshold ?? null,
        next.target_qty ?? null,
        next.notes ?? null,
        next.icon ?? null,
        id,
      ]
    );
    return this.get(id);
  },

  // Direct setter used by the EditPantryItem screen's "set exact qty" flow.
  // current_qty is clamped at 0 — negative inventory doesn't make sense.
  async setQty(id, qty) {
    const v = Math.max(0, Number(qty) || 0);
    await exec(
      `UPDATE pantry_items SET current_qty = ? WHERE id = ? AND deleted_at IS NULL`,
      [v, id]
    );
    return this.get(id);
  },

  // Stepper increment. delta can be negative. Floored at 0.
  async incrementQty(id, delta) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = Math.max(0, (Number(cur.current_qty) || 0) + (Number(delta) || 0));
    await exec(
      `UPDATE pantry_items SET current_qty = ? WHERE id = ? AND deleted_at IS NULL`,
      [next, id]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE pantry_items SET deleted_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    // Soft-deleting a pantry row releases the unique normalized_name slot,
    // so a re-scan can create a fresh live row. Restoring an old row may
    // collide with that new live row — surface as an error via the UNIQUE
    // partial index when it happens. Caller (Toast Undo) should handle.
    await exec('UPDATE pantry_items SET deleted_at = NULL WHERE id = ?', [id]);
  },

  // ── Auto-populate ───────────────────────────────────────────────────────
  //
  // Called by expRepo.createWithItems after the items insert loop completes.
  // For each item passed in we look up the matching item_summary row to read
  // `points_count` (already updated by the AI trigger that fired on the
  // INSERTs we just did) and `canonical_unit`/`display_name`/`kind`. Gated
  // on `points_count >= 2`: this is the second purchase of this item, so
  // promoting it into the pantry is signal not noise.
  //
  // If a live pantry row exists: increment current_qty by the receipt's
  // canonical_qty and stamp last_topped_up_at. If not: insert a fresh row.
  // Both paths run inside a single transaction so partial failure rolls
  // back the lot.
  async autoPopulateFromItems(items) {
    if (!Array.isArray(items) || items.length === 0) return { added: 0, topped: 0 };
    const db = await getDB();
    let added = 0;
    let topped = 0;
    await db.withTransactionAsync(async () => {
      for (const it of items) {
        const nn = it?.normalized_name;
        if (!nn) continue;
        // Pull from item_summary. The AI trigger on receipt_items fires before
        // this code runs (same transaction as the receipt_items INSERT in
        // createWithItems is committed before we reach here — actually
        // createWithItems calls this AFTER its own transaction closes, see
        // the integration point in expenses/repo.js).
        const summary = await db.getFirstAsync(
          `SELECT normalized_name, display_name, kind, canonical_unit, points_count
             FROM item_summary
            WHERE normalized_name = ?`,
          [nn]
        );
        if (!summary) continue;
        if ((summary.points_count ?? 0) < 2) continue;

        const existing = await db.getFirstAsync(
          `SELECT id, current_qty FROM pantry_items
            WHERE deleted_at IS NULL AND normalized_name = ?`,
          [nn]
        );
        const incQty = Number(it.canonical_qty) || Number(it.qty) || 0;
        if (existing) {
          await db.runAsync(
            `UPDATE pantry_items SET
               current_qty = current_qty + ?,
               last_topped_up_at = datetime('now')
             WHERE id = ?`,
            [incQty, existing.id]
          );
          topped += 1;
        } else {
          await db.runAsync(
            `INSERT INTO pantry_items
               (normalized_name, display_name, kind, canonical_unit,
                current_qty, last_topped_up_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [
              nn,
              summary.display_name || nn,
              summary.kind || 'other',
              summary.canonical_unit || UNIT_FALLBACK,
              incQty,
            ]
          );
          added += 1;
        }
      }
    });
    return { added, topped };
  },

  // Candidate list for the EditPantryItem picker — items the user has bought
  // but doesn't yet have a live pantry row for. Ordered by recency.
  async candidates({ limit = 50 } = {}) {
    return all(
      `SELECT s.normalized_name, s.display_name, s.kind, s.canonical_unit,
              s.points_count, s.last_seen
         FROM item_summary s
        WHERE NOT EXISTS (
                SELECT 1 FROM pantry_items p
                 WHERE p.deleted_at IS NULL
                   AND p.normalized_name = s.normalized_name
              )
        ORDER BY s.last_seen DESC, s.points_count DESC
        LIMIT ?`,
      [limit]
    );
  },
};
