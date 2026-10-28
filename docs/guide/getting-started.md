# Quickstart Guide

Get up and running with **Gramless** on Telegram Serverless in under 2 minutes.

---

## 1. Installation

Install Gramless using your preferred package manager:

::: code-group
```bash [npm]
npm install gramless
```
```bash [pnpm]
pnpm add gramless
```
```bash [yarn]
yarn add gramless
```
:::

---

## 2. Project Directory Structure

TGCloud projects use a clean convention where backend code lives inside `tgcloud/`:

```text
my-tgcloud-bot/
├── tgcloud/
│   ├── handlers/
│   │   ├── message.js          # Receives text, commands, and media
│   │   └── callback_query.js   # Receives inline keyboard button clicks
│   └── lib/
│       └── bot.js              # Central bot routing definition
├── package.json
└── tgcloud.jsonc
```

---

## 3. Creating the Bot (`tgcloud/lib/bot.js`)

Define your commands and interactive button handlers:

```javascript
import { createBot } from 'gramless';

export const bot = createBot();

bot.command('start', async (ctx) => {
  await ctx.chatAction('typing');

  await ctx.reply(`👋 Welcome <b>${ctx.from?.first_name || 'User'}</b>!`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: 'Ping Isolate 🏓', data: 'action:ping' }],
    ],
  });
});

bot.action('action:ping', async (ctx) => {
  await ctx.answer({ text: 'Pong received!' });
  await ctx.edit('🏓 <b>Pong!</b> Isolate responsive.', {
    parse_mode: 'HTML',
  });
});
```

---

## 4. Re-exporting Handlers (`tgcloud/handlers/message.js`)

In TGCloud, update handlers are discrete entry files. Re-export `bot.handler()` from each handler file:

```javascript
import { bot } from '../lib/bot.js';

export default bot.handler();
```

Do the same for `tgcloud/handlers/callback_query.js`:

```javascript
import { bot } from '../lib/bot.js';

export default bot.handler();
```

---

## 5. Deploying to TGCloud

Authenticate and deploy with the official `@tgcloud/cli`:

```bash
# Preview changes
tgcloud diff

# Deploy to global edge isolates
tgcloud push
```
