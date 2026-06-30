const cron = require('node-cron');
const db = require('../db');
const { sendPush } = require('../services/push');

// רץ כל דקה — בודק שורות שעבר עליהן X זמן ללא ביצוע
function startMissedItemsJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const dayOfWeek = now.getDay(); // 0=ראשון

      // מצא כל plan_items שהשעה שלהם עברה + X דקות ועדיין pending
      const { rows: items } = await db.query(
        `SELECT
           pi.id AS plan_item_id,
           pi.scheduled_time,
           pi.item_name,
           p.id AS plan_id,
           p.name AS plan_name,
           p.alert_threshold_minutes,
           p.supervisor_id,
           p.monitored_id,
           u.push_subscription AS supervisor_push,
           um.push_subscription AS monitored_push,
           c.id AS completion_id,
           c.status
         FROM plan_items pi
         JOIN plans p ON p.id = pi.plan_id
         JOIN users u ON u.id = p.supervisor_id
         JOIN users um ON um.id = p.monitored_id
         LEFT JOIN completions c ON c.plan_item_id = pi.id AND c.date = $1
         WHERE p.start_date <= $1 AND p.end_date >= $1
           AND (
             (pi.day_of_week = $2)
             OR (pi.specific_date = $1)
           )
           AND (c.status IS NULL OR c.status = 'pending')
           AND (
             NOW() AT TIME ZONE 'Asia/Jerusalem' >
             ($1::date + pi.scheduled_time + (p.alert_threshold_minutes || ' minutes')::interval)
           )`,
        [todayStr, dayOfWeek]
      );

      for (const item of items) {
        // בדוק שלא שלחנו התראה כבר
        const already = await db.query(
          `SELECT id FROM notifications
           WHERE related_completion_id = $1 AND type = 'missed_alert'`,
          [item.completion_id]
        );
        if (already.rows.length > 0) continue;

        // וודא שיש completion
        if (!item.completion_id) {
          await db.query(
            `INSERT INTO completions (plan_item_id, date, status) VALUES ($1,$2,'missed')
             ON CONFLICT DO NOTHING`,
            [item.plan_item_id, todayStr]
          );
        } else {
          await db.query(
            `UPDATE completions SET status='missed' WHERE id=$1 AND status='pending'`,
            [item.completion_id]
          );
        }

        // שלח Push למבקר
        if (item.supervisor_push) {
          await sendPush(item.supervisor_push, {
            title: `${item.plan_name} — לא בוצע`,
            body: `${item.item_name} לא דווח עד כה`,
          });
        }

        // רשום notification
        const { rows: compRows } = await db.query(
          'SELECT id FROM completions WHERE plan_item_id=$1 AND date=$2',
          [item.plan_item_id, todayStr]
        );
        if (compRows.length > 0) {
          await db.query(
            `INSERT INTO notifications (recipient_id, type, related_completion_id)
             VALUES ($1,'missed_alert',$2)`,
            [item.supervisor_id, compRows[0].id]
          );
        }
      }
    } catch (err) {
      console.error('missedItems job error:', err);
    }
  });
}

// Cron לתזכורת Push למבוקר בשעת הארוחה
function startReminderJob() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const dayOfWeek = now.getDay();
      const currentMinute = now.toTimeString().slice(0, 5); // HH:MM

      const { rows: items } = await db.query(
        `SELECT pi.item_name, p.name AS plan_name, um.push_subscription, pi.id AS plan_item_id
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
    } catch (err) {
      console.error('reminder job error:', err);
    }
  });
}

module.exports = { startMissedItemsJob, startReminderJob };
