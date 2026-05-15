const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM goals WHERE user_id=$1 ORDER BY created_at', [req.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

router.post('/', async (req, res) => {
  const { name, emoji, target_amount, saved_amount, eta } = req.body;
  if (!name || !target_amount) return res.status(400).json({ error: 'name and target_amount required' });
  try {
    const { rows } = await pool.query(`
      INSERT INTO goals (user_id, name, emoji, target_amount, saved_amount, eta)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.userId, name, emoji || '🎯', target_amount, saved_amount || 0, eta || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, emoji, target_amount, saved_amount, eta } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE goals SET
        name          = COALESCE($3, name),
        emoji         = COALESCE($4, emoji),
        target_amount = COALESCE($5, target_amount),
        saved_amount  = COALESCE($6, saved_amount),
        eta           = COALESCE($7, eta)
      WHERE id=$1 AND user_id=$2 RETURNING *
    `, [req.params.id, req.userId, name, emoji, target_amount, saved_amount, eta]);
    if (!rows[0]) return res.status(404).json({ error: 'Goal not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM goals WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (!rowCount) return res.status(404).json({ error: 'Goal not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

module.exports = router;
