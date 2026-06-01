import { exec, all, one } from '../../db';

// PS-10 — Investment holdings repo.
//
// Manual entry: every value (units, unit_cost, current_nav) is user-typed.
// No online price fetch — Rule 5. The notifications feature schedules a
// monthly NAV-update reminder when at least one live holding's
// `last_updated` is older than 25 days (checker in features/notifications).
//
// `current_value(row)` and `cost_basis(row)` are returned by `list()` as
// computed columns so the screen and the NetWorth integration don't repeat
// the multiplication.

export const HOLDING_KINDS = ['mf', 'equity', 'gold', 'fd', 'rd', 'nps', 'ppf', 'other'];

export const KIND_META = {
  mf:     { label: 'Mutual fund', icon: '📊', unitLabel: 'units' },
  equity: { label: 'Equity / stock', icon: '📈', unitLabel: 'shares' },
  gold:   { label: 'Gold', icon: '🟡', unitLabel: 'grams' },
  fd:     { label: 'Fixed deposit', icon: '🏦', unitLabel: 'FD' },
  rd:     { label: 'Recurring deposit', icon: '🔁', unitLabel: 'RD' },
  nps:    { label: 'NPS', icon: '🏛️', unitLabel: 'units' },
  ppf:    { label: 'PPF', icon: '🪙', unitLabel: 'PPF' },
  other:  { label: 'Other', icon: '💼', unitLabel: 'units' },
};

function decorate(row) {
  if (!row) return row;
  const units = Number(row.units) || 0;
  const cost  = Number(row.unit_cost) || 0;
  const nav   = Number(row.current_nav) || 0;
  return {
    ...row,
    current_value: units * nav,
    cost_basis:    units * cost,
    gain:          units * (nav - cost),
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export const holdingsRepo = {
  // PS-31 — append a NAV snapshot to holding_nav_history. One row per day:
  //   · exact same-NAV-same-day      → skip (debounce)
  //   · different NAV, same day       → overwrite that day's row (last write wins)
  //   · new day                       → insert
  // So the chart/XIRR see a clean daily series even if the user edits twice.
  async _recordNav(holdingId, nav, source = 'user', recordedAt = null) {
    const navN = Number(nav);
    if (!Number.isFinite(navN) || navN <= 0) return;
    const day = String(recordedAt || todayIso()).slice(0, 10);
    const last = await one(
      `SELECT id, nav, recorded_at FROM holding_nav_history
         WHERE holding_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1`,
      [holdingId]
    );
    if (last && last.recorded_at === day) {
      if (Number(last.nav) === navN) return;            // debounce exact dupe
      await exec('UPDATE holding_nav_history SET nav = ?, source = ? WHERE id = ?',
        [navN, source, last.id]);
      return;
    }
    await exec(
      `INSERT INTO holding_nav_history (holding_id, nav, recorded_at, source)
       VALUES (?, ?, ?, ?)`,
      [holdingId, navN, day, source]
    );
  },

  async navHistory(holdingId) {
    return all(
      `SELECT id, nav, recorded_at, source FROM holding_nav_history
         WHERE holding_id = ? ORDER BY recorded_at ASC, id ASC`,
      [holdingId]
    );
  },

  async list() {
    const rows = await all(
      `SELECT * FROM holdings
        WHERE deleted_at IS NULL
        ORDER BY sort_order, id`
    );
    return rows.map(decorate);
  },

  async get(id) {
    const row = await one('SELECT * FROM holdings WHERE id = ?', [id]);
    return decorate(row);
  },

  async create({
    kind, label, units = 0, unit_cost = 0, current_nav = 0,
    last_updated = null, account_id = null, notes = null,
    icon = null, color = null, sort_order = null,
  }) {
    if (!HOLDING_KINDS.includes(kind)) {
      throw new Error(`Invalid holding kind: ${kind}`);
    }
    let nextOrder = sort_order;
    if (nextOrder == null) {
      const r = await one('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM holdings WHERE deleted_at IS NULL');
      nextOrder = r?.n ?? 0;
    }
    const meta = KIND_META[kind] || KIND_META.other;
    const res = await exec(
      `INSERT INTO holdings
         (kind, label, units, unit_cost, current_nav, last_updated,
          account_id, notes, icon, color, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kind, label, units, unit_cost, current_nav, last_updated,
        account_id, notes,
        icon  || meta.icon,
        color || '#6a8d73',
        nextOrder,
      ]
    );
    const created = await this.get(res.lastInsertRowId);
    // PS-31 — seed the first NAV-history point so the returns chart has an origin.
    await this._recordNav(created.id, current_nav, 'seed', last_updated);
    return created;
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    if (!HOLDING_KINDS.includes(next.kind)) {
      throw new Error(`Invalid holding kind: ${next.kind}`);
    }
    await exec(
      `UPDATE holdings SET
         kind = ?, label = ?, units = ?, unit_cost = ?, current_nav = ?,
         last_updated = ?, account_id = ?, notes = ?, icon = ?, color = ?,
         sort_order = ?
       WHERE id = ?`,
      [
        next.kind, next.label, next.units, next.unit_cost, next.current_nav,
        next.last_updated, next.account_id, next.notes, next.icon, next.color,
        next.sort_order, id,
      ]
    );
    // PS-31 — record a NAV point when the NAV actually moved (skip label-only
    // edits so the series isn't padded with flat duplicates).
    if (Number(next.current_nav) !== Number(cur.current_nav)) {
      await this._recordNav(id, next.current_nav, 'manual_edit', next.last_updated);
    }
    return this.get(id);
  },

  // Convenience for the Holdings list "Update NAV" inline action — stamps
  // last_updated = today without re-typing every field.
  async updateNav(id, current_nav) {
    const today = new Date().toISOString().slice(0, 10);
    await exec(
      `UPDATE holdings SET current_nav = ?, last_updated = ? WHERE id = ?`,
      [current_nav, today, id]
    );
    await this._recordNav(id, current_nav, 'user', today);
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE holdings SET deleted_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec('UPDATE holdings SET deleted_at = NULL WHERE id = ?', [id]);
  },

  // Aggregate read for NetWorth screen + the NAV-stale checker.
  async totals() {
    const row = await one(`
      SELECT
        COALESCE(SUM(units * current_nav), 0) AS market_value,
        COALESCE(SUM(units * unit_cost),  0) AS cost_basis,
        COUNT(*) AS count,
        MIN(last_updated)                     AS oldest_update
      FROM holdings
      WHERE deleted_at IS NULL
    `);
    return {
      marketValue: row?.market_value || 0,
      costBasis:   row?.cost_basis   || 0,
      gain:        (row?.market_value || 0) - (row?.cost_basis || 0),
      count:       row?.count || 0,
      oldestUpdate: row?.oldest_update || null,
    };
  },
};
