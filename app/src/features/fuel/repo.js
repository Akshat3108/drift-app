import { exec, all, one, getDB } from '../../db';
import { merchants } from '@features/expenses/merchants.repo';

// 7.6 — Vehicles & fuel-fillups repos.
//
// Two parallel repos so the feature folder owns both surfaces. Vehicles are a
// thin user-owned reference table; fuel_fillups is the time-series table that
// actually carries spend + liters + odometer per fill-up. A fill-up is always
// 1-to-1 with an `expenses` row (UNIQUE FK), so create/update go through a
// shared transaction helper that writes both rows atomically — anything else
// would let a fuel write half-succeed.

const VEHICLE_ICONS  = ['🚗', '🏍️', '🛵', '🚙', '🚐', '🚜', '🚛'];
const VEHICLE_COLORS = ['#888', '#7d6555', '#e88373', '#6a8d73', '#b09c8a', '#a3c7e9', '#d9272e'];

function pickIcon(idx)  { return VEHICLE_ICONS [(idx % VEHICLE_ICONS.length + VEHICLE_ICONS.length) % VEHICLE_ICONS.length]; }
function pickColor(idx) { return VEHICLE_COLORS[(idx % VEHICLE_COLORS.length + VEHICLE_COLORS.length) % VEHICLE_COLORS.length]; }

