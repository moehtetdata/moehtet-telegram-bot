# MoeHtetTech — Telegram Bot

Site Post တွေ မျှဝေပေးပြီး, စာမေးရင် AI က အလိုအလျောက် ပြန်ပေးတဲ့ Telegram Bot။ **အခမဲ့** ဖွင့်လို့ရတယ်။

## Bot က ဘာလုပ်ပေးလဲ

- `/start` နှိပ်တာနဲ့ Welcome + ခလုတ်တွေ ပြပေးတယ် — 🆕 နောက်ဆုံး, 📱 Apps, 📁 Files, 🎬 Video, 🖼️ ပုံများ
- **🌐 Website ဖွင့်မယ်** ခလုတ်နှိပ်ရင် Site (paingmoehtet.from-mm.dev) ကို **Telegram ထဲမှာပဲ** ဖွင့်ပေးတယ် (Telegram Mini App / Web App — Browser အပြင် ထွက်စရာ မလိုဘူး)
- ခလုတ်နှိပ်ရင် အဲဒီ အမျိုးအစား Post တွေ ပြပေးတယ် (Site က Feed အတိုင်း, 5 မိနစ် တစ်ခါ Update)
- စာသား ရိုက်ပြီး ရှာလို့ရတယ် — ဥပမာ `VPN`, `MYTEL` — ကိုက်တဲ့ Post တွေ ပြပေးတယ်
- ကိုက်တဲ့ Post မရှိရင် **AI (Google Gemini)** က ဖြေပေးတယ် — မြန်မာလို မေးရင် မြန်မာလို ပြန်ဖြေတယ်
- VIP Post တွေကို 🔒 VIP လို့ ပြပေးတယ် — **Redeem Code တွေကို Bot က ဘယ်တော့မှ မပြဘူး** (Site နဲ့ အတူတူ)
- **📢 Broadcast (Admin ပဲ)** — `/broadcast <စာသား>` ပို့ရင် `/start` လုပ်ထားသူအားလုံးဆီ စာပို့ပေးတယ်။ ပုံနဲ့ပို့ချင်ရင် ပုံကို caption `/broadcast <စာသား>` နဲ့ ပို့ပါ။ Subscriber စာရင်းကို Vercel KV (Free) မှာ သိမ်းတယ် — Bot ပိုင်ရှင်ရဲ့ Telegram ID ကို `ADMIN_CHAT_ID` မှာ ထည့်ရမယ် (Bot ကို `/myid` ပို့ပြီး ID ရယူပါ)

## လိုအပ်တာ (3 ခု)

### 1. Telegram Bot ဖွင့်ရမယ် — Free, 2 မိနစ်
- Telegram မှာ **@BotFather** ကို ဖွင့် → `/newbot`
- Bot နာမည်: **MoeHtetTech**
- Username: **MoeHtetTechBot** (နောက်ဆုံးမှာ `bot` ပါရမယ်)
- ဖွင့်ပြီးရင် **Token** ရမယ် — အဲဒါကို `TELEGRAM_BOT_TOKEN` မှာ ထည့်ရမယ်
- ⚠️ Token ကို ဘယ်သူ့ကိုမှ မပြပါနဲ့, Chat မှာလည်း မပို့ပါနဲ့

### 2. AI Key (Free) — Google AI Studio
- https://aistudio.google.com/ ကို Gmail နဲ့ ဝင် → **Get API Key** → Key အသစ် ယူ
- Free Tier ရှိတယ် (တစ်နေ့ အရေအတွက် ကန့်သတ်ချက် ရှိတယ်) — `GEMINI_API_KEY` မှာ ထည့်ရမယ်
- Key မထည့်ထားရင် Bot က Post ရှာပေးတာပဲ လုပ်မယ်, AI ဖြေတာ မလုပ်ဘူး

### 3. Server (24/7 ဖွင့်ထားရမယ်)
- ဒီ Code ကို Server တစ်ခုမှာ Run ရမယ် (HTTPS URL လိုတယ်)
- အလွယ်ဆုံး: **Vercel** Free (Hobby) — GitHub Repo ကို Vercel မှာ Import လုပ်ပြီး Deploy (Card မတောင်းဘူး). Webhook URL: `https://<your-app>.vercel.app/webhook` (Vercel က `server.js` ကို Root Server အဖြစ် Run လို့ `/webhook` ကို သုံးရမယ် — `/api/webhook` မဟုတ်ဘူး)
- Vercel အပြင် `server.js` ကို သာမန် Node Server အဖြစ်လည်း Run လို့ရတယ် (Render/Koyeb စတဲ့ Host တွေမှာ)
- Env Vars: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY` (Vercel မှာ Dashboard → Settings → Environment Variables မှာ ထည့်ပါ). Broadcast အတွက်: Vercel Dashboard → Storage → KV Store တစ်ခု ဖွင့်ပြီး Project နဲ့ ချိတ်ပါ (`KV_REST_API_URL` + `KV_REST_API_TOKEN` အလိုအလျောက် ရမယ်), ပြီးရင် `ADMIN_CHAT_ID` မှာ Bot ပိုင်ရှင်ရဲ့ Telegram ID ထည့်ပါ.

## Webhook ချိတ်နည်း

Server Run ပြီးရင်:
```bash
TELEGRAM_BOT_TOKEN=xxx WEBHOOK_URL=https://your-server/webhook node set-webhook.js
```
အောင်မြင်ရင် `{"ok":true}` ပြန်လာမယ်။ ပြီးရင် Telegram မှာ Bot ကို `/start` လုပ်ပြီး စမ်းပါ။

## စမ်းနည်း (Local, Token မလိုဘူး)

```bash
node server.js
# DRY-RUN mode: Bot က Telegram ကို တကယ် မပို့ဘူး, ပို့မယ့် စာကို Log မှာပဲ ပြတယ်
curl -X POST localhost:3000/webhook -H 'Content-Type: application/json' \
  -d '{"update_id":1,"message":{"chat":{"id":123},"text":"VPN"}}'
```

Vercel Function ကို Local မှာ စမ်းချင်ရင် `node /tmp/test-vercel.js` (Mock req/res နဲ့ Handler ကို တိုက်ရိုက် ခေါ်တယ်)။

## Files

- `lib/bot.js` — Bot Logic အကုန် (Post ရှာ, AI ဖြေ, Keyboard) — server.js နဲ့ api/webhook.js နှစ်ခု သုံးတယ်
- `server.js` — သာမန် Node Server (Render/Koyeb/Local အတွက်)
- `api/webhook.js` — Vercel Serverless Function
- `set-webhook.js` — Webhook ချိတ်တဲ့ Script
- `package.json`, `.env.example`
