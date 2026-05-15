const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

function sign(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email, name, avatar',
      [email.toLowerCase(), hash, name]
    );
    const user = rows[0];
    // Create default settings
    await pool.query('INSERT INTO settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    // Seed default categories
    const cats = [
      ['Food & Drink', '🍴', 6000, 'cream', 0],
      ['Groceries',    '🥬', 4000, 'mint',  1],
      ['Transport',    '🚲', 2500, 'sky',   2],
      ['Fun',          '🎬', 3000, 'blush', 3],
      ['Health',       '💊', 2500, 'mint',  4],
      ['Bills',        '🧾', 5000, 'butter',5],
      ['Subscriptions','📺', 2000, 'lilac', 6],
    ];
    for (const [name, emoji, budget, color, sort_order] of cats) {
      await pool.query(
        'INSERT INTO categories (user_id, name, emoji, budget, color, sort_order) VALUES ($1,$2,$3,$4,$5,$6)',
        [user.id, name, emoji, budget, color, sort_order]
      );
    }
    res.status(201).json({ token: sign(user.id), user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: sign(user.id), user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
const auth = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, name, avatar, created_at FROM users WHERE id=$1', [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
