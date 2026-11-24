// Shared bot core for the MoeHtetTech Telegram bot.
// Used by server.js (standalone Node server) and api/webhook.js (Vercel).
// Transport is injected: the caller supplies the Telegram send function
// through the bot instance; with no token the bot runs in DRY-RUN mode.

const BOT_NAME = 'MoeHtetTech';
const DEFAULT_FEED_URL =
  'https://script.google.com/macros/s/AKfycbyeXvBLYcbe038_QFTxiwulGH-oVbgsXI5_9VZ025MjfMaVGlRa_2QUX-0T6LTQeaxG8w/exec';
const DEFAULT_SITE_URL = 'https://paingmoehtet.from-mm.dev/';
const MIRROR_SITE_URL = 'https://moehtet.cv/';

function createBot(opts = {}) {
  const token = opts.token || '';
  const geminiKey = opts.geminiKey || '';
  const geminiModel = opts.geminiModel || 'gemini-3.5-flash';
  const feedUrl = opts.feedUrl || DEFAULT_FEED_URL;
  const siteUrl = opts.siteUrl || DEFAULT_SITE_URL;
  // Both website addresses, shown wherever the bot points to the site.
  // (The keyboard web_app button can only open ONE url, so it keeps siteUrl.)
  function siteText() { return `${siteUrl}\n${MIRROR_SITE_URL}`; }
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

  // ---------- Redeem codes (per-user VIP unlocks, stored in KV) ----------
  // A user sends a code (bare, or "/redeem CODE") and the matching VIP post
  // unlocks for them in the bot. The code itself is never shown in a reply.
  function codeOf(p) {
    const m = /\[VIP:([^\]]+)\]/i.exec(p.title || '');
    return m ? m[1].trim() : null;
  }
  function postKey(p) { return String(p.row ?? p.id ?? p.title); }
  function unlockedKey(chatId) { return 'unlocked:' + chatId; }
  async function unlock(chatId, postId) { await kv('sadd', unlockedKey(chatId), postId); }
  async function getUnlocked(chatId) {
    const r = await kv('smembers', unlockedKey(chatId));
    return new Set(Array.isArray(r) ? r.map(String) : []);
  }
  async function handleRedeem(chatId, post) {
    await unlock(chatId, postKey(post));
    const body = (post.body || '').trim();
    const short = body.length > 800 ? body.slice(0, 800) + '…' : body;
    return tgSend(chatId,
      `✅ “${cleanTitle(post)}” ပွင့်သွားပြီ! 🎉\n\n${short}\n\n🔗 Download Link: ${postLink(post)}`);
  }

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

  function formatPost(p, i, unlocked) {
    const isUn = unlocked && unlocked.has(postKey(p));
    if (isVip(p) && isUn) {
      const body = (p.body || '').trim();
      const short = body.length > 800 ? body.slice(0, 800) + '…' : body;
      return `${i + 1}. ${typeLabel(p)} ${cleanTitle(p)} 👑 VIP (ပွင့်ပြီ)\n${short}\n   🔗 ${postLink(p)}`;
    }
    const vip = isVip(p) ? ' 🔒 VIP' : '';
    if (isVip(p)) {
      // Locked VIP: NEVER show the download link — otherwise VIP is pointless.
      return `${i + 1}. ${typeLabel(p)} ${cleanTitle(p)} 🔒 VIP\n   🔑 Redeem Code ပို့ပြီး ဖွင့်ပါ`;
    }
    return `${i + 1}. ${typeLabel(p)} ${cleanTitle(p)}${vip}\n   🔗 ${postLink(p)}`;
  }
  function formatList(posts, header, unlocked) {
    const shown = posts.slice(0, 5);
    let out = `${header}\n\n${shown.map((p, i) => formatPost(p, i, unlocked)).join('\n\n')}`;
    if (posts.length > 5) out += `\n\n...နောက်ထပ် ${posts.length - 5} ခု Site မှာ ကြည့်ပါ 👇\n${siteText()}`;
    else out += `\n\n🌐 Site:\n${siteText()}`;
    return out;
  }
  function searchPosts(posts, q) {
    const needle = q.toLowerCase();
    return posts.filter(p =>
      (p.title || '').toLowerCase().includes(needle) ||
      (p.body || '').toLowerCase().includes(needle));
  }
  // Topic fallback: if the whole message matches nothing, but it mentions a
  // topic (e.g. "vpnနဲ့ပတ်သတ်တာမေးချင်တာ"), show that topic's posts
  // instead of the canned "no post found" reply.
  const TOPICS = ['vpn', 'app', 'file', 'video', 'ပုံ', 'data', 'ဒေတာ', 'mytel', 'atom', 'capcut', 'facebook', 'youtube', 'luma', 'tiktok', 'instagram', 'good', 'usque', '8vpn'];
  function topicSearch(posts, q) {
    const low = q.toLowerCase();
    const seen = new Set(); const out = [];
    for (const w of TOPICS) {
      if (!low.includes(w)) continue;
      for (const p of searchPosts(posts, w)) {
        const k = postKey(p);
        if (!seen.has(k)) { seen.add(k); out.push(p); }
      }
    }
    return out;
  }

  // ---------- Telegram send ----------
  function mainKeyboard() {
    return {
      keyboard: [
        [{ text: '🆕 နောက်ဆုံး' }, { text: '📱 Apps' }],
        [{ text: '📁 Files' }, { text: '🎬 Video' }],
        [{ text: '🖼️ ပုံများ' }, { text: '🔑 Redeem Code' }],
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

  // ---------- Auto-notify: new posts → all subscribers ----------
  // Called by api/notify.js (triggered every 10 min by a GitHub Actions
  // timer — Vercel Hobby cron only runs once a day, too slow for this).
  // KV key "notified" holds the post ids already announced. First run seeds
  // it with all current posts so old posts are never blasted out.
  // Key uses the stable post id (not the Sheet row — rows shift when a post
  // is deleted, so a new post could inherit an old row number).
  function notifyKey(p) { return String(p.id ?? p.row ?? p.title); }
  async function notifyNewPosts() {
    if (!kvUrl || !kvToken) return { ok: false, error: 'kv not configured' };
    const posts = await getPosts().catch(() => []);
    if (!posts.length) return { ok: true, fresh: 0, sent: 0, failed: 0 };
    const seenRaw = await kv('smembers', 'notified');
    const seen = new Set(Array.isArray(seenRaw) ? seenRaw.map(String) : []);
    const fresh = posts.filter((p) => !seen.has(notifyKey(p)));
    if (!fresh.length) return { ok: true, fresh: 0, sent: 0, failed: 0 };
    if (!seen.size) {
      // First run: seed only, don't notify about old posts.
      await kv('sadd', 'notified', ...posts.map(notifyKey));
      return { ok: true, fresh: 0, sent: 0, failed: 0, seeded: posts.length };
    }
    const subs = await listSubs();
    let sent = 0, failed = 0;
    for (const p of fresh) {
      // Locked VIP posts show 🔒 only, never the download link — same rule
      // as the bot's lists (empty unlocked set: nobody has redeemed a
      // brand-new post yet).
      const text = `🆕 Post အသစ်!\n\n${formatPost(p, 0, new Set()).replace(/^1\. /, '')}\n\n🌐 Site:\n${siteText()}`;
      for (const id of subs) {
        try {
          const r = await tgSend(id, text, false);
          if (r && (r.ok || r.dryRun)) sent++;
          else {
            failed++;
            const gone = r && (r.error_code === 403 ||
              (r.error_code === 400 && /chat not found/i.test(r.description || '')));
            if (gone) await removeSub(id);
          }
        } catch (e) { failed++; }
        await new Promise((r) => setTimeout(r, 40)); // stay under Telegram rate limits
      }
      await kv('sadd', 'notified', notifyKey(p));
    }
    return { ok: true, fresh: fresh.length, sent, failed };
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
          // Drop dead subscribers: blocked (403) or chat gone (400 chat not found,
          // e.g. a test id). Otherwise every broadcast keeps reporting a failure.
          const gone = r && (r.error_code === 403 ||
            (r.error_code === 400 && /chat not found/i.test(r.description || '')));
          if (gone) await removeSub(id);
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
    `🔑 VIP Redeem Code ပို့ရင် အဲဒီ VIP Post ပွင့်သွားတယ်။\n\n` +
    `🌐 “Website ဖွင့်မယ်” ခလုတ်နှိပ်ရင် Site ကို Telegram ထဲမှာပဲ ဖွင့်ပေးတယ်။\n\n` +
    `🌐 Website:\n${siteText()}`;

  function buttonToCommand(text) {
    switch (text) {
      case '🆕 နောက်ဆုံး': return 'LATEST';
      case '📱 Apps': return 'CAT:App Link';
      case '📁 Files': return 'CAT:File';
      case '🎬 Video': return 'CAT:Video';
      case '🖼️ ပုံများ': return 'CAT:ပုံ';
      case '🔑 Redeem Code': return 'REDEEM';
      default: return text;
    }
  }

  // ---------- Help answers: Redeem Code / VIP / Points ----------
  // Questions about these get a direct answer, no AI needed.
  function helpAnswer(t) {
    const low = t.toLowerCase();
    const isQ = t.includes(' ') || t.includes('?') || /ဘယ်|ဘာလဲ|ဘယ်လို|မေးချင်/.test(t);
    if (!isQ) return null;
    // Admin contact: refer to the owner's Telegram @PMH2001.
    if (/admin|owner|အုပ်ချုပ်သူ|ပိုင်ရှင်/.test(low) || /ဆက်သွယ်|contact/.test(low)) {
      return '👤 Admin ကို ဆက်သွယ်ချင်ရင် Telegram ကနေ ဆက်သွယ်လို့ရတယ် 👇\n\n📩 @PMH2001\nhttps://t.me/PMH2001';
    }
    if (low.includes('redeem')) {
      return '🔑 Redeem Code ဆိုတာ VIP Post ဖွင့်တဲ့ ကုဒ် ပါ။\n\nသုံးနည်း:\n1️⃣ Code ကို ဒီမှာ ပို့လိုက် (ဒါမှမဟုတ် အောက်က 🔑 Redeem Code ခလုတ် နှိပ်ပြီး ပို့)\n2️⃣ မှန်ရင် အဲဒီ VIP Post တန်းပွင့်သွားပြီး Download Link ရမယ် 🎉\n\nCode မှားရင် "Code မှားနေတယ်" လို့ ပြန်ပြောမယ်။ Code ကို VIP Post ပိုင်ရှင်ဆီက ရယူပါ။';
    }
    // "VIP post တွေ ပြပါ" (show me the VIP posts) is a list request, not a
    // how-to question — let it fall through to search/AI instead.
    if (low.includes('vip') && !/ပြ|စာရင်း|list/.test(low)) {
      return '👑 VIP Post ဖွင့်နည်း ၃ ခု:\n\n1️⃣ Site မှာ Point 100 ပြည့်ရင် 🔓 Unlock နှိပ်ပါ\n2️⃣ Redeem Code ရှိရင် ဒီမှာ Code ပို့ပြီး ဖွင့်ပါ\n3️⃣ နဂါးဥ (Egg) ကနေ VIP Pass ရရင် သုံးပြီး ဖွင့်ပါ\n\nPoint ရနည်း: နေ့စဉ် Check-in 1P, Spin Wheel, နဂါးဥ ကံစမ်းမဲ 🎡🥚';
    }
    if (low.includes('point') || low.includes('ပွိုင့်') || low.includes('ပိုင့်')) {
      return '💎 Point ရနည်း:\n\n✅ နေ့စဉ် Check-in — 1P (Site မှာ နေ့တိုင်း ဝင်ပါ)\n🎡 Spin Wheel — တစ်နေ့ 3 ကြိမ် လှည့်လို့ရတယ်\n🥚 နဂါးဥ — တစ်နေ့ 3 လုံး ရွေးလို့ရတယ်\n\nPoint 100 ပြည့်ရင် VIP Post တစ်ခု ဖွင့်လို့ရတယ် 👑';
    }
    return null;
  }

  // ---------- Small talk (instant, no AI needed) ----------
  // Short greetings / thanks / compliments get a warm instant reply.
  // Questions (with ? or question words) skip this and go to search/AI.
  // Messages with digits are skipped too (they might be redeem codes).
  function smallTalk(t) {
    const s = (t || '').trim();
    if (!s || s.length > 40) return null;
    if (s.includes('?') || /ဘယ်|ဘာလဲ|ဘယ်လို|မေးချင်|ဘယ်မှာ|ဘယ်နှစ်/.test(s)) return null;
    if (/[0-9]/.test(s) && !/\s/.test(s)) return null;
    const low = s.toLowerCase();
    if (/မင်္ဂလာပါ|^hi$|^hello$|ဟိုင်း/.test(low)) {
      return 'မင်္ဂလာပါ! 👋 MoeHtetTech Bot ပါ။\n\nVPN / App / File / Video တစ်ခုခု ရှာချင်ရင် စာရိုက်ပြီး မေးလို့ရတယ် 😊';
    }
    if (/ကျေးဇူး|thank/.test(low)) {
      return 'ရပါတယ် 😊 နောက်ထပ် တစ်ခုခု လိုရင် မေးလို့ရတယ်!';
    }
    if (/ချစ်တယ်|ချစ်စရာ|ကြိုက်တယ်|love you|i love/.test(low)) {
      return 'ကျွန်တော်လည်း ချစ်တယ် 😊❤️ MoeHtetTech ကို အားပေးတာ ဝမ်းသာပါတယ်။\n\nVPN / App / File တစ်ခုခု လိုရင် မေးလို့ရတယ် 👇';
    }
    if (/ကောင်းလိုက်တ|ကောင်းတယ်|မိုက်တယ်|လန်းတယ်|တော်တယ်|လှတယ်|great|awesome|nice/.test(low)) {
      return 'ကျေးဇူးတင်ပါတယ်! 😊 ကြိုက်တာ ဝမ်းသာပါတယ်။\n\nVPN / App / File တစ်ခုခု လိုရင် မေးလို့ရတယ် 👇';
    }
    // Short acknowledgement ("ရပါတယ်", "ဟုတ်ကဲ့", "ok") — whole message
    // is just an ok, so reply warmly instead of "I don't understand".
    if (s.length <= 12 && /^(ရပါ|ဟုတ်|အိုကေ|ok)/.test(low)) {
      return 'ဟုတ်ကဲ့ 😊 နောက်ထပ် တစ်ခုခု လိုရင် မေးလို့ရတယ်!';
    }
    if (/သွားတော့မယ်|^bye$|တာ့တာ/.test(low)) {
      return 'တာ့တာ! 👋 နောက်မှ ပြန်လာခဲ့ပါ 😊';
    }
    return null;
  }

  // ---------- AI auto-reply (Google Gemini) ----------
  async function aiReply(userText, posts) {
    if (!geminiKey) return null; // no key → caller uses the fallback
    const titles = posts.map(p => `- ${cleanTitle(p)} (${typeLabel(p)}${isVip(p) ? ', VIP' : ''})`).join('\n');
    const prompt =
      `You are MoeHtetTech's assistant on Telegram — a helpful AI that answers ANY question the user asks, ` +
      `just like asking an AI directly. Answer in the SAME language the user used ` +
      `(Burmese if they write Burmese, English if English). Keep it short, 2-5 sentences, friendly.\n` +
      `You also help with VPN apps, files, videos and tech tips from the MoeHtet Tech Sharing site.\n` +
      `Available posts right now:\n${titles}\n` +
      `Site: ${siteUrl} and ${MIRROR_SITE_URL}\n` +
      `Rules: if the user asks for a download or an app, point them to the matching post above and the site link. ` +
      `NEVER reveal, guess or invent VIP redeem codes. VIP posts need 100 points on the site or a redeem code. ` +
      `The site owner/admin's Telegram is @PMH2001 (https://t.me/PMH2001) — if the user asks how to contact the admin or owner, refer them to that Telegram link. ` +
      `Answer general questions directly and sensibly from your own knowledge — do not deflect to the site ` +
      `unless the question is about the site's posts. If you genuinely do not know, say so briefly.\n\n` +
      `User: ${userText}`;
    // One attempt, long timeout: the AI usually needs 30-45s to answer, so a
    // short timeout aborts calls that would have succeeded. (Vercel Hobby
    // functions stop at ~60s, so 45s + the ~2s feed fetch still fits.)
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
          }),
          signal: ctrl.signal,
        });
      clearTimeout(timer);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if ((text || '').trim()) return text.trim();
      console.error('[ai] empty reply, status:', res.status, JSON.stringify(data).slice(0, 200));
    } catch (e) {
      console.error('[ai] error:', e.message);
    }
    return null;
  }

  // ---------- Message handling ----------
  async function handleText(chatId, rawText) {
    const t = buttonToCommand((rawText || '').trim());
    if (t === '/start') return tgSend(chatId, WELCOME);
    if (t === '/myid') return tgSend(chatId, `မင်းရဲ့ Telegram ID: ${chatId}`);
    if (t === 'REDEEM') {
      return tgSend(chatId,
        `🔑 VIP Redeem Code ပို့ပါ 👇\n\n` +
        `Code ကို ဒီမှာ ရိုက်ထည့်လိုက်ပါ — အဲဒီ VIP Post ပွင့်သွားမယ်.`);
    }
    if (t === '/help') {
      let help = `MoeHtetTech Bot — အသုံးပြုနည်း 🤖\n\n` +
        `• ခလုတ်နှိပ်ပြီး Post တွေ ကြည့်ပါ (နောက်ဆုံး / Apps / Files / Video / ပုံများ)\n` +
        `• စာသား ရိုက်ပြီး ရှာပါ — ဥပမာ: VPN, MYTEL\n` +
        `• 🔑 VIP Redeem Code ပို့ရင် အဲဒီ VIP Post ပွင့်သွားတယ်\n` +
        `• 🌐 “Website ဖွင့်မယ်” — Site ကို Telegram ထဲမှာ ဖွင့်တယ်\n` +
        `• ဘာမေးမေး AI က ဖြေပေးတယ် — VPN/App အပြင် တခြားအကြောင်းလဲ မေးလို့ရတယ်\n\n` +
        `🌐 Website:\n${siteText()}`;
      if (isAdmin(chatId)) {
        help += `\n\n👑 Admin Commands:\n/broadcast <စာသား> — အားလုံးကို စာပို့မယ်\nပုံ + caption "/broadcast <စာသား>" — အားလုံးကို ပုံပို့မယ်`;
      }
      return tgSend(chatId, help);
    }
    if (t === '/broadcast' || t.startsWith('/broadcast ')) {
      const body = t.slice('/broadcast'.length).trim();
      return handleBroadcast(chatId, body, (id) => tgSend(id, body, false));
    }

    // Short friendly chat gets an instant reply, no AI needed.
    const st = smallTalk(t);
    if (st) return tgSend(chatId, st);

    // Redeem Code / VIP / Points questions get a direct answer.
    const ha = helpAnswer(t);
    if (ha) return tgSend(chatId, ha);

    const posts = await getPosts().catch(() => []);
    if (!posts.length) {
      return tgSend(chatId, 'ခဏလေး Post တွေ ဆွဲမရသေးဘူး, နောက်တစ်ခါ ထပ်ကြိုးစားကြည့်ပါ 🙏');
    }

    // Redeem code: bare code, or "/redeem CODE". Exact match only (case-insensitive).
    if (t.startsWith('/redeem')) {
      const code = t.slice('/redeem'.length).trim();
      if (!code) {
        return tgSend(chatId, 'သုံးနည်း:\n/redeem <Code>\n\nဥပမာ: /redeem ABCD1234');
      }
      const match = posts.find(p => (codeOf(p) || '').toUpperCase() === code.toUpperCase());
      if (match) return handleRedeem(chatId, match);
      return tgSend(chatId, 'Code မှားနေတယ် 😅\n\nCode ကို သေချာစစ်ပြီး ထပ်ပို့ကြည့်ပါ.');
    }
    if (!/\s/.test(t) && t.length >= 4) {
      const match = posts.find(p => (codeOf(p) || '').toUpperCase() === t.toUpperCase());
      if (match) return handleRedeem(chatId, match);
    }

    const unlocked = await getUnlocked(chatId).catch(() => new Set());

    if (t === 'LATEST') {
      return tgSend(chatId, formatList(posts, '🆕 နောက်ဆုံး Post များ', unlocked));
    }
    if (t.startsWith('CAT:')) {
      const cat = t.slice(4);
      const list = posts.filter(p => p.type === cat);
      if (!list.length) {
        return tgSend(chatId, `“${cat}” အမျိုးအစား Post မရှိသေးဘူး 😅\n\nနောက်ဆုံး Post တွေကြည့်မလား?`);
      }
      return tgSend(chatId, formatList(list, `${typeLabel({ type: cat })} Post များ`, unlocked));
    }

    // Free text: search posts first, topic posts second, AI third.
    const found = searchPosts(posts, t);
    if (found.length) {
      return tgSend(chatId, formatList(found, `“${t}” အတွက် ${found.length} ခု တွေ့တယ် 🔍`, unlocked));
    }
    const topics = topicSearch(posts, t);
    if (topics.length) {
      return tgSend(chatId, formatList(topics, `ဒါနဲ့ ပတ်သတ်တဲ့ Post တွေ 🔍`, unlocked));
    }

    const ai = await aiReply(t, posts).catch((e) => {
      console.error('[ai] error:', e.message);
      return null;
    });
    if (ai) return tgSend(chatId, ai);

    // Polite fallback: never say "no matching post" — that reads as rude.
    // Ask them to rephrase and point them to the topics/buttons instead.
    return tgSend(chatId,
      `ဟုတ်ကဲ့ 😊\n\n` +
      `မေးခွန်းကို သေချာ နားမလည်လိုက်လို့, နည်းနည်း ရှင်းရှင်းလေး ထပ်မေးပေးပါလား? VPN / App / File / Video အကြောင်း မြန်မာလို မေးလို့ရတယ် 👇\n${siteText()}`);
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
    notifyNewPosts,
    isDryRun: !token,
    hasAi: !!geminiKey,
    hasKv: !!(kvUrl && kvToken),
    hasAdmin: !!adminId,
  };
}

module.exports = { createBot, BOT_NAME };
