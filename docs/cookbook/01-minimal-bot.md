# Recipe 01: Minimal Bot

A minimal, production-ready bot demonstrating the recommended TGCloud directory architecture and single-line handler exports with **Gramless**.

---

## Architecture & Mental Model

In Telegram Serverless (TGCloud), incoming updates are dispatched to individual files in `tgcloud/handlers/` depending on the update type:
- `tgcloud/handlers/message.js` receives `message` updates.
- `tgcloud/handlers/callback_query.js` receives inline button clicks.

Instead of writing separate, uncoordinated routing logic in each handler file, the idiomatic Gramless architecture is:
1. Define all commands, actions, and middlewares once on a shared bot instance in `tgcloud/lib/bot.js`.
2. Re-export `bot.handler()` from each handler file.

```text
01-minimal-bot/
├── tgcloud/
│   ├── handlers/
│   │   ├── message.js          # export default bot.handler();
│   │   └── callback_query.js   # export default bot.handler();
│   └── lib/
│       └── bot.js              # Centralized route definitions
├── package.json
└── tgcloud.jsonc
```

When TGCloud routes an update into `message.js` or `callback_query.js`, `bot.handler()` automatically extracts the payload, matches the registered route in constant time ($O(1)$), and runs the callback.

---

## Code Walkthrough

### 1. Route Definitions (`tgcloud/lib/bot.js`)

```javascript
import { createBot } from 'gramless';

export const bot = createBot();

bot.command('start', async (ctx) => {
  await ctx.chatAction('typing');

  await ctx.reply(`Welcome <b>${ctx.from?.first_name || 'User'}</b>!`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: 'Ping isolate', data: 'action:ping' }],
      [{ text: 'Official documentation', url: 'https://github.com/sidwiskers/gramless' }],
    ],
  });
});

bot.action('action:ping', async (ctx) => {
  await ctx.answer({ text: 'Pong received' });
  await ctx.edit(`<b>Pong</b>\n\nButton callback executed at <code>${new Date().toISOString()}</code>`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: 'Refresh', data: 'action:ping' }],
    ],
  });
});
```

### 2. Handler Re-exports (`tgcloud/handlers/message.js`)

```javascript
import { bot } from '../lib/bot.js';

export default bot.handler();
```

---

## Deployment to TGCloud

Ensure you have `@tgcloud/cli` installed and authenticated:

```bash
# Verify local diff against cloud
tgcloud diff

# Push code and activate bot
tgcloud push
```

---

## Rules That Bite

- **Relative Imports Must Include Extensions:** In TGCloud V8 isolates, `import { bot } from '../lib/bot'` fails. You must specify the `.js` extension: `import { bot } from '../lib/bot.js'`.
- **Answering Callbacks:** Always call `await ctx.answer()` inside `bot.action()` handlers to dismiss the loading spinner on Telegram clients.
