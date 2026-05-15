const router = require('express').Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE user_id=$1', [req.userId]);
    res.json(rows[0] || { currency: 'INR', dark_mode: false });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/', async (req, res) => {
  const { currency, dark_mode } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO settings (user_id, currency, dark_mode)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE
        SET currency  = EXCLUDED.currency,
            dark_mode = EXCLUDED.dark_mode,
            updated_at = NOW()
      RETURNING *
    `, [req.userId, currency || 'INR', dark_mode ?? false]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
