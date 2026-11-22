// MoeHtetTech — Telegram Bot standalone server (Node.js, zero dependencies)
// Shares site posts + AI auto-reply (Google Gemini, free tier) on Telegram.
// Core logic lives in lib/bot.js (shared with the Vercel function api/webhook.js).
//
// Env vars:
//   TELEGRAM_BOT_TOKEN - bot token from @BotFather (required to send; without
//                        it the server runs in DRY-RUN mode and only logs)
//   GEMINI_API_KEY     - free key from Google AI Studio (enables AI replies)
//   GEMINI_MODEL       - default: gemini-3.5-flash
//   KV_REST_API_URL    - Vercel KV store URL (subscriber list for /broadcast)
//   KV_REST_API_TOKEN  - Vercel KV store token (auto-set when KV is linked)
//   ADMIN_CHAT_ID      - Telegram user id of the bot owner (for /broadcast)
//   WEBHOOK_SECRET     - optional; set the same value when calling setWebhook
//   NOTIFY_SECRET      - secret for POST /api/notify (auto-notify for new posts)
//   PORT               - default: 3000
const http = require('http');
const { createBot, BOT_NAME } = require('./lib/bot');
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const bot = createBot({
  token: process.env.TELEGRAM_BOT_TOKEN,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  kvUrl: process.env.KV_REST_API_URL,
  kvToken: process.env.KV_REST_API_TOKEN,
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  adminId: process.env.ADMIN_CHAT_ID,
});
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, bot: BOT_NAME, dryRun: bot.isDryRun, ai: bot.hasAi, kv: bot.hasKv, admin: bot.hasAdmin }));
  }
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      if (WEBHOOK_SECRET) {
        const secret = req.headers['x-telegram-bot-api-secret-token'];
        if (secret !== WEBHOOK_SECRET) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
        }
      }
      try {
        const update = JSON.parse(body || '{}');
        await bot.handleUpdate(update);
      } catch (e) {
        console.error('[webhook] error:', e);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (req.method === 'POST' && (req.url === '/api/notify' || req.url.startsWith('/api/notify?'))) {
    const secret = process.env.NOTIFY_SECRET || '';
    let got = '';
    const auth = req.headers.authorization || '';
    if (auth.toLowerCase().startsWith('bearer ')) got = auth.slice(7);
    if (!got) {
      try { got = new URL(req.url, 'http://x').searchParams.get('secret') || ''; } catch {}
    }
    if (!secret || got !== secret) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
    }
    bot.notifyNewPosts()
      .then((result) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      })
      .catch((e) => {
        console.error('[notify] error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'notify failed' }));
      });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});
server.listen(PORT, () => console.log(`Legacy server listening on http://localhost:${PORT}`));
