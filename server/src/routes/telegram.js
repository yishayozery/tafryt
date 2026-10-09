const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendMessage, answerCallbackQuery, downloadFile } = require('../services/telegram');

// POST /api/telegram/webhook — Telegram sends all updates here
router.post('/webhook', express.json(), async (req, res) => {
  res.sendStatus(200); // respond immediately to Telegram

  const update = req.body;
  if (!update) return;

  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  } catch (err) {
    console.error('Telegram webhook error:', err);
  }
});

// POST /api/telegram/link — generate a link code (requires auth)
router.post('/link', requireAuth, async (req, res) => {
  try {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await db.query(
      `INSERT INTO telegram_link_codes (code, user_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET code=$1, expires_at=$3`,
      [code, req.user.id, expiresAt]
    );
    const botName = process.env.TELEGRAM_BOT_NAME || 'ArielMenuBot';
    res.json({ code, bot_url: `https://t.me/${botName}`, expires_minutes: 10 });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה' });
  }
});

// DELETE /api/telegram/link — unlink
router.delete('/link', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE users SET telegram_chat_id=NULL WHERE id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה' });
  }
});

// GET /api/telegram/status — check if linked (requires auth)
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT telegram_chat_id IS NOT NULL AS linked FROM users WHERE id=$1', [req.user.id]);
    res.json({ linked: rows[0]?.linked || false });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה' });
  }
});

// POST /api/telegram/set-webhook — set webhook URL (admin only)
router.post('/set-webhook', requireAuth, async (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ error: 'אין הרשאה' });
    const { setWebhook } = require('../services/telegram');
    const webhookUrl = `${process.env.SERVER_URL || req.headers.origin}/api/telegram/webhook`;
    const result = await setWebhook(webhookUrl);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Internal handlers ---

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const photo = msg.photo;

  // /start — welcome
  if (text === '/start') {
    await sendMessage(chatId,
      '👋 שלום! אני הבוט של <b>תפריט מבוקר</b>.\n\n' +
      'כדי לקבל התראות, פתח את האפליקציה → הגדרות התראות → חבר טלגרם\n' +
      'ושלח לי את הקוד שתקבל שם.'
    );
    return;
  }

  // Photo — link to today's pending completion
  if (photo) {
    const { rows: users } = await db.query('SELECT id FROM users WHERE telegram_chat_id=$1', [String(chatId)]);
    if (!users.length) {
      await sendMessage(chatId, '⚠️ החשבון שלך לא מחובר. פתח את האפליקציה וחבר טלגרם.');
      return;
    }
    const userId = users[0].id;
    await handlePhotoFromUser(chatId, userId, photo);
    return;
  }

  // Link code (6-char alphanumeric)
  if (/^[A-Z0-9]{6}$/.test(text)) {
    await handleLinkCode(chatId, text);
    return;
  }

  await sendMessage(chatId, '🤔 לא הבנתי. שלח קוד חיבור מהאפליקציה, או שלח תמונה כדי לדווח על ביצוע.');
}

async function handleLinkCode(chatId, code) {
  const { rows } = await db.query(
    `SELECT user_id FROM telegram_link_codes WHERE code=$1 AND expires_at > NOW()`,
    [code]
  );
  if (!rows.length) {
    await sendMessage(chatId, '❌ הקוד לא נמצא או פג תוקפו. קבל קוד חדש מהאפליקציה.');
    return;
  }
  const userId = rows[0].user_id;
  await db.query('UPDATE users SET telegram_chat_id=$1 WHERE id=$2', [String(chatId), userId]);
  await db.query('DELETE FROM telegram_link_codes WHERE user_id=$1', [userId]);

  const { rows: userRows } = await db.query('SELECT display_name FROM users WHERE id=$1', [userId]);
  const name = userRows[0]?.display_name || 'משתמש';
  await sendMessage(chatId, `✅ חובר בהצלחה! שלום ${name} 👋\n\nתקבל/י עכשיו התראות כאן בטלגרם.`);
}

async function handlePhotoFromUser(chatId, userId, photoArray) {
  // Telegram sends array sorted by size — take largest
  const fileId = photoArray[photoArray.length - 1].file_id;

  try {
    const { buffer, ext } = await downloadFile(fileId);
    const filename = `tg-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);
    const photoUrl = `/uploads/${filename}`;

    // Find today's most recent pending completion for this user
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const { rows: comps } = await db.query(
      `SELECT c.id, pi.item_name
       FROM completions c
       JOIN plan_items pi ON pi.id = c.plan_item_id
       JOIN plans p ON p.id = pi.plan_id
       WHERE p.monitored_id = $1
         AND c.date = $2
         AND c.status IN ('pending', 'missed')
       ORDER BY pi.scheduled_time DESC
       LIMIT 1`,
      [userId, todayStr]
    );

    if (!comps.length) {
      await sendMessage(chatId, '⚠️ לא נמצא פריט פתוח להיום. התמונה לא נשמרה.');
      return;
    }

    const comp = comps[0];
    await db.query(
      `UPDATE completions SET status='done', photo_url=$1, completed_at=NOW() WHERE id=$2`,
      [photoUrl, comp.id]
    );

    await sendMessage(chatId, `✅ <b>${comp.item_name}</b> סומן כבוצע עם תמונה!`);

    // Notify supervisor
    await notifySupervisorOnDone(comp.id, comp.item_name);
  } catch (err) {
    console.error('Telegram photo handling error:', err);
    await sendMessage(chatId, '❌ שגיאה בשמירת התמונה. נסה שוב.');
  }
}

async function handleCallback(cbq) {
  const chatId = cbq.message?.chat?.id;
  const data = cbq.data || '';

  if (data.startsWith('done:')) {
    const completionId = data.slice(5);
    try {
      const { rows } = await db.query(
        `UPDATE completions SET status='done', completed_at=NOW()
         WHERE id=$1 AND status IN ('pending','missed')
         RETURNING id`,
        [completionId]
      );
      if (rows.length) {
        await answerCallbackQuery(cbq.id, '✅ סומן כבוצע!');
        await sendMessage(chatId, '✅ דווח כבוצע!');

        // Notify supervisor
        const { rows: compRows } = await db.query(
          `SELECT pi.item_name FROM completions c JOIN plan_items pi ON pi.id=c.plan_item_id WHERE c.id=$1`,
          [completionId]
        );
        if (compRows.length) await notifySupervisorOnDone(completionId, compRows[0].item_name);
      } else {
        await answerCallbackQuery(cbq.id, '⚠️ הפריט כבר דווח');
      }
    } catch (err) {
      await answerCallbackQuery(cbq.id, '❌ שגיאה');
    }
  }
}

async function notifySupervisorOnDone(completionId, itemName) {
  try {
    const { rows } = await db.query(
      `SELECT u.telegram_chat_id, u.push_subscription, p.name AS plan_name
       FROM completions c
       JOIN plan_items pi ON pi.id = c.plan_item_id
       JOIN plans p ON p.id = pi.plan_id
       JOIN users u ON u.id = p.supervisor_id
       WHERE c.id = $1 AND p.notify_on_completion = true`,
      [completionId]
    );
    for (const r of rows) {
      if (r.telegram_chat_id) {
        await sendMessage(r.telegram_chat_id, `✅ <b>${r.plan_name}</b>\n${itemName} בוצע!`);
      }
    }
  } catch (err) {
    console.error('notifySupervisorOnDone error:', err);
  }
}

module.exports = router;
