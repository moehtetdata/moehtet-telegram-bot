// MoeHtetTech — Telegram Bot as a Vercel Serverless Function.
// Deploy the repo on Vercel (Hobby, free, no card needed) and set the
// Telegram webhook to https://<your-app>.vercel.app/api/webhook
// Core logic lives in lib/bot.js (shared with server.js).

const { createBot, BOT_NAME } = require('../lib/bot');

const bot = createBot({
  token: process.env.TELEGRAM_BOT_TOKEN,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
});

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, bot: BOT_NAME, dryRun: bot.isDryRun, ai: bot.hasAi });
  }

  if (req.method === 'POST') {
    const secret = process.env.WEBHOOK_SECRET || '';
    if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
      return res.status(403).json({ ok: false, error: 'bad secret' });
    }
    try {
      await bot.handleUpdate(req.body || {});
    } catch (e) {
      console.error('[webhook] handler error:', e);
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ ok: false, error: 'not found' });
};
