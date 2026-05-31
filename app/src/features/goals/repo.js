import { exec, all, one } from '../../db';
import { NOT_DELETED } from '../../db/predicates';

const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

// PS-44 — parse the user-typed `goals.eta` (freeform TEXT). Accepts a full date,
// a 'YYYY-MM' month, or a bare 'YYYY' year. Returns epoch ms or null when it
// can't be understood (status then stays informational, no on-track verdict).
function parseUserEta(s) {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();
  if (/^\d{4}-\d{2}$/.test(t)) return Date.parse(`${t}-01`);
  if (/^\d{4}$/.test(t)) return Date.parse(`${t}-01-01`);
  const p = Date.parse(t);
  return Number.isFinite(p) ? p : null;
}

export const goals = {
  async list() {
    return all(`SELECT * FROM goals WHERE ${NOT_DELETED} ORDER BY created_at DESC, id DESC`);
  },
  async get(id) {
    return one('SELECT * FROM goals WHERE id = ?', [id]);
  },
  async create({ name, emoji = '🎯', target_amount, saved_amount = 0, eta }) {
    const res = await exec(
      'INSERT INTO goals (name, emoji, target_amount, saved_amount, eta) VALUES (?, ?, ?, ?, ?)',
      [name, emoji, target_amount, saved_amount, eta ?? null]
    );
    return this.get(res.lastInsertRowId);
  },
  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      'UPDATE goals SET name=?, emoji=?, target_amount=?, saved_amount=?, eta=? WHERE id=?',
      [next.name, next.emoji, next.target_amount, next.saved_amount, next.eta ?? null, id]
    );
    return this.get(id);
  },
  async contribute(id, amount, { note } = {}) {
    await exec('UPDATE goals SET saved_amount = saved_amount + ? WHERE id = ?', [amount, id]);
    // PS-44 — record a ledger row so projectedEta() builds real velocity
    // history. Pre-PS-44 contributions only bumped saved_amount, so existing
    // goals fall back to the created_at projection until they get ≥2 rows here.
    await exec(
      `INSERT INTO goal_contributions (goal_id, amount, note) VALUES (?, ?, ?)`,
      [id, amount, note ?? null]
    );
    return this.get(id);
  },

  // PS-44 — contribution ledger for a goal, oldest first.
  async contributions(goalId) {
    return all(
      `SELECT amount, contributed_at FROM goal_contributions
        WHERE goal_id = ?
        ORDER BY contributed_at ASC, id ASC`,
      [goalId]
    );
  },

  // PS-44 — projected completion ETA + monthly velocity + on-track verdict.
  //
  // Velocity basis (hybrid): when the ledger has ≥2 rows, use total logged
  // contributions over the span from the first contribution to now (captures
  // real pace including gaps). Otherwise fall back to saved_amount ÷ months
  // since the goal was created. Returns null (→ no projection shown) when
  // neither basis yields a positive velocity (e.g. brand-new goal, nothing
  // saved). `status` compares the projected ETA to the user's typed target eta
  // (±1 month tolerance); it's null when that target can't be parsed.
  async projectedEta(goalId) {
    const goal = await this.get(goalId);
    if (!goal) return null;
    const target = Number(goal.target_amount) || 0;
    const saved = Number(goal.saved_amount) || 0;
    const remaining = Math.max(0, target - saved);
    const now = Date.now();

    let velocity = null;   // ₹ / month
    let basis = null;      // 'ledger' | 'created_at'

    const ledger = await this.contributions(goalId);
    if (ledger.length >= 2) {
      const total = ledger.reduce((a, r) => a + (Number(r.amount) || 0), 0);
      const firstMs = Date.parse(ledger[0].contributed_at);
      if (Number.isFinite(firstMs) && total > 0) {
        const months = Math.max((now - firstMs) / MS_PER_MONTH, 0.5);
        velocity = total / months;
        basis = 'ledger';
      }
    }
    if (velocity == null) {
      const createdMs = Date.parse(goal.created_at);
      if (Number.isFinite(createdMs) && saved > 0) {
        const months = (now - createdMs) / MS_PER_MONTH;
        if (months >= 1) { velocity = saved / months; basis = 'created_at'; }
      }
    }
    if (velocity == null || velocity <= 0) return null;

    if (remaining <= 0) {
      return {
        eta_iso: new Date(now).toISOString().slice(0, 10),
        monthly_velocity: Math.round(velocity),
        status: 'ahead', basis, reached: true,
      };
    }

    const etaMs = now + (remaining / velocity) * MS_PER_MONTH;
    const eta_iso = new Date(etaMs).toISOString().slice(0, 10);

    let status = null;
    const targetMs = parseUserEta(goal.eta);
    if (targetMs != null) {
      if (etaMs > targetMs + MS_PER_MONTH) status = 'behind';
      else if (etaMs < targetMs - MS_PER_MONTH) status = 'ahead';
      else status = 'on_track';
    }
    return { eta_iso, monthly_velocity: Math.round(velocity), status, basis, reached: false };
  },
  async remove(id) {
    await exec(`UPDATE goals SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`, [id]);
  },
  async restore(id) {
    await exec('UPDATE goals SET deleted_at = NULL WHERE id = ?', [id]);
  },
};
