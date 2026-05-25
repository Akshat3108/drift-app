import { all, one, exec, getDB } from '../../db';

// 7.13 — Net-worth snapshot helpers.
//
// `account_snapshots(snapshot_date PK, total_assets, total_liabilities, net,
// computed_at)`. One row per local day. `ensureTodaySnapshot()` is called by
// AccountsProvider on boot + after every mutation; it computes the totals
// from the live accounts table and INSERT OR REPLACEs the today row.
//
// Soft-deleted accounts are excluded (they shouldn't appear in net worth).
// The snapshot captures the value at compute time — later edits to a balance
// don't rewrite past snapshots. That's the point of a snapshot.

export function todayLocalKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Pure: takes a list of {kind, balance, deleted_at} rows and returns
// {total_assets, total_liabilities, net}. Exported for /tmp/ validation.
export function totalsFromAccounts(rows) {
  let a = 0, l = 0;
  for (const r of rows || []) {
    if (r.deleted_at) continue;
    const bal = Number(r.balance) || 0;
    if (r.kind === 'asset') a += bal;
    else if (r.kind === 'liability') l += bal;
  }
  return {
    total_assets: a,
    total_liabilities: l,
    net: a - l,
  };
}

export const snapshotsRepo = {
  // Recompute today's snapshot from the live accounts table.  Idempotent —
  // multiple computes the same day overwrite via the PK conflict.
  async ensureTodaySnapshot(now = new Date()) {
    const dateKey = todayLocalKey(now);
    const rows = await all(
      `SELECT kind, balance, deleted_at FROM accounts`
    );
    const { total_assets, total_liabilities, net } = totalsFromAccounts(rows);
    await exec(
      `INSERT INTO account_snapshots
         (snapshot_date, total_assets, total_liabilities, net, computed_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT (snapshot_date) DO UPDATE SET
         total_assets      = excluded.total_assets,
         total_liabilities = excluded.total_liabilities,
         net               = excluded.net,
         computed_at       = excluded.computed_at`,
      [dateKey, total_assets, total_liabilities, net]
    );
    return { snapshot_date: dateKey, total_assets, total_liabilities, net };
  },

  async getToday(now = new Date()) {
    return one(
      'SELECT * FROM account_snapshots WHERE snapshot_date = ?',
      [todayLocalKey(now)]
    );
  },

  // Trajectory series — oldest→newest. `days` = window from today backwards;
  // `all=true` overrides to return every snapshot ever taken.
  async trajectory({ days = 90, all: allTime = false } = {}) {
    if (allTime) {
      return all(
        `SELECT snapshot_date, total_assets, total_liabilities, net
           FROM account_snapshots
          ORDER BY snapshot_date ASC`
      );
    }
    return all(
      `SELECT snapshot_date, total_assets, total_liabilities, net
         FROM account_snapshots
        WHERE snapshot_date >= date('now', '-' || ? || ' days')
        ORDER BY snapshot_date ASC`,
      [days]
    );
  },

  async count() {
    const row = await one('SELECT COUNT(*) AS n FROM account_snapshots');
    return row?.n || 0;
  },
};
