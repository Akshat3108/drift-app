const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM subscriptions WHERE user_id=$1 ORDER BY created_at', [req.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

router.post('/', async (req, res) => {
  const { name, amount, period, used_freq, verdict, icon, color } = req.body;
  if (!name || amount == null) return res.status(400).json({ error: 'name and amount required' });
  try {
    const { rows } = await pool.query(`
      INSERT INTO subscriptions (user_id, name, amount, period, used_freq, verdict, icon, color)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [req.userId, name, amount, period || 'mo', used_freq || '', verdict || 'keep', icon || '📦', color || '#888']);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

router.patch('/:id/cancel', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE subscriptions SET cancelled=true WHERE id=$1 AND user_id=$2 RETURNING *',
      [req.params.id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Subscription not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

router.patch('/:id/reinstate', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE subscriptions SET cancelled=false WHERE id=$1 AND user_id=$2 RETURNING *',
      [req.params.id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Subscription not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reinstate subscription' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM subscriptions WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (!rowCount) return res.status(404).json({ error: 'Subscription not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

module.exports = router;
