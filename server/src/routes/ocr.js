const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('רק קבצי תמונה'));
  },
});

const SYSTEM_PROMPT = `אתה מומחה לניתוח תפריטים ולוחות הזנה.
תפקידך: לקבל תמונה של לוח תפריט ולחלץ ממנה נתונים מובנים.
החזר תמיד JSON תקני בלבד — ללא שום טקסט, הסברים, או markdown.`;

const USER_PROMPT = `נתח את תמונת התפריט וחלץ את כל הארוחות והפריטים.

החזר JSON בפורמט הזה בדיוק:
{
  "meals": [
    {
      "time": "07:30",
      "items": [
        { "item_name": "שם הפריט", "quantity": null }
      ]
    }
  ]
}

כללים:
- שעות בפורמט HH:MM (24 שעות). אם לא ברורה — נחש לפי הקשר (בוקר=07:30, ביניים=10:00, צהריים=13:00, אחה"צ=16:00, ערב=19:00, לילה=21:00)
- quantity: מחרוזת אם יש כמות מפורשת (כמו "2 פרוסות", "כוס"), null אם אין
- כלול כל הפריטים כולל חטיפים, שתייה, קינוחים
- אם יש מספר אפשרויות לאותה ארוחה (אפ׳ 1, אפ׳ 2, אפ׳ 3) — צור ערך נפרד לכל אפשרות עם quantity = "אפ׳ 1", "אפ׳ 2", "אפ׳ 3"
- אם יש slash בין אפשרויות (לדוגמה "עוף / דג") — השאר כטקסט אחד בitem_name
- JSON תקני בלבד, ללא הערות`;

router.post('/scan', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נשלחה תמונה' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY לא מוגדר בסביבה' });

  try {
    const client = new Anthropic({ apiKey });

    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype; // 'image/jpeg' | 'image/png' | etc.

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: USER_PROMPT },
        ],
      }],
    });

    const text = response.content[0]?.text?.trim() || '';
    // חלץ JSON גם אם יש טקסט עוטף
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start === -1 || end === 0) throw new Error('התגובה אינה JSON תקני');

    const parsed = JSON.parse(text.slice(start, end));
    if (!parsed.meals || !Array.isArray(parsed.meals)) throw new Error('פורמט שגוי — חסר שדה meals');

    res.json({ meals: parsed.meals });
  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ error: 'שגיאה בניתוח: ' + err.message });
  }
});

module.exports = router;
