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

  // תפריט לפי תוכנית רפואי שניידר — אריאל עוזרי
  const MENU = [
    { time: '07:30', items: [
      { item: 'לחמנייה / 2 פרוסות לחם',         qty: null },
      { item: '2 פרוסות גב"צ / פחית טונה',      qty: null },
      { item: 'חטיף שוקולד רגיל',                qty: null },
      { item: 'משקה קפה',                         qty: null },
    ]},
    { time: '10:00', items: [
      { item: 'מעדן',            qty: null },
      { item: 'דגני בוקר',       qty: '2 כוסות' },
      { item: 'כוס חלב',         qty: null },
      { item: 'פירות',            qty: '2' },
      { item: 'חטיף שוקולד',     qty: null },
    ]},
    { time: '13:00', items: [
      { item: 'מנה וחצי חזה עוף בגודל ובעובי כף יד + כפית שמן / מנה בשריית אחרת', qty: null },
      { item: '2 כוסות תוספת אורז או תפוח אדמה', qty: null },
      { item: 'כוס מים',                           qty: null },
    ]},
    { time: '16:00', items: [
      { item: 'פירות',        qty: '2' },
      { item: 'חטיף אישי',   qty: '50 גר׳' },
      { item: 'קינדר בואנו', qty: null },
      { item: 'קרטיב קרח',   qty: null },
    ]},
    // ערב אפשרות 1 — כמו בתפריט
    { time: '19:00', items: [
      { item: 'כוס מים',               qty: 'אפ׳ 1' },
      { item: 'פיתה',                   qty: 'אפ׳ 1' },
      { item: '2 פרוסות גבינה צהובה',  qty: 'אפ׳ 1' },
      { item: 'טונה',                   qty: 'אפ׳ 1' },
      { item: 'גביע קוטג׳',            qty: 'אפ׳ 1' },
      { item: 'מעדן',                   qty: 'אפ׳ 1' },
    ]},
    // ערב אפשרות 2 — כמו צהריים
    { time: '19:00', items: [
      { item: 'מנה וחצי חזה עוף + כפית שמן / מנה בשריית אחרת', qty: 'אפ׳ 2 - כמו צהריים' },
      { item: '2 כוסות תוספת אורז / תפוח אדמה',                 qty: 'אפ׳ 2 - כמו צהריים' },
      { item: 'כוס מים',                                          qty: 'אפ׳ 2 - כמו צהריים' },
    ]},
    // ערב אפשרות 3 — פיצה ושוקו
    { time: '19:00', items: [
      { item: '3 משולשי פיצה וכוס שוקו', qty: 'אפ׳ 3' },
    ]},
    { time: '21:00', items: [
      { item: 'קינדר בואנו / 6 אצבעות קינדר', qty: null },
      { item: 'מיני מגנום',                    qty: null },
      { item: 'תפוציפס קידס',                  qty: null },
      { item: 'כוס מים',                        qty: null },
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
