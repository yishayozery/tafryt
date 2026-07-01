const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@tafryt.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendPush(subscription, payload) {
  if (!subscription) return;
  try {
    const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (err) {
    console.error('Push error:', err.statusCode, err.message);
  }
}

module.exports = { sendPush };
