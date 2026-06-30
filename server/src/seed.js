require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('./db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // מחיקת נתוני demo קיימים
    await client.query(`DELETE FROM users WHERE username IN ('demo_super','demo_dan','platform_admin')`);

    const hash = await bcrypt.hash('Demo1234!', 12);
    const adminHash = await bcrypt.hash('Admin5678!', 12);

    // אדמין פלטפורמה
    const { rows: [admin] } = await client.query(
      `INSERT INTO users (display_name, username, password_hash, is_admin)
       VALUES ('מנהל מערכת','platform_admin',$1,true) RETURNING id`,
      [adminHash]
    );

    // מבקר
    const { rows: [supervisor] } = await client.query(
      `INSERT INTO users (display_name, username, password_hash)
       VALUES ('אמא','demo_super',$1) RETURNING id`,
      [hash]
    );

    // מבוקר
    const { rows: [monitored] } = await client.query(
      `INSERT INTO users (display_name, username, password_hash)
       VALUES ('דני','demo_dan',$1) RETURNING id`,
      [hash]
    );

    // קישור מבקר-מבוקר
    await client.query(
      `INSERT INTO supervision_links (supervisor_id, monitored_id) VALUES ($1,$2)`,
      [supervisor.id, monitored.id]
    );

    // לוח בקרה
    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - 3);
    const end = new Date(today); end.setDate(today.getDate() + 25);

    const { rows: [plan] } = await client.query(
      `INSERT INTO plans
         (supervisor_id, monitored_id, name, type, start_date, end_date,
          visibility_mode, photo_required, alert_threshold_minutes, notify_on_completion)
       VALUES ($1,$2,'תפריט של דני','meal',$3,$4,'daily',false,30,true) RETURNING id`,
      [supervisor.id, monitored.id, fmtDate(start), fmtDate(end)]
    );

    // שורות תפריט (שבועי, א-ש)
    const menuItems = [
      { time: '08:00', name: 'דייסת שיבולת שועל', qty: 'קערה' },
      { time: '10:30', name: 'יוגורט עם פרות', qty: '200 גרם' },
      { time: '13:00', name: 'אורז עם עוף', qty: 'מנה' },
      { time: '15:30', name: 'תפוח', qty: '1' },
      { time: '19:00', name: 'סלט ירקות', qty: 'קערה גדולה' },
    ];

    const itemIds = [];
    for (let dow = 0; dow <= 6; dow++) {
      for (const mi of menuItems) {
        const { rows: [item] } = await client.query(
          `INSERT INTO plan_items (plan_id, day_of_week, scheduled_time, item_name, quantity)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [plan.id, dow, mi.time, mi.name, mi.qty]
        );
        itemIds.push({ id: item.id, dow, time: mi.time, name: mi.name });
      }
    }

    // completions לשלושת הימים האחרונים
    const statuses = ['done', 'done', 'done', 'replaced', 'missed'];
    for (let daysAgo = 1; daysAgo <= 3; daysAgo++) {
      const d = new Date(today);
      d.setDate(today.getDate() - daysAgo);
      const dow = d.getDay();
      const dateStr = fmtDate(d);
      const dayItems = itemIds.filter(i => i.dow === dow);

      for (let idx = 0; idx < dayItems.length; idx++) {
        const status = statuses[idx % statuses.length];
        const replacedWith = status === 'replaced' ? 'ביסקוויט עם חמאת בוטנים' : null;
        const completedAt = (status === 'done' || status === 'replaced')
          ? `${dateStr} ${dayItems[idx].time}` : null;
        await client.query(
          `INSERT INTO completions (plan_item_id, date, status, replaced_with, completed_at)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [dayItems[idx].id, dateStr, status, replacedWith, completedAt]
        );
      }
    }

    // Completions חלקיים להיום
    const todayDow = today.getDay();
    const todayItems = itemIds.filter(i => i.dow === todayDow);
    const nowHour = today.getHours();
    for (const item of todayItems) {
      const itemHour = parseInt(item.time.split(':')[0]);
      if (itemHour <= nowHour) {
        const status = itemHour < nowHour - 1 ? 'done' : 'pending';
        await client.query(
          `INSERT INTO completions (plan_item_id, date, status, completed_at)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [item.id, fmtDate(today), status, status === 'done' ? `${fmtDate(today)} ${item.time}` : null]
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
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed נכשל:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

seed();