export const vehiclesRepo = {
  async listLive() {
    return all(
      `SELECT * FROM vehicles
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC, id DESC`
    );
  },

  async get(id) {
    return one('SELECT * FROM vehicles WHERE id = ?', [id]);
  },

  async create({
    name, type = 'car', fuel_type = 'Petrol',
    registration_number = null, notes = null,
    icon = null, color = null,
  }) {
    const existing = await all('SELECT COUNT(*) AS n FROM vehicles');
    const fallbackIdx = existing?.[0]?.n ?? 0;
    const res = await exec(
      `INSERT INTO vehicles
         (name, type, fuel_type, registration_number, notes, icon, color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name, type, fuel_type, registration_number, notes,
        icon  || pickIcon(fallbackIdx),
        color || pickColor(fallbackIdx),
      ]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE vehicles SET
         name = ?, type = ?, fuel_type = ?,
         registration_number = ?, notes = ?, icon = ?, color = ?
       WHERE id = ?`,
      [
        next.name, next.type, next.fuel_type,
        next.registration_number, next.notes, next.icon, next.color,
        id,
      ]
    );
    return this.get(id);
  },

  async remove(id) {
    // Soft delete the vehicle. fuel_fillups rows are FK CASCADE on hard delete
    // only — for the soft path we leave history visible under "deleted vehicle"
    // until a Recycle Bin feature ships. Restore() flips deleted_at back to NULL.
    await exec(
      `UPDATE vehicles SET deleted_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec('UPDATE vehicles SET deleted_at = NULL WHERE id = ?', [id]);
  },
};

export const fillupsRepo = {
  // All live fill-ups for a vehicle, most recent first. Uses
  // idx_fillups_vehicle_date (partial WHERE deleted_at IS NULL).
  async listByVehicle(vehicleId) {
    if (vehicleId == null) return [];
    return all(
      `SELECT * FROM fuel_fillups
        WHERE deleted_at IS NULL AND vehicle_id = ?
        ORDER BY fill_date DESC, id DESC`,
      [vehicleId]
    );
  },

  // Bulk variant used by the Vehicles list hero card — returns a map keyed
  // by vehicle_id with {count, this_month_spend, last_fill_date}.
  async aggregatesByVehicle() {
    const monthKey = new Date().toISOString().slice(0, 7);
    const rows = await all(
      `SELECT vehicle_id,
              COUNT(*)                                AS count,
              MAX(fill_date)                          AS last_fill_date,
              SUM(CASE WHEN substr(fill_date,1,7) = ?
                       THEN amount ELSE 0 END)        AS this_month_spend
         FROM fuel_fillups
        WHERE deleted_at IS NULL
        GROUP BY vehicle_id`,
      [monthKey]
    );
    const map = {};
    for (const r of rows) map[r.vehicle_id] = r;
    return map;
  },

  async get(id) {
    return one('SELECT * FROM fuel_fillups WHERE id = ?', [id]);
  },

  async getByExpense(expenseId) {
    if (expenseId == null) return null;
    return one(
      `SELECT * FROM fuel_fillups
        WHERE expense_id = ? AND deleted_at IS NULL`,
      [expenseId]
    );
  },

  // The Scan review screen calls this to auto-pick a vehicle for the chip.
  // Returns the vehicle_id of the most-recent live fill-up across all
  // vehicles, or null if none exist.
  async lastVehicleUsed() {
    const row = await one(
      `SELECT vehicle_id FROM fuel_fillups
        WHERE deleted_at IS NULL
        ORDER BY fill_date DESC, id DESC
        LIMIT 1`
    );
    return row?.vehicle_id ?? null;
  },

  // Pure SQL mileage window: the two most-recent full-tank fills with a
  // non-null odometer. Returns null when fewer than 2 such fills exist —
  // callers render "—" in that case. Distance is the odometer delta; liters
  // is the more-recent fill's tank capacity (the standard "full-to-full"
  // method). kmpl = distance / liters.
  async mileageWindow(vehicleId) {
    if (vehicleId == null) return null;
    const rows = await all(
      `SELECT odometer_km, liters
         FROM fuel_fillups
        WHERE deleted_at IS NULL
          AND vehicle_id = ?
          AND is_full_tank = 1
          AND odometer_km IS NOT NULL
        ORDER BY fill_date DESC, id DESC
        LIMIT 2`,
      [vehicleId]
    );
    if (rows.length < 2) return null;
    const [latest, prior] = rows;
    const km = latest.odometer_km - prior.odometer_km;
    if (!(km > 0) || !(latest.liters > 0)) return null;
    return {
      km_driven: +km.toFixed(1),
      liters_burned: latest.liters,
      kmpl: +(km / latest.liters).toFixed(2),
    };
  },

  // Atomic dual-write: create the expense row first, then the fill-up that
  // points at it. Wrapped in withTransactionAsync so a failure on either
  // side rolls both rows back. Returns the new fill-up id + the created
  // expense id so callers can refresh the in-memory expenses slice.
  async createWithExpense({ expense, fillup }) {
    const db = await getDB();
    let createdExpenseId = null;
    let createdFillupId  = null;
    await db.withTransactionAsync(async () => {
      const merchantId = expense.merchant_id != null
        ? expense.merchant_id
        : await merchants.resolve(expense.merchant);
      const expRes = await db.runAsync(
        `INSERT INTO expenses
           (category_id, merchant, merchant_id, amount, mood, carbon, recurring,
            notes, receipt_uri, expense_date, payment_method,
            gstin, invoice_number, cgst, sgst, igst,
            receipt_hash, receipt_soft_hash,
            receipt_path, receipt_thumb, receipt_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?,
                 ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?)`,
        [
          expense.category_id ?? null,
          expense.merchant,
          merchantId,
          expense.amount,
          expense.mood ?? null,
          expense.carbon ?? 0,
          expense.recurring ? 1 : 0,
          expense.notes ?? null,
          expense.receipt_uri ?? null,
          expense.expense_date ?? null,
          expense.payment_method ?? null,
          expense.gstin ?? null,
          expense.invoice_number ?? null,
          expense.cgst ?? null,
          expense.sgst ?? null,
          expense.igst ?? null,
          expense.receipt_hash ?? null,
          expense.receipt_soft_hash ?? null,
          expense.receipt_path ?? null,
          expense.receipt_thumb ?? null,
          expense.receipt_bytes ?? null,
        ]
      );
      createdExpenseId = expRes.lastInsertRowId;
      const fillRes = await db.runAsync(
        `INSERT INTO fuel_fillups
           (vehicle_id, expense_id, fill_date, liters, rate_per_l, amount,
            odometer_km, is_full_tank, fuel_type, notes)
         VALUES (?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?, ?, ?)`,
        [
          fillup.vehicle_id,
          createdExpenseId,
          fillup.fill_date ?? expense.expense_date ?? null,
          fillup.liters,
          fillup.rate_per_l ?? null,
          fillup.amount,
          fillup.odometer_km ?? null,
          fillup.is_full_tank == null ? 1 : (fillup.is_full_tank ? 1 : 0),
          fillup.fuel_type ?? null,
          fillup.notes ?? null,
        ]
      );
      createdFillupId = fillRes.lastInsertRowId;
    });
    return { expense_id: createdExpenseId, fillup_id: createdFillupId };
  },

  // Patches the existing fill-up + its linked expense in one transaction.
  // expense_id on the fill-up is immutable here; if the caller wants to
  // re-target an expense, they should remove() + createWithExpense().
  async updatePair(fillupId, { expensePatch, fillupPatch }) {
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      const f = await db.getFirstAsync(
        'SELECT * FROM fuel_fillups WHERE id = ?',
        [fillupId]
      );
      if (!f) return;
      const nextF = { ...f, ...fillupPatch };
      await db.runAsync(
        `UPDATE fuel_fillups SET
           vehicle_id = ?, fill_date = ?, liters = ?, rate_per_l = ?,
           amount = ?, odometer_km = ?, is_full_tank = ?, fuel_type = ?,
           notes = ?
         WHERE id = ?`,
        [
          nextF.vehicle_id,
          nextF.fill_date,
          nextF.liters,
          nextF.rate_per_l ?? null,
          nextF.amount,
          nextF.odometer_km ?? null,
          nextF.is_full_tank ? 1 : 0,
          nextF.fuel_type ?? null,
          nextF.notes ?? null,
          fillupId,
        ]
      );
      if (expensePatch && f.expense_id != null) {
        const e = await db.getFirstAsync(
          'SELECT * FROM expenses WHERE id = ?',
          [f.expense_id]
        );
        if (e) {
          const nextE = { ...e, ...expensePatch };
          await db.runAsync(
            `UPDATE expenses SET
               category_id = ?, merchant = ?, amount = ?,
               expense_date = ?, notes = ?, payment_method = ?
             WHERE id = ?`,
            [
              nextE.category_id ?? null,
              nextE.merchant,
              nextE.amount,
              nextE.expense_date,
              nextE.notes ?? null,
              nextE.payment_method ?? null,
              f.expense_id,
            ]
          );
        }
      }
    });
    return this.get(fillupId);
  },

  // Soft delete the fill-up. The linked expense stays — deleting the expense
  // separately CASCADEs to the fill-up (hard FK), but the soft path keeps
  // both rows hidden via their deleted_at columns. Removing both at once
  // mirrors expenses.remove which soft-deletes its receipt_items children.
  async remove(id) {
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      const row = await db.getFirstAsync(
        'SELECT expense_id FROM fuel_fillups WHERE id = ?',
        [id]
      );
      await db.runAsync(
        `UPDATE fuel_fillups SET deleted_at = datetime('now')
          WHERE id = ? AND deleted_at IS NULL`,
        [id]
      );
      if (row?.expense_id != null) {
        await db.runAsync(
          `UPDATE expenses SET deleted_at = datetime('now')
            WHERE id = ? AND deleted_at IS NULL`,
          [row.expense_id]
        );
        await db.runAsync(
          `UPDATE receipt_items SET deleted_at = datetime('now')
            WHERE expense_id = ? AND deleted_at IS NULL`,
          [row.expense_id]
        );
      }
    });
  },

  async restore(id) {
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      const row = await db.getFirstAsync(
        'SELECT expense_id FROM fuel_fillups WHERE id = ?',
        [id]
      );
      await db.runAsync('UPDATE fuel_fillups SET deleted_at = NULL WHERE id = ?', [id]);
      if (row?.expense_id != null) {
        await db.runAsync('UPDATE expenses SET deleted_at = NULL WHERE id = ?', [row.expense_id]);
        await db.runAsync(
          `UPDATE receipt_items SET deleted_at = NULL WHERE expense_id = ?`,
          [row.expense_id]
        );
      }
    });
  },
};
