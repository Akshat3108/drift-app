// PS-45 — cash-on-hand reconciliation (opt-in via settings.track_cash, v55).
//
// The 3.7 `account_transactions` ledger existed but had no writer; this is it.
// `accounts.balance` is the live source NetWorth + the PS-22 health score read,
// so every ledger write here keeps that column in sync transactionally — the
// ledger is the audit trail, the column is the truth.
//
// Opt-in: nothing here runs unless the user turns on "Track cash on hand", at
// which point a single Cash asset account is auto-created. Cash expenses then
// debit it; "Reconcile cash" snaps it to a counted value.

import { exec, all, one, getDB } from '../../db';

const CASH_WHERE = `kind = 'asset' AND deleted_at IS NULL
  AND (lower(category) = 'cash' OR lower(label) = 'cash')`;

export const cashRepo = {
  async getCashAccount() {
    return one(`SELECT * FROM accounts WHERE ${CASH_WHERE} ORDER BY id LIMIT 1`);
  },

  // Idempotent: returns the existing Cash account or creates one.
  async ensureCashAccount() {
    const existing = await this.getCashAccount();
    if (existing) return existing;
    const res = await exec(
      `INSERT INTO accounts (kind, label, emoji, balance, category)
       VALUES ('asset', 'Cash', '💵', 0, 'cash')`,
    );
    return one('SELECT * FROM accounts WHERE id = ?', [res.lastInsertRowId]);
  },

  // Apply a cash expense to the wallet. amount > 0 debits (spent cash); a
  // negative amount (a logged refund/return) credits it back. Writes the ledger
  // row + adjusts the balance in one transaction.
  async applyExpense({ amount, expenseId = null, note = null }) {
    const amt = Number(amount) || 0;
    if (amt === 0) return null;
    const cash = await this.ensureCashAccount();
    const db = await getDB();
    const kind = amt >= 0 ? 'debit' : 'credit';
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO account_transactions (account_id, amount, kind, note, expense_id)
         VALUES (?, ?, ?, ?, ?)`,
        [cash.id, Math.abs(amt), kind, note || 'cash expense', expenseId],
      );
      await db.runAsync('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amt, cash.id]);
    });
    return this.getCashAccount();
  },

  // Snap the cash balance to a counted value, recording the gap as a
  // note='reconcile' adjustment txn so the history explains the jump.
  async reconcile(target) {
    const t = Number(target);
    if (!Number.isFinite(t)) throw new Error('Enter a valid amount');
    const cash = await this.ensureCashAccount();
    const delta = t - (Number(cash.balance) || 0);
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      if (delta !== 0) {
        await db.runAsync(
          `INSERT INTO account_transactions (account_id, amount, kind, note)
           VALUES (?, ?, ?, 'reconcile')`,
          [cash.id, Math.abs(delta), delta >= 0 ? 'credit' : 'debit'],
        );
      }
      await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [t, cash.id]);
    });
    return this.getCashAccount();
  },

  // Recent ledger rows for the cash account (Reconcile modal history).
  async recentTxns(limit = 20) {
    const cash = await this.getCashAccount();
    if (!cash) return [];
    return all(
      `SELECT * FROM account_transactions WHERE account_id = ?
        ORDER BY txn_date DESC, id DESC LIMIT ?`,
      [cash.id, limit],
    );
  },
};
