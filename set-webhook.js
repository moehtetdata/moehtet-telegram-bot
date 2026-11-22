// Sets the Telegram webhook URL for this bot.
// Usage: TELEGRAM_BOT_TOKEN=xxx WEBHOOK_URL=https://your-server/webhook node set-webhook.js
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const URL = process.env.WEBHOOK_URL;
const SECRET = process.env.WEBHOOK_SECRET || undefined;
if (!TOKEN || !URL) {
  console.error('Need TELEGRAM_BOT_TOKEN and WEBHOOK_URL env vars.');
  process.exit(1);
}
(async () => {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: URL, secret_token: SECRET, drop_pending_updates: true }),
  });
  console.log(await res.json());
})();
