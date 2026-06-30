const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// רשימת מבוקרים של המבקר
router.get('/monitored', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.display_name, u.username, u.phone, sl.status, sl.created_at
       FROM supervision_links sl
       JOIN users u ON u.id = sl.monitored_id
       WHERE sl.supervisor_id = $1
       ORDER BY u.display_name`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// רשימת מבקרים שמפקחים על המשתמש הנוכחי
router.get('/supervisors', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.display_name, u.username, sl.status
       FROM supervision_links sl
       JOIN users u ON u.id = sl.supervisor_id
       WHERE sl.monitored_id = $1 AND sl.status = 'active'
       ORDER BY u.display_name`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// שמירת Push subscription
router.post('/push-subscription', requireAuth, async (req, res) => {
  const { subscription } = req.body;
  try {
    await db.query('UPDATE users SET push_subscription=$1 WHERE id=$2', [
      JSON.stringify(subscription),
      req.user.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

module.exports = router;
