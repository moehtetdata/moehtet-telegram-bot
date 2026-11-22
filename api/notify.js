// MoeHtetTech — new-post notifier (Vercel Serverless Function).
// Called every 10 min by a GitHub Actions timer (Vercel Hobby cron only
// runs once a day, too slow for post notifications).
// Protected by NOTIFY_SECRET — set the same value as a Vercel env var and
// as a GitHub repo secret. Never put the secret in code.
const { createBot } = require('../lib/bot');

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

module.exports = async (req, res) => {
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.secret || '';
  if (!process.env.NOTIFY_SECRET || given !== process.env.NOTIFY_SECRET) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    const out = await bot.notifyNewPosts();
    return res.status(200).json(out);
  } catch (e) {
    console.error('[notify] error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
