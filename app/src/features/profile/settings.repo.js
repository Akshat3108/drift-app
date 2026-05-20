import { exec, one } from '../../db';

const DEFAULTS = { currency: 'INR', dark_mode: 0, carbon_tracking: 1 };

export const settings = {
  async get() {
    const row = await one('SELECT * FROM settings WHERE id = 1');
    return row || { id: 1, ...DEFAULTS };
  },
  async set(patch) {
    const cur = await this.get();
    const next = { ...cur, ...patch };
    await exec(
      `INSERT INTO settings (id, currency, dark_mode, carbon_tracking)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         currency = excluded.currency,
         dark_mode = excluded.dark_mode,
         carbon_tracking = excluded.carbon_tracking`,
      [
        next.currency,
        next.dark_mode ? 1 : 0,
        next.carbon_tracking ? 1 : 0,
      ]
    );
    return this.get();
  },
};
