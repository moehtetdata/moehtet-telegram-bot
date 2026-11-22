// MoeHtetTech — Telegram Bot standalone server (Node.js, zero dependencies)
// Shares site posts + AI auto-reply (Google Gemini, free tier) on Telegram.
// Core logic lives in lib/bot.js (shared with the Vercel function api/webhook.js).
//
// Env vars:
//   TELEGRAM_BOT_TOKEN - bot token from @BotFather (required to send; without
//                        it the server runs in DRY-RUN mode and only logs)
//   GEMINI_API_KEY     - free key from Google AI Studio (enables AI replies)
//   GEMINI_MODEL       - default: gemini-3.5-flash
//   WEBHOOK_SECRET     - optional; set the same value when calling setWebhook
//   PORT               - default: 3000

const http = require('http');
const { createBot, BOT_NAME } = require('./lib/bot');

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const bot = createBot({
  token: process.env.TELEGRAM_BOT_TOKEN,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
});

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, bot: BOT_NAME, dryRun: bot.isDryRun, ai: bot.hasAi }));
  }

  if (req.method === 'POST' && req.url === '/webhook') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      // NOTE: handle the update BEFORE replying 200. On serverless hosts
      // (Vercel) the function can freeze the moment the response ends, so
      // replying first meant the bot never got to send its reply.
      if (WEBHOOK_SECRET) {
        const got = req.headers['x-telegram-bot-api-secret-token'];
        if (got !== WEBHOOK_SECRET) {
          console.warn('[webhook] bad secret token — ignored');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true }));
        }
      }
      let update;
      try { update = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }
      try {
        await bot.handleUpdate(update);
      } catch (e) {
        console.error('[webhook] handler error:', e);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`${BOT_NAME} Telegram bot listening on :${PORT} (dryRun=${bot.isDryRun}, ai=${bot.hasAi})`);
});
