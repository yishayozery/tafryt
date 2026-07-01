const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, display_name: user.display_name, is_admin: !!user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

// רישום מבקר חדש
router.post('/register', async (req, res) => {
  const { display_name, username, password, phone } = req.body;
  if (!display_name || !username || !password) {
    return res.status(400).json({ error: 'שם, שם משתמש וסיסמה הם שדות חובה' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' });
  }
  try {
    const exists = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'שם המשתמש כבר תפוס' });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      'INSERT INTO users (display_name, username, password_hash, phone) VALUES ($1,$2,$3,$4) RETURNING id, display_name, username, is_admin',
      [display_name, username, password_hash, phone || null]
    );
    res.status(201).json({ token: signToken(rows[0]), user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// כניסה
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'שם משתמש וסיסמה הם שדות חובה' });
  }
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }
    res.json({ token: signToken(user), user: { id: user.id, display_name: user.display_name, username: user.username, is_admin: user.is_admin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// יצירת קישור הזמנה למבוקר (ע"י מבקר)
router.post('/invite', requireAuth, async (req, res) => {
  const { monitored_phone, monitored_display_name } = req.body;
  if (!monitored_phone || !monitored_display_name) {
    return res.status(400).json({ error: 'טלפון ושם המבוקר הם שדות חובה' });
  }

  // וידוא נייד ישראלי
  const digits = monitored_phone.replace(/\D/g, '');
  if (!/^05\d{8}$/.test(digits)) {
    return res.status(400).json({ error: 'מספר נייד לא תקין (חייב להתחיל ב-05, 10 ספרות)' });
  }

  try {
    // בדיקת כפילות — משתמש קיים עם אותו נייד
    const existingUser = await db.query(
      `SELECT id FROM users WHERE REGEXP_REPLACE(phone, '\\D', '', 'g') = $1`,
      [digits]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'מספר הנייד כבר רשום במערכת' });
    }

    // בדיקת כפילות — הזמנה פתוחה עם אותו נייד
    const existingInvite = await db.query(
      `SELECT id FROM invite_tokens
       WHERE supervisor_id = $1
         AND REGEXP_REPLACE(monitored_phone, '\\D', '', 'g') = $2
         AND used_at IS NULL`,
      [req.user.id, digits]
    );
    if (existingInvite.rows.length > 0) {
      return res.status(409).json({ error: 'כבר שלחת הזמנה לנייד זה ועדיין לא הצטרף' });
    }

    const { rows } = await db.query(
      `INSERT INTO invite_tokens (supervisor_id, monitored_phone, monitored_display_name)
       VALUES ($1,$2,$3) RETURNING token`,
      [req.user.id, digits, monitored_display_name]
    );
    const link = `${process.env.CLIENT_URL || 'https://tafryt-kappa.vercel.app'}/join/${rows[0].token}`;
    res.json({ link, token: rows[0].token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// רישום מבוקר דרך קישור הזמנה
router.post('/join/:token', async (req, res) => {
  const { token } = req.params;
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'שם משתמש וסיסמה הם שדות חובה' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' });
  }
  try {
    const { rows: invites } = await db.query(
      'SELECT * FROM invite_tokens WHERE token = $1 AND used_at IS NULL',
      [token]
    );
    if (invites.length === 0) {
      return res.status(404).json({ error: 'קישור לא תקין או שכבר נוצל' });
    }
    const invite = invites[0];

    const exists = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'שם המשתמש כבר תפוס' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const { rows: newUsers } = await db.query(
      `INSERT INTO users (display_name, username, password_hash, phone)
       VALUES ($1,$2,$3,$4) RETURNING id, display_name, username`,
      [invite.monitored_display_name, username, password_hash, invite.monitored_phone]
    );
    const newUser = newUsers[0];

    await db.query(
      'INSERT INTO supervision_links (supervisor_id, monitored_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [invite.supervisor_id, newUser.id]
    );

    await db.query('UPDATE invite_tokens SET used_at = NOW() WHERE id = $1', [invite.id]);

    res.status(201).json({ token: signToken(newUser), user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// פרטי קישור הזמנה (לטופס ההרשמה)
router.get('/invite-info/:token', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT monitored_display_name, monitored_phone, used_at FROM invite_tokens WHERE token = $1',
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'קישור לא נמצא' });
    if (rows[0].used_at) return res.status(410).json({ error: 'קישור זה כבר נוצל' });
    res.json({ display_name: rows[0].monitored_display_name, phone: rows[0].monitored_phone });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// יצירת קישור איפוס סיסמה (ע"י מבקר עבור מבוקר)
router.post('/reset-link', requireAuth, async (req, res) => {
  const { monitored_id } = req.body;
  try {
    // וידוא שיש קשר מבקר-מבוקר
    const link = await db.query(
      'SELECT id FROM supervision_links WHERE supervisor_id=$1 AND monitored_id=$2 AND status=$3',
      [req.user.id, monitored_id, 'active']
    );
    if (link.rows.length === 0) return res.status(403).json({ error: 'אין הרשאה' });

    const { rows } = await db.query(
      'INSERT INTO reset_tokens (user_id) VALUES ($1) RETURNING token',
      [monitored_id]
    );
    const resetLink = `${process.env.CLIENT_URL || 'https://tafryt-kappa.vercel.app'}/reset/${rows[0].token}`;
    res.json({ link: resetLink });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// פרטי קישור איפוס
router.get('/reset-info/:token', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT rt.user_id, u.username, u.display_name, rt.used_at
       FROM reset_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token = $1`,
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'קישור לא נמצא' });
    if (rows[0].used_at) return res.status(410).json({ error: 'קישור זה כבר נוצל' });
    res.json({ username: rows[0].username, display_name: rows[0].display_name });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// איפוס סיסמה
router.post('/reset/:token', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' });
  }
  try {
    const { rows } = await db.query(
      'SELECT * FROM reset_tokens WHERE token = $1 AND used_at IS NULL',
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'קישור לא תקין או שכבר נוצל' });

    const password_hash = await bcrypt.hash(password, 12);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [password_hash, rows[0].user_id]);
    await db.query('UPDATE reset_tokens SET used_at=NOW() WHERE id=$1', [rows[0].id]);

    res.json({ message: 'הסיסמה אופסה בהצלחה' });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

// פרטי משתמש מחובר
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, display_name, username, phone, push_subscription FROM users WHERE id=$1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'משתמש לא נמצא' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'שגיאה פנימית' });
  }
});

module.exports = router;
