const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');

let _client;
function getClient() {
  if (!_client && process.env.ANTHROPIC_API_KEY) _client = new Anthropic();
  return _client;
}

// cacheKey מנרמל שם מזון + כמות לחיפוש אחיד
function cacheKey(foodName, quantity) {
  return [quantity, foodName].filter(Boolean).join(' ').trim().toLowerCase();
}

async function lookupCalories(foodName, quantity) {
  const key = cacheKey(foodName, quantity);

  // 1. בדוק cache
  try {
    const { rows } = await db.query('SELECT calories FROM food_calories_cache WHERE name=$1', [key]);
    if (rows.length) return rows[0].calories;
  } catch (_) {}

  // 2. Claude Haiku
  const c = getClient();
  if (!c) return null;

  try {
    const msg = await c.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `כמה קלוריות יש ב-"${key}" (מנה אחת סטנדרטית בישראל)? השב רק במספר שלם, ללא יחידות או הסבר.`,
      }],
    });
    const num = parseInt(msg.content[0].text.replace(/[^0-9]/g, ''));
    if (isNaN(num) || num <= 0) return null;

    // שמור ב-cache
    await db.query(
      `INSERT INTO food_calories_cache (name, calories)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET calories=$2, looked_up_at=NOW()`,
      [key, num]
    ).catch(() => {});

    return num;
  } catch (e) {
    console.error('calories lookup error:', e.message);
    return null;
  }
}

// מחפש קלוריות לכל פריטי plan_items שחסרה להם ערך (batch)
async function refreshPlanCalories() {
  const { rows: items } = await db.query(
    `SELECT DISTINCT ON (item_name, quantity) id, item_name, quantity
     FROM plan_items
     WHERE calories IS NULL
     ORDER BY item_name, quantity, id`
  );

  let updated = 0;
  for (const item of items) {
    const cal = await lookupCalories(item.item_name, item.quantity);
    if (cal) {
      // עדכן את כל פריטי plan_items עם אותו שם וכמות
      await db.query(
        'UPDATE plan_items SET calories=$1 WHERE item_name=$2 AND (quantity=$3 OR (quantity IS NULL AND $3 IS NULL)) AND calories IS NULL',
        [cal, item.item_name, item.quantity]
      );
      updated++;
    }
  }
  return { checked: items.length, updated };
}

module.exports = { lookupCalories, refreshPlanCalories };
