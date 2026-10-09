require('dotenv').config();
const { pool } = require('./db');

const YISHAI_ID = '9aaf418a-e527-4d69-a9e0-aca97f035b3c';
const ARIEL_ID  = 'fbbfc0f3-ca53-49df-954a-c29f7b6778f7';

// תפריט אריאל עוזרי — עדכון 10/2026
// מבוסס על דף המעקב שנסרק
const MENU = [
  // 07:30 — ארוחת בוקר
  { time: '07:30', items: [
    { item: 'לחמנייה / 2 פרוסות לחם',        qty: null },
    { item: '2 פרוסות גב"צ / פחית טונה',     qty: null },
    { item: 'חטיף שוקולד רגיל',               qty: null },
    { item: 'משקה קפה',                        qty: null },
  ]},
  // 10:00 — ארוחת ביניים
  { time: '10:00', items: [
    { item: 'מעדן',           qty: null },
    { item: 'דגני בוקר',      qty: '2 כוסות' },
    { item: 'כוס חלב',        qty: null },
    { item: 'פירות',           qty: '2' },
    { item: 'חטיף שוקולד',    qty: null },
  ]},
  // 13:00 — ארוחת צהריים
  { time: '13:00', items: [
    { item: 'חזה עוף / מנה בשרית',             qty: 'מנה וחצי בגודל כף יד + כפית שמן' },
    { item: 'תוספת (אורז / תפוח אדמה)',        qty: '2 כוסות' },
    { item: 'כוס מים',                          qty: null },
  ]},
  // 16:00 — ארוחת ביניים אחר הצהריים
  { time: '16:00', items: [
    { item: 'פירות',        qty: '2' },
    { item: 'חטיף אישי',   qty: '50 גר׳' },
    { item: 'קינדר בואנו', qty: null },
    { item: 'קרטיב קרח',   qty: null },
  ]},
  // 19:00 — ארוחת ערב אפשרות 1
  { time: '19:00', items: [
    { item: 'כוס מים',              qty: 'אפ׳ 1' },
    { item: 'פיתה',                  qty: 'אפ׳ 1' },
    { item: '2 פרוסות גבינה צהובה', qty: 'אפ׳ 1' },
    { item: 'טונה',                  qty: 'אפ׳ 1' },
    { item: 'גביע קוטג׳',           qty: 'אפ׳ 1' },
    { item: 'מעדן',                  qty: 'אפ׳ 1' },
  ]},
  // 19:00 — ארוחת ערב אפשרות 3 (פיצה)
  { time: '19:00', items: [
    { item: '3 משולשי פיצה',        qty: 'אפ׳ 3' },
    { item: 'כוס שוקו',             qty: 'אפ׳ 3' },
  ]},
  // 21:00 — לילה
  { time: '21:00', items: [
    { item: 'קינדר בואנו / 6 אצבעות קינדר', qty: null },
    { item: 'מיני מגנום',                   qty: null },
    { item: 'תפוציפס קידס',                 qty: null },
    { item: 'כוס מים',                       qty: null },
  ]},
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // מחק לוח ישן
    await client.query(
      `DELETE FROM plans WHERE supervisor_id=$1 AND monitored_id=$2`,
      [YISHAI_ID, ARIEL_ID]
    );

    const today = new Date().toISOString().slice(0, 10);
    const end   = new Date(); end.setDate(end.getDate() + 90);
    const endStr = end.toISOString().slice(0, 10);

    const { rows: [plan] } = await client.query(
      `INSERT INTO plans
         (supervisor_id, monitored_id, name, type, start_date, end_date,
          visibility_mode, photo_required, alert_threshold_minutes, notify_on_completion,
          pre_alert_reminder_minutes)
       VALUES ($1,$2,'תפריט של אריאל','meal',$3,$4,'daily',true,30,true,10)
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
    console.log(`✅ תפריט אריאל נוצר — plan_id: ${plan.id}`);
    console.log(`   photo_required=true, pre_alert=10 דקות, alert_threshold=30 דקות`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
