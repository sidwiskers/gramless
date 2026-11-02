# Telegram Bot on Cloudflare Workers

A zero-dependency Telegram Bot running on Cloudflare Workers edge isolates using **Gramless**.

## Features

- **Zero Runtime Dependencies:** Direct execution without heavy node_modules.
- **Fast Cold Start:** <1 ms isolate startup.
- **Timing-Safe Secret Token Verification:** Automatically checks `X-Telegram-Bot-Api-Secret-Token`.
- **Zero-Roundtrip Webhook Replies:** Accelerated dispatch when possible.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure your bot token secret in Wrangler:
   ```bash
   npx wrangler secret put BOT_TOKEN
   npx wrangler secret put TELEGRAM_SECRET_TOKEN
   ```
3. Deploy to Cloudflare:
   ```bash
   npm run deploy
   ```
4. Register your webhook with Telegram:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://telegram-bot-worker.<your-subdomain>.workers.dev", "secret_token": "<YOUR_SECRET_TOKEN>"}'
   ```
