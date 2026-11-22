// MoeHtet Tech — Telegram Bot server (Node.js, zero dependencies)
// Shares site posts + AI auto-reply (Google Gemini, free tier) on Telegram.
//
// Env vars:
//   TELEGRAM_BOT_TOKEN - bot token from @BotFather (required to send; without
//                        it the server runs in DRY-RUN mode and only logs)
//   GEMINI_API_KEY     - free key from Google AI Studio (enables AI replies)
//   GEMINI_MODEL       - default: gemini-2.0-flash
//   WEBHOOK_SECRET     - optional; set the same value when calling setWebhook
//   PORT               - default: 3000
//   FEED_URL           - Google Apps Script posts API (default below)
//   SITE_URL           - default: https://paingmoehtet.from-mm.dev/

const http = require('http');

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const FEED_URL = process.env.FEED_URL ||
  'https://script.google.com/macros/s/AKfycbyeXvBLYcbe038_QFTxiwulGH-oVbgsXI5_9VZ025MjfMaVGlRa_2QUX-0T6LTQeaxG8w/exec';
const SITE_URL = process.env.SITE_URL || 'https://paingmoehtet.from-mm.dev/';
const TG_API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : '';

// ---------- Posts feed (cached 5 min) ----------
let feedCache = { at: 0, posts: [] };

async function getPosts() {
  if (Date.now() - feedCache.at < 5 * 60 * 1000 && feedCache.posts.length) {
    return feedCache.posts;
  }
  const res = await fetch(FEED_URL, { redirect: 'follow' });
  const data = await res.json();
  const posts = Array.isArray(data.posts) ? data.posts : [];
  feedCache = { at: Date.now(), posts };
  return posts;
}

