const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { lookupCalories } = require('../services/calories');

const router = express.Router({ mergeParams: true });

// כל שורות הלוח
router.get('/', requireAuth, async (req, res) => {
  try {
    const plan = await getPlanWithAccess(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'לוח לא נמצא' });

    const { rows } = await db.query(
      'SELECT * FROM plan_items WHERE plan_id=$1 ORDER BY day_of_week, specific_date, scheduled_time',
      [req.params.planId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// הוספת שורה
router.post('/', requireAuth, async (req, res) => {
  const { day_of_week, specific_date, scheduled_time, item_name, quantity, calories } = req.body;
  if (!scheduled_time || !item_name) {
    return res.status(400).json({ error: 'שעה ופריט הם שדות חובה' });
  }
  if (day_of_week == null && !specific_date) {
    return res.status(400).json({ error: 'יש לציין יום בשבוע או תאריך ספציפי' });
  }

  try {
    const plan = await getPlanWithAccess(req.params.planId, req.user.id, 'supervisor');
    if (!plan) return res.status(403).json({ error: 'אין הרשאה' });

    const { rows } = await db.query(
      `INSERT INTO plan_items (plan_id, day_of_week, specific_date, scheduled_time, item_name, quantity, calories)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.planId, day_of_week ?? null, specific_date ?? null, scheduled_time, item_name, quantity ?? null, calories ?? null]
    );
    res.status(201).json(rows[0]);

    // חיפוש קלוריות ברקע אם לא סופקו
    if (calories == null) {
      lookupCalories(item_name, quantity).then(cal => {
        if (cal) db.query('UPDATE plan_items SET calories=$1 WHERE id=$2', [cal, rows[0].id]).catch(() => {});
      }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// שכפול יום לכל השבוע
router.post('/duplicate-day', requireAuth, async (req, res) => {
  const { source_day } = req.body; // 0-6
  if (source_day == null) return res.status(400).json({ error: 'חסר source_day' });

  try {
    const plan = await getPlanWithAccess(req.params.planId, req.user.id, 'supervisor');
    if (!plan) return res.status(403).json({ error: 'אין הרשאה' });

    const { rows: sourceItems } = await db.query(
      'SELECT * FROM plan_items WHERE plan_id=$1 AND day_of_week=$2',
      [req.params.planId, source_day]
    );
    if (sourceItems.length === 0) {
      return res.status(400).json({ error: 'אין שורות ביום המקור' });
    }

    const created = [];
    for (let day = 0; day <= 6; day++) {
      if (day === source_day) continue;
      for (const item of sourceItems) {
        const { rows } = await db.query(
          `INSERT INTO plan_items (plan_id, day_of_week, scheduled_time, item_name, quantity, calories)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [req.params.planId, day, item.scheduled_time, item.item_name, item.quantity, item.calories]
        );
        if (rows.length > 0) created.push(rows[0]);
      }
    }
    res.json({ created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// עדכון שורה
router.put('/:itemId', requireAuth, async (req, res) => {
  const { day_of_week, specific_date, scheduled_time, item_name, quantity, calories, apply_from_date, apply_to_date } = req.body;
  try {
    const plan = await getPlanWithAccess(req.params.planId, req.user.id, 'supervisor');
    if (!plan) return res.status(403).json({ error: 'אין הרשאה' });

    const existing = await db.query(
      'SELECT * FROM plan_items WHERE id=$1 AND plan_id=$2',
      [req.params.itemId, req.params.planId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'שורה לא נמצאה' });
    const item = existing.rows[0];

    const newName = item_name ?? item.item_name;
    const newQty  = quantity  ?? item.quantity;
    // אם הועבר calories=null במפורש, נאפס ונחפש מחדש; אחרת שומרים את הקיים
    const newCalories = Object.prototype.hasOwnProperty.call(req.body, 'calories')
      ? (calories ?? null)
      : item.calories;

    const { rows } = await db.query(
      `UPDATE plan_items SET
         day_of_week=$1, specific_date=$2, scheduled_time=$3, item_name=$4, quantity=$5, calories=$6
       WHERE id=$7 RETURNING *`,
      [
        day_of_week ?? item.day_of_week,
        specific_date ?? item.specific_date,
        scheduled_time ?? item.scheduled_time,
        newName,
        newQty,
        newCalories,
        req.params.itemId,
      ]
    );

    // מחיקת completions ממתינים בטווח התאריכים שנבחר
    if (apply_from_date) {
      if (apply_to_date) {
        await db.query(
          "DELETE FROM completions WHERE plan_item_id=$1 AND date BETWEEN $2 AND $3 AND status IN ('pending', 'missed')",
          [req.params.itemId, apply_from_date, apply_to_date]
        );
      } else {
        await db.query(
          "DELETE FROM completions WHERE plan_item_id=$1 AND date >= $2 AND status IN ('pending', 'missed')",
          [req.params.itemId, apply_from_date]
        );
      }
    }

    res.json(rows[0]);

    // חיפוש קלוריות ברקע אם שם הפריט השתנה או קלוריות לא ידועות
    if (newCalories == null) {
      lookupCalories(newName, newQty).then(cal => {
        if (cal) db.query('UPDATE plan_items SET calories=$1 WHERE id=$2', [cal, rows[0].id]).catch(() => {});
      }).catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// מחיקת שורה
router.delete('/:itemId', requireAuth, async (req, res) => {
  try {
    const plan = await getPlanWithAccess(req.params.planId, req.user.id, 'supervisor');
    if (!plan) return res.status(403).json({ error: 'אין הרשאה' });

    const { rowCount } = await db.query(
      'DELETE FROM plan_items WHERE id=$1 AND plan_id=$2',
      [req.params.itemId, req.params.planId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'שורה לא נמצאה' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

async function getPlanWithAccess(planId, userId, role) {
  const { rows } = await db.query(
    'SELECT * FROM plans WHERE id=$1 AND (supervisor_id=$2 OR monitored_id=$2)',
    [planId, userId]
  );
  if (rows.length === 0) return null;
  if (role === 'supervisor' && rows[0].supervisor_id !== userId) return null;
  return rows[0];
}

module.exports = router;
