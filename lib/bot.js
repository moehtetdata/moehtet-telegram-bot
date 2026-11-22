// Shared bot core for the MoeHtetTech Telegram bot.
// Used by server.js (standalone Node server) and api/webhook.js (Vercel).
// Transport is injected: the caller supplies the Telegram send function
// through the bot instance; with no token the bot runs in DRY-RUN mode.

const BOT_NAME = 'MoeHtetTech';
const DEFAULT_FEED_URL =
  'https://script.google.com/macros/s/AKfycbyeXvBLYcbe038_QFTxiwulGH-oVbgsXI5_9VZ025MjfMaVGlRa_2QUX-0T6LTQeaxG8w/exec';
const DEFAULT_SITE_URL = 'https://paingmoehtet.from-mm.dev/';

function createBot(opts = {}) {
  const token = opts.token || '';
  const geminiKey = opts.geminiKey || '';
  const geminiModel = opts.geminiModel || 'gemini-3.5-flash';
  const feedUrl = opts.feedUrl || DEFAULT_FEED_URL;
  const siteUrl = opts.siteUrl || DEFAULT_SITE_URL;
  const tgApi = token ? `https://api.telegram.org/bot${token}` : '';

  // ---------- Posts feed (cached 5 min, per process) ----------
  let feedCache = { at: 0, posts: [] };
  async function getPosts() {
    if (Date.now() - feedCache.at < 5 * 60 * 1000 && feedCache.posts.length) {
      return feedCache.posts;
    }
    const res = await fetch(feedUrl, { redirect: 'follow' });
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
    return isImage ? (firstAppLink(p) || siteUrl) : (l || siteUrl);
  }
  const TYPE_LABEL = { 'App Link': '📱 App', 'File': '📁 File', 'Video': '🎬 Video', 'ပုံ': '🖼️ ပုံ' };
  function typeLabel(p) { return TYPE_LABEL[p.type] || '📌 Post'; }

  function formatPost(p, i) {
    const vip = isVip(p) ? ' 🔒 VIP' : '';
    return `${i + 1}. ${typeLabel(p)} ${cleanTitle(p)}${vip}\n   🔗 ${postLink(p)}`;
  }
  function formatList(posts, header) {
    const shown = posts.slice(0, 5);
    let out = `${header}\n\n${shown.map((p, i) => formatPost(p, i)).join('\n\n')}`;
    if (posts.length > 5) out += `\n\n...နောက်ထပ် ${posts.length - 5} ခု Site မှာ ကြည့်ပါ 👇\n${siteUrl}`;
    else out += `\n\n🌐 Site: ${siteUrl}`;
    return out;
  }
  function searchPosts(posts, q) {
    const needle = q.toLowerCase();
    return posts.filter(p =>
      (p.title || '').toLowerCase().includes(needle) ||
      (p.body || '').toLowerCase().includes(needle));
  }

  // ---------- Telegram send ----------
  function mainKeyboard() {
    return {
      keyboard: [
        [{ text: '🆕 နောက်ဆုံး' }, { text: '📱 Apps' }],
        [{ text: '📁 Files' }, { text: '🎬 Video' }],
        [{ text: '🖼️ ပုံများ' }],
        [{ text: '🌐 Website ဖွင့်မယ်', web_app: { url: siteUrl } }],
      ],
      resize_keyboard: true,
    };
  }

  async function tgSend(chatId, text) {
    const body = { chat_id: chatId, text, reply_markup: mainKeyboard() };
    if (!token) {
      console.log('[DRY-RUN] would send to', chatId, JSON.stringify(body, null, 2));
      return { dryRun: true };
    }
    const res = await fetch(`${tgApi}/sendMessage`, {
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
    `🌐 “Website ဖွင့်မယ်” ခလုတ်နှိပ်ရင် Site ကို Telegram ထဲမှာပဲ ဖွင့်ပေးတယ်။\n\n` +
    `🌐 Website: ${siteUrl}`;

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
    if (!geminiKey) return null; // no key → caller uses the fallback
    const titles = posts.map(p => `- ${cleanTitle(p)} (${typeLabel(p)}${isVip(p) ? ', VIP' : ''})`).join('\n');
    const prompt =
      `You are MoeHtetTech's assistant on Telegram. Answer in the SAME language the user used ` +
      `(Burmese if they write Burmese, English if English). Keep it short, 2-4 sentences, friendly.\n` +
      `You help with VPN apps, files, videos and tech tips from the MoeHtet Tech Sharing site.\n` +
      `Available posts right now:\n${titles}\n` +
      `Site: ${siteUrl}\n` +
      `Rules: if the user asks for a download or an app, point them to the matching post above and the site link. ` +
      `NEVER reveal, guess or invent VIP redeem codes. VIP posts need 100 points on the site or a redeem code. ` +
      `If you do not know the answer, say so briefly and suggest visiting the site.\n\n` +
      `User: ${userText}`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
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
      `အောက်က ခလုတ်တွေနဲ့ ကြည့်ကြည့်ပါ, ဒါမှမဟုတ် Site မှာ ရှာကြည့်ပါ 👇\n${siteUrl}`);
  }

  async function handleUpdate(update) {
    if (update?.message?.text) {
      await handleText(update.message.chat.id, update.message.text);
    }
  }

  return {
    BOT_NAME,
    WELCOME,
    mainKeyboard,
    tgSend,
    handleText,
    handleUpdate,
    isDryRun: !token,
    hasAi: !!geminiKey,
  };
}

module.exports = { createBot, BOT_NAME };
