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
  const kvUrl = (opts.kvUrl || opts.upstashUrl || '').replace(/\/$/, '');
  const kvToken = opts.kvToken || opts.upstashToken || '';
  const adminId = opts.adminId || '';
  const tgApi = token ? `https://api.telegram.org/bot${token}` : '';

  // ---------- Subscriber store (Vercel KV REST API, free tier) ----------
  // Every private-chat user is added on first message. Broadcasts go to
  // this set. Without KV configured these are no-ops (broadcasts report 0).
  async function kv(cmd, ...args) {
    if (!kvUrl || !kvToken) return null;
    try {
      const url = kvUrl + '/' + [cmd, ...args.map((a) => encodeURIComponent(String(a)))].join('/');
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + kvToken } });
      const data = await res.json();
      return data.result ?? null;
    } catch (e) {
      console.error('[kv] error:', e.message);
      return null;
    }
  }
  async function recordSub(chatId) { await kv('sadd', 'subs', chatId); }
  async function listSubs() {
    const r = await kv('smembers', 'subs');
    return Array.isArray(r) ? r : [];
  }
  async function removeSub(chatId) { await kv('srem', 'subs', chatId); }

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

  async function tgSend(chatId, text, withKeyboard = true) {
    const body = { chat_id: chatId, text };
    if (withKeyboard) body.reply_markup = mainKeyboard();
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

  async function tgSendPhoto(chatId, fileId, caption) {
    const body = { chat_id: chatId, photo: fileId, caption: caption || '' };
    if (!token) {
      console.log('[DRY-RUN] would send photo to', chatId, JSON.stringify(body));
      return { dryRun: true };
    }
    const res = await fetch(`${tgApi}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log('[telegram] sendPhoto ok:', data.ok, data.description || '');
    return data;
  }

  // ---------- Broadcast (admin only) ----------
  // Admin sends: /broadcast <text>  — or a photo with caption "/broadcast <text>".
  // The bot forwards it to everyone who ever pressed /start (stored in KV).
  function isAdmin(chatId) { return !!adminId && String(chatId) === String(adminId); }
  async function doBroadcast(adminChatId, sendFn) {
    if (!kvUrl || !kvToken) {
      return tgSend(adminChatId, 'Broadcast လုပ်ဖို့ Vercel KV မချိတ်ရသေးဘူး — Vercel Dashboard → Storage မှာ KV Store တစ်ခု ဖွင့်ပြီး Project နဲ့ ချိတ်ပါ.');
    }
    const subs = await listSubs();
    let sent = 0, failed = 0;
    for (const id of subs) {
      try {
        const r = await sendFn(id);
        if (r && (r.ok || r.dryRun)) sent++;
        else {
          failed++;
          if (r && r.error_code === 403) await removeSub(id); // user blocked the bot
        }
      } catch (e) { failed++; }
      await new Promise((r) => setTimeout(r, 40)); // stay under Telegram rate limits
    }
    return tgSend(adminChatId, `📢 ပို့ပြီးပြီ!\n\n✅ ${sent} ယောက် ပို့ရတယ်\n❌ ${failed} ယောက် ပို့မရဘူး`);
  }
  async function handleBroadcast(chatId, body, sendFn) {
    if (!adminId) {
      return tgSend(chatId, 'Admin မသတ်မှတ်ရသေးဘူး — /myid ပို့ပြီး ရတဲ့ ID ကို ပေးပါ.');
    }
    if (!isAdmin(chatId)) {
      return tgSend(chatId, 'ဒီ command ကို Bot ပိုင်ရှင်ပဲ သုံးလို့ရတယ် 🙏');
    }
    if (!body) {
      return tgSend(chatId, 'သုံးနည်း:\n/broadcast <စာသား>\n\nပုံနဲ့ပို့ချင်ရင် ပုံကို caption "/broadcast <စာသား>" နဲ့ ပို့ပါ.');
    }
    return doBroadcast(chatId, sendFn);
  }
  async function handlePhotoBroadcast(chatId, msg) {
    const caption = (msg.caption || '').trim();
    const body = caption.slice('/broadcast'.length).trim();
    const photos = msg.photo || [];
    const fileId = photos.length ? photos[photos.length - 1].file_id : '';
    if (!fileId) return tgSend(chatId, 'ပုံကို ဖတ်မရဘူး, ထပ်ပို့ကြည့်ပါ.');
    return handleBroadcast(chatId, body, (id) => tgSendPhoto(id, fileId, body));
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
    if (t === '/myid') return tgSend(chatId, `မင်းရဲ့ Telegram ID: ${chatId}`);
    if (t === '/help') {
      let help = `MoeHtetTech Bot — အသုံးပြုနည်း 🤖\n\n` +
        `• ခလုတ်နှိပ်ပြီး Post တွေ ကြည့်ပါ (နောက်ဆုံး / Apps / Files / Video / ပုံများ)\n` +
        `• စာသား ရိုက်ပြီး ရှာပါ — ဥပမာ: VPN, MYTEL\n` +
        `• 🌐 “Website ဖွင့်မယ်” — Site ကို Telegram ထဲမှာ ဖွင့်တယ်\n` +
        `• ကိုက်တဲ့ Post မရှိရင် AI က ဖြေပေးတယ်\n\n` +
        `🌐 Website: ${siteUrl}`;
      if (isAdmin(chatId)) {
        help += `\n\n👑 Admin Commands:\n/broadcast <စာသား> — အားလုံးကို စာပို့မယ်\nပုံ + caption "/broadcast <စာသား>" — အားလုံးကို ပုံပို့မယ်`;
      }
      return tgSend(chatId, help);
    }
    if (t === '/broadcast' || t.startsWith('/broadcast ')) {
      const body = t.slice('/broadcast'.length).trim();
      return handleBroadcast(chatId, body, (id) => tgSend(id, body, false));
    }

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
    const msg = update?.message;
    if (!msg || !msg.chat) return;
    const chatId = msg.chat.id;
    // Remember every private-chat user so /broadcast can reach them later.
    if (msg.chat.type === 'private') await recordSub(chatId).catch(() => {});
    if (msg.photo && (msg.caption || '').trim().startsWith('/broadcast')) {
      return handlePhotoBroadcast(chatId, msg);
    }
    if (msg.text) {
      await handleText(chatId, msg.text);
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
    hasKv: !!(kvUrl && kvToken),
    hasAdmin: !!adminId,
  };
}

module.exports = { createBot, BOT_NAME };
