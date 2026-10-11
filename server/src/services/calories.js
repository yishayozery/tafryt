const Anthropic = require('@anthropic-ai/sdk');

let _client;
function getClient() {
  if (!_client && process.env.ANTHROPIC_API_KEY) _client = new Anthropic();
  return _client;
}

async function lookupCalories(foodName, quantity) {
  const c = getClient();
  if (!c) return null;
  const query = [quantity, foodName].filter(Boolean).join(' ');
  try {
    const msg = await c.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `כמה קלוריות יש ב-"${query}" (מנה אחת סטנדרטית בישראל)? השב רק במספר שלם, ללא יחידות או הסבר.`,
      }],
    });
    const num = parseInt(msg.content[0].text.replace(/[^0-9]/g, ''));
    return isNaN(num) || num <= 0 ? null : num;
  } catch (e) {
    console.error('calories lookup error:', e.message);
    return null;
  }
}

module.exports = { lookupCalories };
