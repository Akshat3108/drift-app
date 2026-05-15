const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

router.use(auth);

// GET /api/expenses  ?month=2026-05&category_id=&limit=50&offset=0
router.get('/', async (req, res) => {
  const { month, category_id, limit = 50, offset = 0 } = req.query;
  try {
    let q = `
      SELECT e.*, c.name as category_name, c.emoji as category_emoji, c.color as category_color
      FROM expenses e
      LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = $1
    `;
    const params = [req.userId];
    if (month) {
      params.push(month + '-01');
      params.push(month + '-31');
      q += ` AND e.expense_date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    if (category_id) {
      params.push(category_id);
      q += ` AND e.category_id = $${params.length}`;
    }
    q += ` ORDER BY e.expense_date DESC, e.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// GET /api/expenses/summary  — totals per category for current month
router.get('/summary', async (req, res) => {
  const { month } = req.query;
  const m = month || new Date().toISOString().slice(0, 7);
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.name, c.emoji, c.color, c.budget,
             COALESCE(SUM(e.amount), 0) as spent
      FROM categories c
      LEFT JOIN expenses e ON e.category_id = c.id
        AND TO_CHAR(e.expense_date, 'YYYY-MM') = $2
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.sort_order
    `, [req.userId, m]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /api/expenses/monthly-trend  — last 6 months totals
router.get('/monthly-trend', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(expense_date, 'Mon') as month,
             TO_CHAR(expense_date, 'YYYY-MM') as month_key,
             SUM(amount) as total
      FROM expenses
      WHERE user_id = $1
        AND expense_date >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(expense_date, 'Mon'), TO_CHAR(expense_date, 'YYYY-MM')
      ORDER BY month_key
    `, [req.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trend' });
  }
});

// GET /api/expenses/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.*, c.name as category_name, c.emoji as category_emoji, c.color as category_color
      FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.id = $1 AND e.user_id = $2
    `, [req.params.id, req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

// POST /api/expenses
router.post('/', async (req, res) => {
  const { category_id, merchant, amount, mood, carbon, recurring, notes, expense_date } = req.body;
  if (!merchant || amount == null) return res.status(400).json({ error: 'merchant and amount required' });
  try {
    const { rows } = await pool.query(`
      INSERT INTO expenses (user_id, category_id, merchant, amount, mood, carbon, recurring, notes, expense_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [req.userId, category_id || null, merchant, amount, mood || null, carbon || 0, recurring || false, notes || null, expense_date || new Date().toISOString().split('T')[0]]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  const { category_id, merchant, amount, mood, carbon, recurring, notes, expense_date } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE expenses SET
        category_id = COALESCE($3, category_id),
        merchant    = COALESCE($4, merchant),
        amount      = COALESCE($5, amount),
        mood        = COALESCE($6, mood),
        carbon      = COALESCE($7, carbon),
        recurring   = COALESCE($8, recurring),
        notes       = COALESCE($9, notes),
        expense_date= COALESCE($10, expense_date)
      WHERE id = $1 AND user_id = $2 RETURNING *
    `, [req.params.id, req.userId, category_id, merchant, amount, mood, carbon, recurring, notes, expense_date]);
    if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM expenses WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
    if (!rowCount) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

module.exports = router;
