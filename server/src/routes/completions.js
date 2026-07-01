const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendPush } = require('../services/push');

const router = express.Router({ mergeParams: true });

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('רק קבצי תמונה מותרים'));
  },
});

// יצירת/אחזור Completion ליום ספציפי
async function ensureCompletion(planItemId, date) {
  await db.query(
    `INSERT INTO completions (plan_item_id, date) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [planItemId, date]
  );
  const { rows } = await db.query(
    'SELECT * FROM completions WHERE plan_item_id=$1 AND date=$2',
    [planItemId, date]
  );
  return rows[0];
}

// ביצועים של לוח לתאריך נתון (מבקר)
router.get('/by-date', requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'חסר date' });

  try {
    const plan = await getPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'לוח לא נמצא' });

    const { rows } = await db.query(
      `SELECT pi.*, c.id AS completion_id, c.status, c.replaced_with, c.photo_url, c.completed_at, c.date
       FROM plan_items pi
       LEFT JOIN completions c ON c.plan_item_id = pi.id AND c.date = $1
       WHERE pi.plan_id = $2
         AND (
           (pi.day_of_week IS NOT NULL AND pi.day_of_week = EXTRACT(DOW FROM $1::date))
           OR
           (pi.specific_date = $1::date)
         )
       ORDER BY pi.scheduled_time`,
      [date, req.params.planId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// ביצועים לשבוע (מבוקר — visibility weekly)
router.get('/week', requireAuth, async (req, res) => {
  const { start_date } = req.query;
  if (!start_date) return res.status(400).json({ error: 'חסר start_date' });

  try {
    const plan = await getPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'לוח לא נמצא' });

    const { rows } = await db.query(
      `SELECT pi.*, c.id AS completion_id, c.status, c.replaced_with, c.photo_url, c.completed_at, c.date
       FROM plan_items pi
       CROSS JOIN generate_series($1::date, $1::date + 6, '1 day'::interval) AS gs(day)
       LEFT JOIN completions c ON c.plan_item_id = pi.id AND c.date = gs.day::date
       WHERE pi.plan_id = $2
         AND (
           (pi.day_of_week IS NOT NULL AND pi.day_of_week = EXTRACT(DOW FROM gs.day))
           OR
           (pi.specific_date BETWEEN $1::date AND $1::date + 6)
         )
       ORDER BY gs.day, pi.scheduled_time`,
      [start_date, req.params.planId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// היסטוריה (מבקר)
router.get('/history', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  try {
    const plan = await getPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'לוח לא נמצא' });
    if (plan.supervisor_id !== req.user.id) return res.status(403).json({ error: 'אין הרשאה' });

    const { rows } = await db.query(
      `SELECT pi.item_name, pi.quantity, pi.scheduled_time, pi.day_of_week, pi.specific_date,
              c.date, c.status, c.replaced_with, c.photo_url, c.completed_at
       FROM completions c
       JOIN plan_items pi ON pi.id = c.plan_item_id
       WHERE pi.plan_id = $1
         AND c.date BETWEEN $2 AND $3
       ORDER BY c.date DESC, pi.scheduled_time`,
      [req.params.planId, from || '1970-01-01', to || '9999-12-31']
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// סימון ביצוע (מבוקר)
router.post('/:completionId/done', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const comp = await getCompletion(req.params.completionId, req.params.planId);
    if (!comp) return res.status(404).json({ error: 'ביצוע לא נמצא' });

    const plan = await getPlan(req.params.planId, req.user.id);
    if (!plan || plan.monitored_id !== req.user.id) {
      return res.status(403).json({ error: 'אין הרשאה' });
    }

    // בדיקת חובת צילום
    if (plan.photo_required && !req.file) {
      return res.status(400).json({ error: 'צילום הוא חובה ללוח זה' });
    }

    const photo_url = req.file ? `/uploads/${req.file.filename}` : (comp.photo_url || null);

    const { rows } = await db.query(
      `UPDATE completions SET status='done', photo_url=$1, completed_at=NOW()
       WHERE id=$2 RETURNING *`,
      [photo_url, comp.id]
    );

    // התראה למבקר אם הוגדרה
    if (plan.notify_on_completion) {
      const supervisor = await db.query('SELECT push_subscription, display_name FROM users WHERE id=$1', [plan.supervisor_id]);
      if (supervisor.rows[0]?.push_subscription) {
        await sendPush(supervisor.rows[0].push_subscription, {
          title: `${plan.name} — בוצע`,
          body: `${comp.item_name} סומן כבוצע`,
        });
      }
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// החלפת פריט (מבוקר)
router.post('/:completionId/replace', requireAuth, upload.single('photo'), async (req, res) => {
  const { replaced_with } = req.body;
  if (!replaced_with) return res.status(400).json({ error: 'חסר replaced_with' });

  try {
    const comp = await getCompletion(req.params.completionId, req.params.planId);
    if (!comp) return res.status(404).json({ error: 'ביצוע לא נמצא' });

    const plan = await getPlan(req.params.planId, req.user.id);
    if (!plan || plan.monitored_id !== req.user.id) {
      return res.status(403).json({ error: 'אין הרשאה' });
    }

    if (plan.photo_required && !req.file) {
      return res.status(400).json({ error: 'צילום הוא חובה ללוח זה' });
    }

    const photo_url = req.file ? `/uploads/${req.file.filename}` : (comp.photo_url || null);

    const { rows } = await db.query(
      `UPDATE completions SET status='replaced', replaced_with=$1, photo_url=$2, completed_at=NOW()
       WHERE id=$3 RETURNING *`,
      [replaced_with, photo_url, comp.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// יצירת completion ליום (נדרש לפני done/replace)
router.post('/ensure', requireAuth, async (req, res) => {
  const { plan_item_id, date } = req.body;
  try {
    const plan = await getPlan(req.params.planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'לוח לא נמצא' });
    const comp = await ensureCompletion(plan_item_id, date);
    res.json(comp);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// ביטול אפשרות (כשבוחרים אפשרות אחרת)
router.post('/:completionId/cancel', requireAuth, async (req, res) => {
  try {
    const comp = await getCompletion(req.params.completionId, req.params.planId);
    if (!comp) return res.status(404).json({ error: 'ביצוע לא נמצא' });
    const plan = await getPlan(req.params.planId, req.user.id);
    if (!plan || plan.monitored_id !== req.user.id) return res.status(403).json({ error: 'אין הרשאה' });
    if (comp.status === 'done' || comp.status === 'replaced') {
      return res.status(400).json({ error: 'לא ניתן לבטל ביצוע שכבר דווח' });
    }
    const { rows } = await db.query(
      "UPDATE completions SET status='cancelled' WHERE id=$1 RETURNING *",
      [comp.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// שחזור אפשרות מבוטלת (שינוי בחירה)
router.post('/:completionId/reactivate', requireAuth, async (req, res) => {
  try {
    const comp = await getCompletion(req.params.completionId, req.params.planId);
    if (!comp) return res.status(404).json({ error: 'ביצוע לא נמצא' });
    const plan = await getPlan(req.params.planId, req.user.id);
    if (!plan || plan.monitored_id !== req.user.id) return res.status(403).json({ error: 'אין הרשאה' });
    if (comp.status !== 'cancelled') return res.status(400).json({ error: 'הביצוע אינו מבוטל' });
    const { rows } = await db.query(
      "UPDATE completions SET status='pending' WHERE id=$1 RETURNING *",
      [comp.id]
    );
    res.json(rows[0]);
  } catch (err) {
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

async function getCompletion(completionId, planId) {
  const { rows } = await db.query(
    `SELECT c.*, pi.item_name, pi.quantity, pi.scheduled_time
     FROM completions c
     JOIN plan_items pi ON pi.id = c.plan_item_id
     WHERE c.id=$1 AND pi.plan_id=$2`,
    [completionId, planId]
  );
  return rows[0] || null;
}

module.exports = router;
