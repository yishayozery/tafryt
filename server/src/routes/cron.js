const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendPush } = require('../services/push');

// הגנה על endpoints — רק עם CRON_SECRET
function verifyCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return next(); // dev בלי secret
  const auth = req.headers['x-cron-secret'] || req.query.secret;
  if (auth !== secret) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// POST /api/cron/missed-items
// קוראים מ-cron-job.org כל דקה
router.post('/missed-items', verifyCronSecret, async (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay();

    const { rows: items } = await db.query(
      `SELECT
         pi.id AS plan_item_id,
         pi.scheduled_time,
         pi.item_name,
         p.id AS plan_id,
         p.name AS plan_name,
         p.alert_threshold_minutes,
         p.supervisor_id,
         u.push_subscription AS supervisor_push,
         c.id AS completion_id,
         c.status
       FROM plan_items pi
       JOIN plans p ON p.id = pi.plan_id
       JOIN users u ON u.id = p.supervisor_id
       LEFT JOIN completions c ON c.plan_item_id = pi.id AND c.date = $1
       WHERE p.start_date <= $1 AND p.end_date >= $1
         AND (pi.day_of_week = $2 OR pi.specific_date = $1)
         AND (c.status IS NULL OR c.status = 'pending')
         AND (
           NOW() AT TIME ZONE 'Asia/Jerusalem' >
           ($1::date + pi.scheduled_time + (p.alert_threshold_minutes || ' minutes')::interval)
         )`,
      [todayStr, dayOfWeek]
    );

    let processed = 0;
    for (const item of items) {
      if (item.completion_id) {
        const already = await db.query(
          `SELECT id FROM notifications WHERE related_completion_id = $1 AND type = 'missed_alert'`,
          [item.completion_id]
        );
        if (already.rows.length > 0) continue;
        await db.query(
          `UPDATE completions SET status='missed' WHERE id=$1 AND status='pending'`,
          [item.completion_id]
        );
      } else {
        await db.query(
          `INSERT INTO completions (plan_item_id, date, status) VALUES ($1,$2,'missed') ON CONFLICT DO NOTHING`,
          [item.plan_item_id, todayStr]
        );
      }

      if (item.supervisor_push) {
        await sendPush(item.supervisor_push, {
          title: `${item.plan_name} — לא בוצע`,
          body: `${item.item_name} לא דווח עד כה`,
        });
      }

      const { rows: compRows } = await db.query(
        'SELECT id FROM completions WHERE plan_item_id=$1 AND date=$2',
        [item.plan_item_id, todayStr]
      );
      if (compRows.length > 0) {
        await db.query(
          `INSERT INTO notifications (recipient_id, type, related_completion_id)
           VALUES ($1,'missed_alert',$2) ON CONFLICT DO NOTHING`,
          [item.supervisor_id, compRows[0].id]
        );
      }
      processed++;
    }

    res.json({ ok: true, processed });
  } catch (err) {
    console.error('cron/missed-items error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cron/reminders
router.post('/reminders', verifyCronSecret, async (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay();
    const currentMinute = now.toTimeString().slice(0, 5);

    const { rows: items } = await db.query(
      `SELECT pi.item_name, p.name AS plan_name, um.push_subscription
       FROM plan_items pi
       JOIN plans p ON p.id = pi.plan_id
       JOIN users um ON um.id = p.monitored_id
       LEFT JOIN completions c ON c.plan_item_id = pi.id AND c.date = $1
       WHERE p.start_date <= $1 AND p.end_date >= $1
         AND (pi.day_of_week = $2 OR pi.specific_date = $1)
         AND TO_CHAR(pi.scheduled_time, 'HH24:MI') = $3
         AND (c.status IS NULL OR c.status = 'pending')`,
      [todayStr, dayOfWeek, currentMinute]
    );

    for (const item of items) {
      if (item.push_subscription) {
        await sendPush(item.push_subscription, {
          title: item.plan_name,
          body: `הגיע הזמן: ${item.item_name}`,
        });
      }
    }

    res.json({ ok: true, sent: items.length });
  } catch (err) {
    console.error('cron/reminders error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cron/migrate — מיגרציה חד-פעמית להוספת עמודות חסרות
router.post('/migrate', verifyCronSecret, async (req, res) => {
  try {
    await db.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_replacement BOOLEAN NOT NULL DEFAULT true`);
    res.json({ ok: true, message: 'migration done' });
  } catch (err) {
    console.error('migrate error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
