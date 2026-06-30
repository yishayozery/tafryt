require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./db');

// תפריט לדוגמא — מבוסס על התפריט האמיתי
const MENU = [
  {
    time: '07:30',
    name: 'ארוחת בוקר',
    items: [
      { item: '2 פרוסות לחם', qty: '2 פרוסות' },
      { item: 'ביצה / גבינה לבנה', qty: 'מנה אחת' },
      { item: 'ירק חתוך', qty: 'לפי רצון' },
    ],
  },
  {
    time: '10:00',
    name: 'ארוחת ביניים',
    items: [
      { item: 'פרי', qty: '1 יחידה' },
      { item: 'כוס חלב', qty: '200 מ"ל' },
    ],
  },
  {
    time: '13:00',
    name: 'ארוחת צהריים',
    items: [
      { item: 'בשר / דג / עוף', qty: '50 גרם' },
      { item: 'אורז / פסטה / לחם', qty: 'כוס מבושל' },
      { item: '2 סוגי ירק', qty: '2 כפות כל אחד' },
    ],
  },
  {
    time: '16:00',
    name: 'ארוחת ביניים',
    items: [
      { item: 'פרי / ירק', qty: '1 יחידה' },
      { item: 'ביסקוויט / לחמנייה', qty: '2 יחידות' },
    ],
  },
  {
    time: '19:00',
    name: 'ארוחת ערב',
    items: [
      { item: 'מרק ירקות / פסטה', qty: 'קערה' },
      { item: 'גבינה / ביצה', qty: 'מנה' },
      { item: 'לחם', qty: 'פרוסה' },
    ],
  },
  {
    time: '12:00',
    name: 'נוזלים',
    items: [
      { item: 'מים / מיץ מדולל', qty: '3 כוסות לאורך היום' },
    ],
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM users WHERE username IN ('demo_super','demo_dan','platform_admin')`);

    const hash = await bcrypt.hash('Demo1234!', 12);
    const adminHash = await bcrypt.hash('Admin5678!', 12);

    const { rows: [admin] } = await client.query(
      `INSERT INTO users (display_name, username, password_hash, is_admin)
       VALUES ('מנהל מערכת','platform_admin',$1,true) RETURNING id`, [adminHash]
    );

    const { rows: [supervisor] } = await client.query(
      `INSERT INTO users (display_name, username, password_hash)
       VALUES ('אמא','demo_super',$1) RETURNING id`, [hash]
    );

    const { rows: [monitored] } = await client.query(
      `INSERT INTO users (display_name, username, password_hash)
       VALUES ('דני','demo_dan',$1) RETURNING id`, [hash]
    );

    await client.query(
      `INSERT INTO supervision_links (supervisor_id, monitored_id) VALUES ($1,$2)`,
      [supervisor.id, monitored.id]
    );

    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - 5);
    const end = new Date(today); end.setDate(today.getDate() + 30);

    const { rows: [plan] } = await client.query(
      `INSERT INTO plans
         (supervisor_id, monitored_id, name, type, start_date, end_date,
          visibility_mode, photo_required, alert_threshold_minutes, notify_on_completion)
       VALUES ($1,$2,'תפריט של דני','meal',$3,$4,'daily',false,30,true) RETURNING id`,
      [supervisor.id, monitored.id, fmt(start), fmt(end)]
    );

    // הוספת כל שורות התפריט לכל ימות השבוע
    const itemIds = [];
    for (let dow = 0; dow <= 6; dow++) {
      for (const meal of MENU) {
        for (const mi of meal.items) {
          const { rows: [item] } = await client.query(
            `INSERT INTO plan_items (plan_id, day_of_week, scheduled_time, item_name, quantity)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [plan.id, dow, meal.time, mi.item, mi.qty]
          );
          itemIds.push({ id: item.id, dow, time: meal.time, name: mi.item });
        }
      }
    }

    // completions ל-5 ימים אחרונים
    const statusPool = ['done', 'done', 'done', 'replaced', 'done', 'missed', 'done'];
    for (let daysAgo = 1; daysAgo <= 5; daysAgo++) {
      const d = new Date(today);
      d.setDate(today.getDate() - daysAgo);
      const dow = d.getDay();
      const dateStr = fmt(d);
      const dayItems = itemIds.filter(i => i.dow === dow);

      for (let idx = 0; idx < dayItems.length; idx++) {
        const status = statusPool[idx % statusPool.length];
        await client.query(
          `INSERT INTO completions (plan_item_id, date, status, replaced_with, completed_at)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [
            dayItems[idx].id,
            dateStr,
            status,
            status === 'replaced' ? 'קוטג\' עם עגבנייה' : null,
            (status === 'done' || status === 'replaced') ? `${dateStr} ${dayItems[idx].time}` : null,
          ]
        );
      }
    }

    // היום — completions חלקיים
    const todayDow = today.getDay();
    const todayItems = itemIds.filter(i => i.dow === todayDow);
    const nowHour = today.getHours();
    for (const item of todayItems) {
      const itemHour = parseInt(item.time.split(':')[0]);
      if (itemHour <= nowHour) {
        const status = itemHour < nowHour ? 'done' : 'pending';
        await client.query(
          `INSERT INTO completions (plan_item_id, date, status, completed_at)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [item.id, fmt(today), status, status === 'done' ? `${fmt(today)} ${item.time}` : null]
        );
      }
    }

    await client.query('COMMIT');

    console.log('✅ Seed הצליח!');
    console.log('');
    console.log('משתמשים לדמו:');
    console.log('  מנהל מערכת  — username: platform_admin  סיסמה: Admin5678!');
    console.log('  מבקרת (אמא) — username: demo_super      סיסמה: Demo1234!');
    console.log('  מבוקר (דני)  — username: demo_dan        סיסמה: Demo1234!');
    console.log('');
    console.log('תפריט:');
    MENU.forEach(m => console.log(`  ${m.time} ${m.name} — ${m.items.map(i => i.item).join(', ')}`));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed נכשל:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

function fmt(d) { return d.toISOString().slice(0, 10); }

seed();
