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

// POST /api/cron/migrate — מיגרציה חד-פעמית
router.post('/migrate', verifyCronSecret, async (req, res) => {
  try {
    await db.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_replacement BOOLEAN NOT NULL DEFAULT true`);
    res.json({ ok: true, message: 'migration done' });
  } catch (err) {
    console.error('migrate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cron/update-ariel-menu — עדכון תפריט אריאל
router.post('/update-ariel-menu', verifyCronSecret, async (req, res) => {
  const YISHAI_ID = '9aaf418a-e527-4d69-a9e0-aca97f035b3c';
  const ARIEL_ID  = 'fbbfc0f3-ca53-49df-954a-c29f7b6778f7';

  const MENU = [
    { time: '07:30', items: [
      { item: '2 פרוסות לחם (חום / פיתה)', qty: '2 פרוסות' },
      { item: 'ביצה / גבינה לבנה',         qty: '50 גרם' },
      { item: 'ירק גולמי',                  qty: 'לפי רצון' },
      { item: 'כוס חלב',                    qty: '200 מ"ל' },
      { item: 'פרי',                         qty: '1 יחידה' },
    ]},
    { time: '10:00', items: [
      { item: 'פרי',       qty: '1 יחידה' },
      { item: 'ביסקוויט', qty: '2 יחידות' },
      { item: 'כוס חלב',  qty: '200 מ"ל' },
    ]},
    { time: '13:00', items: [
      { item: 'מרק ירקות',          qty: 'קערה קטנה' },
      { item: 'בשר / דג / עוף',     qty: '50 גרם' },
      { item: 'אורז / פסטה / לחם',  qty: '2 כפות מבושל' },
      { item: '2 סוגי ירק מבושל',   qty: '2 כפות כל אחד' },
    ]},
    { time: '15:30', items: [
      { item: 'פרי / ירק',           qty: '1 יחידה' },
      { item: 'ביסקוויט / לחמנייה', qty: '2 יחידות' },
      { item: 'גבינה לבנה',          qty: '50 גרם' },
    ]},
    { time: '19:00', items: [
      { item: '2 פרוסות לחם',     qty: '2 פרוסות' },
      { item: 'גבינה / ביצה',      qty: 'מנה' },
      { item: 'ירק גולמי',         qty: 'לפי רצון' },
      { item: 'כוס חלב / יוגורט', qty: '200 מ"ל' },
    ]},
    { time: '12:00', items: [
      { item: 'מים', qty: '6 כוסות לאורך היום' },
    ]},
  ];

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query(
      `SELECT id FROM plans WHERE supervisor_id=$1 AND monitored_id=$2`,
      [YISHAI_ID, ARIEL_ID]
    );
    if (existing.length > 0) {
      const pid = existing[0].id;
      await client.query('DELETE FROM plan_items WHERE plan_id=$1', [pid]);
      await client.query('DELETE FROM plans WHERE id=$1', [pid]);
    }
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(); end.setDate(end.getDate() + 90);
    const endStr = end.toISOString().slice(0, 10);
    const { rows: [plan] } = await client.query(
      `INSERT INTO plans
         (supervisor_id, monitored_id, name, type, start_date, end_date,
          visibility_mode, photo_required, alert_threshold_minutes, notify_on_completion,
          allow_replacement, relationship_type, supervisor_label, monitored_label)
       VALUES ($1,$2,'תפריט של אריאל','meal',$3,$4,'daily',false,30,true,true,'family','הורה','ילד')
       RETURNING id`,
      [YISHAI_ID, ARIEL_ID, today, endStr]
    );
    for (let dow = 0; dow <= 6; dow++) {
      for (const meal of MENU) {
        for (const mi of meal.items) {
          await client.query(
            `INSERT INTO plan_items (plan_id, day_of_week, scheduled_time, item_name, quantity)
             VALUES ($1,$2,$3,$4,$5)`,
            [plan.id, dow, meal.time, mi.item, mi.qty]
          );
        }
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true, plan_id: plan.id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
