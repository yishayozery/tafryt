const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// סטטיסטיקות לוח — שבוע אחרון + היום
router.get('/', requireAuth, async (req, res) => {
  try {
    const plan = await getPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'לוח לא נמצא' });

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

    // סטטיסטיקות כלליות — 7 ימים אחרונים
    const { rows: weekStats } = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM completions c
       JOIN plan_items pi ON pi.id = c.plan_item_id
       WHERE pi.plan_id = $1 AND c.date BETWEEN $2 AND $3
       GROUP BY status`,
      [req.params.planId, weekAgo, today]
    );

    // סטטיסטיקות היום
    const { rows: todayStats } = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM completions c
       JOIN plan_items pi ON pi.id = c.plan_item_id
       WHERE pi.plan_id = $1 AND c.date = $2
       GROUP BY status`,
      [req.params.planId, today]
    );

    // ספירת משימות היום (כולל לא-initialized)
    const dayOfWeek = new Date().getDay();
    const { rows: [{ total_today }] } = await db.query(
      `SELECT COUNT(*)::int AS total_today FROM plan_items
       WHERE plan_id=$1 AND (day_of_week=$2 OR specific_date=$3)`,
      [req.params.planId, dayOfWeek, today]
    );

    // streak — כמה ימים רצופים עם לפחות משימה אחת done
    const { rows: streakRows } = await db.query(
      `SELECT c.date, COUNT(*) FILTER (WHERE c.status IN ('done','replaced'))::int AS completed,
              COUNT(*)::int AS total
       FROM completions c
       JOIN plan_items pi ON pi.id = c.plan_item_id
       WHERE pi.plan_id=$1 AND c.date <= $2 AND c.date >= (SELECT start_date FROM plans WHERE id=$1)
       GROUP BY c.date ORDER BY c.date DESC`,
      [req.params.planId, today]
    );

    let streak = 0;
    for (const row of streakRows) {
      if (row.completed > 0 && row.total > 0) streak++;
      else break;
    }

    // ימים לפי ביצוע בשבוע אחרון (לגרף)
    const { rows: dailyRows } = await db.query(
      `SELECT c.date,
              COUNT(*) FILTER (WHERE c.status IN ('done','replaced'))::int AS completed,
              COUNT(*)::int AS total
       FROM completions c
       JOIN plan_items pi ON pi.id = c.plan_item_id
       WHERE pi.plan_id=$1 AND c.date BETWEEN $2 AND $3
       GROUP BY c.date ORDER BY c.date`,
      [req.params.planId, weekAgo, today]
    );

    const toMap = (rows) => {
      const m = { done: 0, pending: 0, missed: 0, replaced: 0 };
      rows.forEach(r => { m[r.status] = r.count; });
      return m;
    };

    res.json({
      today: {
        ...toMap(todayStats),
        total: total_today,
      },
      week: toMap(weekStats),
      streak,
      daily: dailyRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

async function getPlan(planId, userId) {
  const { rows } = await db.query(
    'SELECT * FROM plans WHERE id=$1 AND (supervisor_id=$2 OR monitored_id=$2)',
    [planId, userId]
  );
  return rows[0] || null;
}

module.exports = router;
