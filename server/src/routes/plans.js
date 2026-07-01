const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// כל הלוחות שיצר המבקר
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, u.display_name AS monitored_name
       FROM plans p
       JOIN users u ON u.id = p.monitored_id
       WHERE p.supervisor_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// לוחות פעילים של המבוקר (כל המבקרים שלו)
router.get('/my', requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await db.query(
      `SELECT p.*, u.display_name AS supervisor_name
       FROM plans p
       JOIN users u ON u.id = p.supervisor_id
       WHERE p.monitored_id = $1
         AND p.start_date <= $2
         AND p.end_date >= $2
       ORDER BY p.name`,
      [req.user.id, today]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// לוח ספציפי
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, u.display_name AS monitored_name
       FROM plans p
       JOIN users u ON u.id = p.monitored_id
       WHERE p.id = $1 AND (p.supervisor_id = $2 OR p.monitored_id = $2)`,
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'לוח לא נמצא' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// יצירת לוח
router.post('/', requireAuth, async (req, res) => {
  const {
    monitored_id, name, type, start_date, end_date,
    visibility_mode, photo_required, alert_threshold_minutes, notify_on_completion,
    relationship_type, supervisor_label, monitored_label,
  } = req.body;

  if (!monitored_id || !name || !start_date || !end_date) {
    return res.status(400).json({ error: 'שדות חסרים' });
  }

  try {
    const link = await db.query(
      'SELECT id FROM supervision_links WHERE supervisor_id=$1 AND monitored_id=$2 AND status=$3',
      [req.user.id, monitored_id, 'active']
    );
    if (link.rows.length === 0) return res.status(403).json({ error: 'אין הרשאה למבוקר זה' });

    const { rows } = await db.query(
      `INSERT INTO plans
         (supervisor_id, monitored_id, name, type, start_date, end_date,
          visibility_mode, photo_required, alert_threshold_minutes, notify_on_completion,
          relationship_type, supervisor_label, monitored_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        req.user.id, monitored_id, name, type || 'meal', start_date, end_date,
        visibility_mode || 'daily',
        photo_required ?? false,
        alert_threshold_minutes ?? 30,
        notify_on_completion ?? false,
        relationship_type || 'family',
        supervisor_label || 'הורה',
        monitored_label || 'ילד',
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// עדכון לוח
router.put('/:id', requireAuth, async (req, res) => {
  const {
    name, type, end_date, visibility_mode,
    photo_required, alert_threshold_minutes, notify_on_completion,
    relationship_type, supervisor_label, monitored_label,
  } = req.body;

  try {
    const existing = await db.query('SELECT * FROM plans WHERE id=$1 AND supervisor_id=$2', [
      req.params.id, req.user.id,
    ]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'לוח לא נמצא' });

    const plan = existing.rows[0];
    const { rows } = await db.query(
      `UPDATE plans SET
         name = $1, type = $2, end_date = $3,
         visibility_mode = $4, photo_required = $5,
         alert_threshold_minutes = $6, notify_on_completion = $7,
         relationship_type = $8, supervisor_label = $9, monitored_label = $10
       WHERE id = $11 RETURNING *`,
      [
        name ?? plan.name,
        type ?? plan.type,
        end_date ?? plan.end_date,
        visibility_mode ?? plan.visibility_mode,
        photo_required ?? plan.photo_required,
        alert_threshold_minutes ?? plan.alert_threshold_minutes,
        notify_on_completion ?? plan.notify_on_completion,
        relationship_type ?? plan.relationship_type,
        supervisor_label ?? plan.supervisor_label,
        monitored_label ?? plan.monitored_label,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// מחיקת לוח
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM plans WHERE id=$1 AND supervisor_id=$2',
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'לוח לא נמצא' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

module.exports = router;
