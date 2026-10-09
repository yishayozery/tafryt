const BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function tgPost(method, body) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return null;
  try {
    const res = await fetch(`${BASE()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  } catch (err) {
    console.error(`Telegram ${method} error:`, err.message);
    return null;
  }
}

async function sendMessage(chatId, text, extra = {}) {
  if (!chatId) return;
  return tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

async function answerCallbackQuery(callbackQueryId, text) {
  return tgPost('answerCallbackQuery', { callback_query_id: callbackQueryId, text, show_alert: false });
}

async function downloadFile(fileId) {
  const data = await tgPost('getFile', { file_id: fileId });
  if (!data?.result?.file_path) throw new Error('Cannot get file path from Telegram');
  const filePath = data.result.file_path;
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Cannot download file from Telegram');
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = filePath.split('.').pop() || 'jpg';
  return { buffer, ext };
}

async function setWebhook(url) {
  return tgPost('setWebhook', { url, allowed_updates: ['message', 'callback_query'] });
}

module.exports = { sendMessage, answerCallbackQuery, downloadFile, setWebhook };
