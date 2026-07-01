require('dotenv').config();
const { pool } = require('./db');

const YISHAI_ID = '9aaf418a-e527-4d69-a9e0-aca97f035b3c';
const ARIEL_ID  = 'fbbfc0f3-ca53-49df-954a-c29f7b6778f7';

const MENU = [
  {
    time: '07:30',
    name: 'ארוחת בוקר',
    items: [
      { item: '2 פרוסות לחם (חום / פיתה)', qty: '2 פרוסות' },
      { item: 'ביצה / גבינה לבנה',         qty: '50 גרם' },
      { item: 'ירק גולמי',                  qty: 'לפי רצון' },
      { item: 'כוס חלב',                    qty: '200 מ"ל' },
      { item: 'פרי',                         qty: '1 יחידה' },
    ],
  },
  {
    time: '10:00',
    name: 'ביניים בוקר',
    items: [
      { item: 'פרי',            qty: '1 יחידה' },
      { item: 'ביסקוויט',      qty: '2 יחידות' },
      { item: 'כוס חלב',       qty: '200 מ"ל' },
    ],
  },
  {
    time: '13:00',
    name: 'ארוחת צהריים',
    items: [
      { item: 'מרק ירקות',            qty: 'קערה קטנה' },
      { item: 'בשר / דג / עוף',       qty: '50 גרם' },
      { item: 'אורז / פסטה / לחם',    qty: '2 כפות מבושל' },
      { item: '2 סוגי ירק מבושל',     qty: '2 כפות כל אחד' },
    ],
  },
  {
    time: '15:30',
    name: 'ביניים אחה"צ',
    items: [
      { item: 'פרי / ירק',              qty: '1 יחידה' },
      { item: 'ביסקוויט / לחמנייה',    qty: '2 יחידות' },
      { item: 'גבינה לבנה',             qty: '50 גרם' },
    ],
  },
  {
    time: '19:00',
    name: 'ארוחת ערב',
    items: [
      { item: '2 פרוסות לחם',          qty: '2 פרוסות' },
      { item: 'גבינה / ביצה',           qty: 'מנה' },
      { item: 'ירק גולמי',              qty: 'לפי רצון' },
      { item: 'כוס חלב / יוגורט',      qty: '200 מ"ל' },
    ],
  },
  {
    time: '12:00',
    name: 'נוזלים',
    items: [
      { item: 'מים', qty: '6 כוסות לאורך היום' },
    ],
  },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // מחק לוח קיים
    const { rows: existing } = await client.query(
      `SELECT id FROM plans WHERE supervisor_id=$1 AND monitored_id=$2`,
      [YISHAI_ID, ARIEL_ID]
    );
    if (existing.length > 0) {
      const planId = existing[0].id;
      await client.query('DELETE FROM plan_items WHERE plan_id=$1', [planId]);
      await client.query('DELETE FROM plans WHERE id=$1', [planId]);
      console.log(`🗑️ לוח ישן נמחק (${planId})`);
    }

    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - 1);
    const end   = new Date(today); end.setDate(today.getDate() + 90);
    const fmt = d => d.toISOString().slice(0, 10);

    const { rows: [plan] } = await client.query(
      `INSERT INTO plans
         (supervisor_id, monitored_id, name, type, start_date, end_date,
          visibility_mode, photo_required, alert_threshold_minutes, notify_on_completion,
          allow_replacement, relationship_type, supervisor_label, monitored_label)
       VALUES ($1,$2,'תפריט של אריאל','meal',$3,$4,
               'daily',false,30,true,true,'family','הורה','ילד')
       RETURNING id`,
      [YISHAI_ID, ARIEL_ID, fmt(start), fmt(end)]
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
    console.log(`✅ לוח "תפריט של אריאל" עודכן — plan_id: ${plan.id}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
