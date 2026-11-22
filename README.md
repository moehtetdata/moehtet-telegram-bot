# MoeHtetTech — Telegram Bot

Site Post တွေ မျှဝေပေးပြီး, စာမေးရင် AI က အလိုအလျောက် ပြန်ပေးတဲ့ Telegram Bot။ **အခမဲ့** ဖွင့်လို့ရတယ်။

## Bot က ဘာလုပ်ပေးလဲ

- `/start` နှိပ်တာနဲ့ Welcome + ခလုတ်တွေ ပြပေးတယ် — 🆕 နောက်ဆုံး, 📱 Apps, 📁 Files, 🎬 Video, 🖼️ ပုံများ
- **🌐 Website ဖွင့်မယ်** ခလုတ်နှိပ်ရင် Site (paingmoehtet.from-mm.dev) ကို **Telegram ထဲမှာပဲ** ဖွင့်ပေးတယ် (Telegram Mini App / Web App — Browser အပြင် ထွက်စရာ မလိုဘူး)
- ခလုတ်နှိပ်ရင် အဲဒီ အမျိုးအစား Post တွေ ပြပေးတယ် (Site က Feed အတိုင်း, 5 မိနစ် တစ်ခါ Update)
- စာသား ရိုက်ပြီး ရှာလို့ရတယ် — ဥပမာ `VPN`, `MYTEL` — ကိုက်တဲ့ Post တွေ ပြပေးတယ်
- ကိုက်တဲ့ Post မရှိရင် **AI (Google Gemini)** က ဖြေပေးတယ် — မြန်မာလို မေးရင် မြန်မာလို ပြန်ဖြေတယ်
- VIP Post တွေကို 🔒 VIP လို့ ပြပေးတယ် — **Redeem Code တွေကို Bot က ဘယ်တော့မှ မပြဘူး** (Site နဲ့ အတူတူ)

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
- အလွယ်ဆုံး: **Render** Free — GitHub Repo ထဲ Code တင်ပြီး Render မှာ Web Service အဖြစ် Deploy
- Env Vars: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY` (PORT ကို Render က သူ့ဘာသာ ပေးတယ်)
- မှတ်ချက်: Render Free က 15 မိနစ် မသုံးရင် အိပ်သွားတယ်, Message ရောက်ရင် ပြန်နိုးတယ် (ခန ကြာတတ်တယ်)

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

## Files

- `server.js` — Bot Server (Node 18+, ဘာမှ Install စရာ မလိုဘူး)
- `set-webhook.js` — Webhook ချိတ်တဲ့ Script
- `package.json`, `.env.example`
