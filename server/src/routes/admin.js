const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'גישה מנהלים בלבד' });
  next();
}

// סיכום פלטפורמה
router.get('/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [users, plans, completions, activeToday] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE is_admin)::int AS admins,
                       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_week
                FROM users`),
      db.query(`SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE)::int AS active
                FROM plans`),
      db.query(`SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE status='done')::int AS done,
                       COUNT(*) FILTER (WHERE status='missed')::int AS missed,
                       COUNT(*) FILTER (WHERE status='replaced')::int AS replaced,
                       COUNT(*) FILTER (WHERE date = CURRENT_DATE)::int AS today
                FROM completions`),
      db.query(`SELECT COUNT(DISTINCT p.monitored_id)::int AS monitored_active
                FROM plans p
                WHERE p.start_date <= CURRENT_DATE AND p.end_date >= CURRENT_DATE`),
    ]);

    res.json({
      users: users.rows[0],
      plans: plans.rows[0],
      completions: completions.rows[0],
      monitored_active: activeToday.rows[0].monitored_active,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// רשימת משתמשים
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.display_name, u.username, u.phone, u.is_admin, u.created_at,
              (SELECT COUNT(*)::int FROM supervision_links WHERE supervisor_id=u.id AND status='active') AS supervising,
              (SELECT COUNT(*)::int FROM supervision_links WHERE monitored_id=u.id AND status='active') AS monitored_by,
              (SELECT COUNT(*)::int FROM plans WHERE supervisor_id=u.id) AS plans_created
       FROM users u
       ORDER BY u.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// רשימת לוחות
router.get('/plans', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*,
              us.display_name AS supervisor_name,
              um.display_name AS monitored_name,
              (SELECT COUNT(*)::int FROM plan_items WHERE plan_id=p.id) AS items_count,
              (SELECT COUNT(*) FILTER (WHERE status='done')::int FROM completions c
               JOIN plan_items pi ON pi.id=c.plan_item_id WHERE pi.plan_id=p.id) AS done_count,
              (SELECT COUNT(*) FILTER (WHERE status='missed')::int FROM completions c
               JOIN plan_items pi ON pi.id=c.plan_item_id WHERE pi.plan_id=p.id) AS missed_count
       FROM plans p
       JOIN users us ON us.id=p.supervisor_id
       JOIN users um ON um.id=p.monitored_id
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// עדכון is_admin
router.patch('/users/:id/admin', requireAuth, requireAdmin, async (req, res) => {
  const { is_admin } = req.body;
  try {
    await db.query('UPDATE users SET is_admin=$1 WHERE id=$2', [!!is_admin, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

module.exports = router;
