const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

router.use(auth);

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM categories WHERE user_id=$1 ORDER BY sort_order',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories
router.post('/', async (req, res) => {
  const { name, emoji, budget, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows: existing } = await pool.query('SELECT COUNT(*) FROM categories WHERE user_id=$1', [req.userId]);
    const sort_order = parseInt(existing[0].count);
    const { rows } = await pool.query(
      'INSERT INTO categories (user_id, name, emoji, budget, color, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.userId, name, emoji || '💰', budget || 0, color || 'cream', sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id
router.put('/:id', async (req, res) => {
  const { name, emoji, budget, color } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE categories SET
        name   = COALESCE($3, name),
        emoji  = COALESCE($4, emoji),
        budget = COALESCE($5, budget),
        color  = COALESCE($6, color)
      WHERE id=$1 AND user_id=$2 RETURNING *
    `, [req.params.id, req.userId, name, emoji, budget, color]);
    if (!rows[0]) return res.status(404).json({ error: 'Category not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (!rowCount) return res.status(404).json({ error: 'Category not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
