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

  // 8.12 — fires from the maintenance orchestrator on bg→fg. Short-circuits
  // when today's row already exists (AccountsProvider stamps it on boot +
  // every mutation, so this is usually a no-op during active use). The
  // value is for days when the user doesn't open the app — the next bg→fg
  // notices the gap and lands a snapshot, keeping the trajectory chart
  // unbroken across long quiet stretches.
  async ensureTodaySnapshotIfMissing(now = new Date()) {
    const existing = await this.getToday(now);
    if (existing) return { skipped: 'already-present' };
    return this.ensureTodaySnapshot(now);
  },

  // PS-04 — trailing-N-month savings rate for the NetWorth projection line.
  // Excludes the current (in-progress) month so a half-month sample doesn't
  // pull the average down. `ready=false` when any month in the window has
  // zero income (avoids a misleading 100% savings rate on a salary gap).
  async trailingSavingsRate({ months = 3 } = {}) {
    const range = await one(`
      SELECT strftime('%Y-%m', date('now','-' || ? || ' month')) AS m_from,
             strftime('%Y-%m', date('now','-1 month'))           AS m_to
    `, [months]);

    const incomeRows = await all(`
      SELECT month_key, COALESCE(SUM(amount), 0) AS total
        FROM income
       WHERE deleted_at IS NULL
         AND month_key BETWEEN ? AND ?
       GROUP BY month_key
    `, [range.m_from, range.m_to]);

    const spendRows = await all(`
      SELECT month_key, COALESCE(SUM(amount), 0) AS total
        FROM expenses
       WHERE deleted_at IS NULL
         AND month_key BETWEEN ? AND ?
       GROUP BY month_key
    `, [range.m_from, range.m_to]);

    const inc = new Map(incomeRows.map((r) => [r.month_key, r.total]));
    const spd = new Map(spendRows.map((r) => [r.month_key, r.total]));

    // Walk every month in the window so missing months count as zero income
    // (which will trip the ready gate). m_from..m_to chronological.
    const slots = [];
    const [tyStr, tmStr] = range.m_to.split('-');
    let ty = parseInt(tyStr, 10), tm = parseInt(tmStr, 10);
    for (let i = 0; i < months; i++) {
      const mk = `${ty}-${String(tm).padStart(2, '0')}`;
      slots.unshift(mk);
      tm -= 1; if (tm === 0) { tm = 12; ty -= 1; }
    }

    let sumInc = 0, sumSpd = 0, anyZeroIncome = false;
    for (const mk of slots) {
      const i = inc.get(mk) || 0;
      const s = spd.get(mk) || 0;
      sumInc += i; sumSpd += s;
      if (i <= 0) anyZeroIncome = true;
    }

    const incomeAvg = sumInc / months;
    const spendAvg  = sumSpd / months;
    const savingsAvg = incomeAvg - spendAvg;
    const savingsRate = incomeAvg > 0 ? savingsAvg / incomeAvg : null;
    const ready = !anyZeroIncome;

    return {
      ready,
      windowMonths: months,
      window: { from: range.m_from, to: range.m_to },
      incomeAvg, spendAvg, savingsAvg, savingsRate,
    };
  },
};
