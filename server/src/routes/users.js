const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// רשימת מבוקרים של המבקר (כולל הזמנות ממתינות)
router.get('/monitored', requireAuth, async (req, res) => {
  try {
    const { rows: active } = await db.query(
      `SELECT u.id, u.display_name, u.username, u.phone, sl.status, sl.created_at
       FROM supervision_links sl
       JOIN users u ON u.id = sl.monitored_id
       WHERE sl.supervisor_id = $1
       ORDER BY u.display_name`,
      [req.user.id]
    );

    const { rows: pending } = await db.query(
      `SELECT NULL AS id, monitored_display_name AS display_name,
              NULL AS username, monitored_phone AS phone,
              'pending_invite' AS status, created_at, token AS invite_token
       FROM invite_tokens
       WHERE supervisor_id = $1 AND used_at IS NULL
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json([...active, ...pending]);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// הסרת מבוקר (מחיקת קשר פיקוח + ביטול הזמנות פתוחות)
router.delete('/monitored/:id', requireAuth, async (req, res) => {
  try {
    // הסר קשר פיקוח פעיל
    await db.query(
      'DELETE FROM supervision_links WHERE supervisor_id=$1 AND monitored_id=$2',
      [req.user.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// ביטול הזמנה ממתינה (לפי טלפון)
router.delete('/monitored/invite/:token', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM invite_tokens WHERE token=$1 AND supervisor_id=$2 AND used_at IS NULL',
      [req.params.token, req.user.id]
    );
    res.json({ ok: true });
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