// ---------- Post helpers (same rules as the website) ----------
function isVip(p) { return /\[VIP(?::[^\]]+)?\]/i.test(p.title || ''); }
// Strip "[VIP]" and "[VIP:CODE]" — the code must NEVER be shown in the bot.
function cleanTitle(p) {
  return (p.title || '').replace(/\[VIP(?::[^\]]+)?\]\s*/i, '').trim();
}
function firstAppLink(p) {
  const body = p.body || '';
  const urls = body.match(/https?:\/\/[^\s"'<>]+/g) || [];
  for (const u of urls) {
    if (!/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u) &&
        !/drive\.google\.com|docs\.google\.com|lh3\.googleusercontent/i.test(u)) return u;
  }
  return null;
}
function postLink(p) {
  const l = p.link || '';
  const isImage = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(l) ||
    /drive\.google\.com|docs\.google\.com|lh3\.googleusercontent/i.test(l);
  return isImage ? (firstAppLink(p) || SITE_URL) : (l || SITE_URL);
}
const TYPE_LABEL = { 'App Link': '📱 App', 'File': '📁 File', 'Video': '🎬 Video', 'ပုံ': '🖼️ ပုံ' };
function typeLabel(p) { return TYPE_LABEL[p.type] || '📌 Post'; }

function formatPost(p, i) {
  const vip = isVip(p) ? ' 🔒 VIP' : '';
  const link = postLink(p);
  return `${i + 1}. ${typeLabel(p)} ${cleanTitle(p)}${vip}\n   🔗 ${link}`;
}
function formatList(posts, header) {
  const shown = posts.slice(0, 5);
  const lines = shown.map((p, i) => formatPost(p, i));
  let out = `${header}\n\n${lines.join('\n\n')}`;
  if (posts.length > 5) out += `\n\n...နောက်ထပ် ${posts.length - 5} ခု Site မှာ ကြည့်ပါ 👇\n${SITE_URL}`;
  else out += `\n\n🌐 Site: ${SITE_URL}`;
  return out;
}

function searchPosts(posts, q) {
  const needle = q.toLowerCase();
  return posts.filter(p =>
    (p.title || '').toLowerCase().includes(needle) ||
    (p.body || '').toLowerCase().includes(needle));
}

// ---------- Telegram API ----------
async function tgSend(chatId, text) {
  const body = {
    chat_id: chatId,
    text,
    reply_markup: {
      keyboard: [
        [{ text: '🆕 နောက်ဆုံး' }, { text: '📱 Apps' }],
        [{ text: '📁 Files' }, { text: '🎬 Video' }],
        [{ text: '🖼️ ပုံများ' }],
      ],
      resize_keyboard: true,
    },
  };
  if (!TOKEN) {
    console.log('[DRY-RUN] would send to', chatId, JSON.stringify(body, null, 2));
    return { dryRun: true };
  }
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log('[telegram] sendMessage ok:', data.ok, data.description || '');
  return data;
}

const WELCOME =
  `မင်္ဂလာပါ! 👋 MoeHtetTech Bot ပါ။\n\n` +
  `VPN App, File, Video နဲ့ နည်းပညာ Tips တွေ ဒီမှာ မေးလို့ရတယ်။\n` +
  `အောက်က ခလုတ်နှိပ်ပြီး Post တွေ ကြည့်နိုင်သလို, ရှာချင်တဲ့ စာသား ရိုက်ထည့်လိုက်လည်း ရတယ်။\n\n` +
  `ဥပမာ: VPN, MYTEL, Data\n\n` +
  `🌐 Website: ${SITE_URL}`;

// Map the keyboard button labels back to commands.
function buttonToCommand(text) {
  switch (text) {
    case '🆕 နောက်ဆုံး': return 'LATEST';
    case '📱 Apps': return 'CAT:App Link';
    case '📁 Files': return 'CAT:File';
    case '🎬 Video': return 'CAT:Video';
    case '🖼️ ပုံများ': return 'CAT:ပုံ';
    default: return text;
  }
}

// ---------- AI auto-reply (Google Gemini) ----------
async function aiReply(userText, posts) {
  if (!GEMINI_KEY) return null; // no key → caller uses the fallback
  const titles = posts.map(p => `- ${cleanTitle(p)} (${typeLabel(p)}${isVip(p) ? ', VIP' : ''})`).join('\n');
  const prompt =
    `You are MoeHtet Tech's assistant on Telegram. Answer in the SAME language the user used ` +
    `(Burmese if they write Burmese, English if English). Keep it short, 2-4 sentences, friendly.\n` +
    `You help with VPN apps, files, videos and tech tips from the MoeHtet Tech Sharing site.\n` +
    `Available posts right now:\n${titles}\n` +
    `Site: ${SITE_URL}\n` +
    `Rules: if the user asks for a download or an app, point them to the matching post above and the site link. ` +
    `NEVER reveal, guess or invent VIP redeem codes. VIP posts need 100 points on the site or a redeem code. ` +
    `If you do not know the answer, say so briefly and suggest visiting the site.\n\n` +
    `User: ${userText}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
      }),
    });
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return (text || '').trim() || null;
}

// ---------- Message handling ----------
async function handleText(chatId, rawText) {
  const t = buttonToCommand((rawText || '').trim());
  if (t === '/start') return tgSend(chatId, WELCOME);

  const posts = await getPosts().catch(() => []);
  if (!posts.length) {
    return tgSend(chatId, 'ခဏလေး Post တွေ ဆွဲမရသေးဘူး, နောက်တစ်ခါ ထပ်ကြိုးစားကြည့်ပါ 🙏');
  }

  if (t === 'LATEST') {
    return tgSend(chatId, formatList(posts, '🆕 နောက်ဆုံး Post များ'));
  }
  if (t.startsWith('CAT:')) {
    const cat = t.slice(4);
    const list = posts.filter(p => p.type === cat);
    if (!list.length) {
      return tgSend(chatId, `“${cat}” အမျိုးအစား Post မရှိသေးဘူး 😅\n\nနောက်ဆုံး Post တွေကြည့်မလား?`);
    }
    return tgSend(chatId, formatList(list, `${typeLabel({ type: cat })} Post များ`));
  }

  // Free text: search posts first, AI second.
  const found = searchPosts(posts, t);
  if (found.length) {
    return tgSend(chatId, formatList(found, `“${t}” အတွက် ${found.length} ခု တွေ့တယ် 🔍`));
  }

  const ai = await aiReply(t, posts).catch((e) => {
    console.error('[ai] error:', e.message);
    return null;
  });
  if (ai) return tgSend(chatId, ai);

  return tgSend(chatId,
    `“${t}” နဲ့ ကိုက်တဲ့ Post မတွေ့ဘူး 😅\n\n` +
    `အောက်က ခလုတ်တွေနဲ့ ကြည့်ကြည့်ပါ, ဒါမှမဟုတ် Site မှာ ရှာကြည့်ပါ 👇\n${SITE_URL}`);
}

// ---------- HTTP server ----------
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, bot: 'MoeHtetTech', dryRun: !TOKEN, ai: !!GEMINI_KEY }));
  }

  if (req.method === 'POST' && req.url === '/webhook') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      if (WEBHOOK_SECRET) {
        const got = req.headers['x-telegram-bot-api-secret-token'];
        if (got !== WEBHOOK_SECRET) {
          console.warn('[webhook] bad secret token — ignored');
          return;
        }
      }
      let update;
      try { update = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return; }
      try {
        if (update.message?.text) {
          await handleText(update.message.chat.id, update.message.text);
        }
      } catch (e) {
        console.error('[webhook] handler error:', e);
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`MoeHtetTech Telegram bot listening on :${PORT} (dryRun=${!TOKEN}, ai=${!!GEMINI_KEY})`);
});
