require('dotenv').config();
const pool = require('./pool');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const client = await pool.connect();
  try {
    // Demo user
    const userId = uuidv4();
    const hash = await bcrypt.hash('password123', 10);
    await client.query(`
      INSERT INTO users (id, email, password_hash, name, avatar)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
    `, [userId, 'demo@drift.app', hash, 'Riya Kapoor', 'R']);

    const { rows } = await client.query('SELECT id FROM users WHERE email=$1', ['demo@drift.app']);
    const uid = rows[0].id;

    // Wipe prior demo data so re-running this script is idempotent
    await client.query('DELETE FROM expenses      WHERE user_id=$1', [uid]);
    await client.query('DELETE FROM categories    WHERE user_id=$1', [uid]);
    await client.query('DELETE FROM subscriptions WHERE user_id=$1', [uid]);
    await client.query('DELETE FROM goals         WHERE user_id=$1', [uid]);

    // Settings
    await client.query(`
      INSERT INTO settings (user_id, currency, dark_mode)
      VALUES ($1, 'INR', false)
      ON CONFLICT (user_id) DO NOTHING
    `, [uid]);

    // Categories
    const cats = [
      { name: 'Food & Drink',  emoji: '🍴', budget: 6000,  color: 'cream', sort_order: 0 },
      { name: 'Groceries',     emoji: '🥬', budget: 4000,  color: 'mint',  sort_order: 1 },
      { name: 'Transport',     emoji: '🚲', budget: 2500,  color: 'sky',   sort_order: 2 },
      { name: 'Fun',           emoji: '🎬', budget: 3000,  color: 'blush', sort_order: 3 },
      { name: 'Health',        emoji: '💊', budget: 2500,  color: 'mint',  sort_order: 4 },
      { name: 'Bills',         emoji: '🧾', budget: 5000,  color: 'butter',sort_order: 5 },
      { name: 'Subscriptions', emoji: '📺', budget: 2000,  color: 'lilac', sort_order: 6 },
    ];
    const catIds = {};
    for (const c of cats) {
      const r = await client.query(`
        INSERT INTO categories (user_id, name, emoji, budget, color, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
      `, [uid, c.name, c.emoji, c.budget, c.color, c.sort_order]);
      catIds[c.name] = r.rows[0].id;
    }

    // Sample expenses
    const expenses = [
      { merchant: 'Blue Bottle Coffee', cat: 'Food & Drink', amount: 625,   mood: '😌', carbon: 0.4,  days: 0 },
      { merchant: 'Whole Foods Market', cat: 'Groceries',    amount: 8430,  mood: '😐', carbon: 3.2,  days: 0 },
      { merchant: 'Uber',               cat: 'Transport',    amount: 1840,  mood: '😕', carbon: 2.1,  days: 1 },
      { merchant: 'Netflix',            cat: 'Subscriptions',amount: 1599,  mood: '😊', carbon: 0.1,  days: 1, recurring: true },
      { merchant: "Trader Joe's",       cat: 'Groceries',    amount: 4218,  mood: '😌', carbon: 1.8,  days: 3 },
      { merchant: 'Equinox',            cat: 'Health',       amount: 21500, mood: '😊', carbon: 0.2,  days: 3, recurring: true },
      { merchant: 'Amazon',             cat: 'Fun',          amount: 6742,  mood: '😬', carbon: 4.1,  days: 4 },
    ];
    for (const e of expenses) {
      const d = new Date(); d.setDate(d.getDate() - e.days);
      await client.query(`
        INSERT INTO expenses (user_id, category_id, merchant, amount, mood, carbon, recurring, expense_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [uid, catIds[e.cat], e.merchant, e.amount / 100, e.mood, e.carbon, e.recurring || false, d.toISOString().split('T')[0]]);
    }

    // Subscriptions
    const subs = [
      { name: 'Netflix',       amount: 15.99,  period: 'mo', used_freq: 'Daily',      verdict: 'keep',   icon: '📺', color: '#e50914' },
      { name: 'Spotify',       amount: 10.99,  period: 'mo', used_freq: 'Daily',      verdict: 'keep',   icon: '🎧', color: '#1db954' },
      { name: 'NYT',           amount: 17.00,  period: 'mo', used_freq: '2× last mo', verdict: 'review', icon: '📰', color: '#000' },
      { name: 'Equinox',       amount: 215.00, period: 'mo', used_freq: '3× last mo', verdict: 'review', icon: '🏋', color: '#222' },
      { name: 'iCloud+ 200GB', amount: 2.99,   period: 'mo', used_freq: 'Always',     verdict: 'keep',   icon: '☁️', color: '#0a84ff' },
      { name: 'Masterclass',   amount: 16.00,  period: 'mo', used_freq: '0× in 90d',  verdict: 'cancel', icon: '🎓', color: '#d9272e' },
      { name: 'Adobe CC',      amount: 59.99,  period: 'mo', used_freq: 'Weekly',     verdict: 'keep',   icon: '🅰️', color: '#fa0f00' },
      { name: 'Headspace',     amount: 12.99,  period: 'mo', used_freq: '0× in 60d',  verdict: 'cancel', icon: '🧘', color: '#f47d31' },
    ];
    for (const s of subs) {
      await client.query(`
        INSERT INTO subscriptions (user_id, name, amount, period, used_freq, verdict, icon, color)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [uid, s.name, s.amount, s.period, s.used_freq, s.verdict, s.icon, s.color]);
    }

    // Goals
    const goals = [
      { name: 'Japan trip',     emoji: '✈️', target_amount: 3000, saved_amount: 1240, eta: 'Aug 2026' },
      { name: 'Emergency fund', emoji: '🛟', target_amount: 5000, saved_amount: 4600, eta: 'Jun 2026' },
      { name: 'New laptop',     emoji: '💻', target_amount: 2200, saved_amount: 520,  eta: 'Sep 2026' },
    ];
    for (const g of goals) {
      await client.query(`
        INSERT INTO goals (user_id, name, emoji, target_amount, saved_amount, eta)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [uid, g.name, g.emoji, g.target_amount, g.saved_amount, g.eta]);
    }

    console.log('✅  Seed data inserted');
    console.log('    Demo login: demo@drift.app / password123');
  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
