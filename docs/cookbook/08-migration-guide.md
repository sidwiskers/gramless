# Recipe 08: Migration Guide (grammY & Telegraf to Gramless)

This guide provides a comprehensive, side-by-side technical translation for developers migrating existing bots from **grammY** or **Telegraf** to **Gramless** on **Telegram Serverless (TGCloud)**.

---

## 1. Core Mental Model Shift

Traditional Node.js frameworks were designed for long-running servers. TGCloud runs discrete V8 isolates on Telegram's edge:

| Feature / Architecture | grammY / Telegraf | Gramless (TGCloud) |
| :--- | :--- | :--- |
| **Execution Model** | Persistent Node.js process | Ephemeral V8 isolates |
| **Bot Token Handling** | Hardcoded or read via `process.env.BOT_TOKEN` | Managed securely by Telegram Cloud (no tokens in code) |
| **Ingress Pipeline** | `bot.start()` (long polling) or Express webhook | `export default bot.handler()` |
| **Runtime Dependencies** | 15–40 packages in `node_modules` | **Zero (0) dependencies** |
| **Database & Sessions** | External Redis / MongoDB / Postgres | Built-in SQLite (`sdk/db`) with **ACID rollback** |
| **Mini App Backend** | External Express / FastAPI backend | Built-in serverless RPC (`createEndpoint`) |

---

## 2. Side-by-Side Syntax Translation

### Initialization & Entry Point

#### In grammY / Telegraf:
```javascript
// Old: Requires token and long-polling loop
import { Bot } from 'grammy'; // or { Telegraf } from 'telegraf';

const bot = new Bot(process.env.BOT_TOKEN);

bot.command('start', (ctx) => ctx.reply('Hello!'));

bot.start(); // Blocks process
```

#### In Gramless (TGCloud):
```javascript
// New: Zero tokens, instant export
import { createBot } from 'gramless';

export const bot = createBot();

bot.command('start', async (ctx) => {
  await ctx.reply('Hello!');
});

// Single-line handler export for TGCloud:
export default bot.handler();
```

---

### Keyboards & Inline Markups

#### In grammY / Telegraf:
```javascript
// grammY: Requires importing extra keyboard class
import { InlineKeyboard } from 'grammy';

const keyboard = new InlineKeyboard()
  .text('Click me', 'btn_click')
  .row()
  .url('Website', 'https://example.com');

await ctx.reply('Menu:', { reply_markup: keyboard });
```

#### In Gramless:
```javascript
// Gramless: Intuitive array shorthand with zero extra imports
await ctx.reply('Menu:', {
  buttons: [
    [{ text: 'Click me', data: 'btn_click' }],
    [{ text: 'Website', url: 'https://example.com' }],
  ],
});
```

---

### Sessions & State Management

#### In grammY / Telegraf:
```javascript
// Old: External Redis adapter with race condition risks
import { session } from 'grammy';
import { RedisAdapter } from '@grammyjs/storage-redis';

bot.use(session({
  storage: new RedisAdapter({ instance: redisClient }),
}));

bot.command('transfer', async (ctx) => {
  ctx.session.balance -= 50;
  await callExternalPayment(); // If this fails, session is already corrupted!
});
```

#### In Gramless:
```javascript
// New: ACID SQLite with automatic rollback
import { session, TgCloudSessionStore } from 'gramless';
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { sessions } from '../schema.js';

bot.use(session({
  store: new TgCloudSessionStore({ db, table: sessions, eq }),
  initial: () => ({ balance: 100 }),
}));

bot.command('transfer', async (ctx) => {
  ctx.session.balance -= 50;
  await callExternalPayment(); // Invariant: If this throws, ctx.session rolls back automatically!
});
```

---

### Composable Filters

#### In grammY:
```javascript
// Old: grammY filter queries
bot.on('message:photo', async (ctx) => { ... });
bot.filter((ctx) => ctx.chat?.type === 'group', async (ctx) => { ... });
```

#### In Gramless:
```javascript
// New: Functional filter combinators
import { Filter } from 'gramless';

// Matches photos inside groups:
bot.on(Filter.all(Filter.group, Filter.hasPhoto), async (ctx) => {
  await ctx.reply('Photo received.');
});
```

---

## 3. Common Migration Pitfalls (Gotchas)

1. **Do Not Call `bot.start()` or `bot.launch()`:** In TGCloud, the platform handles HTTP routing and event dispatch. Trying to start a long-polling loop will throw an error or time out. Simply export `bot.handler()`.
2. **Always Use `.js` in Relative Imports:** TGCloud V8 isolates enforce standard ECMAScript module resolution. `import { bot } from './lib/bot'` will fail; use `import { bot } from './lib/bot.js'`.
3. **Database Calls Are Asynchronous:** In `sdk/db`, all query builder calls must be awaited (`await db.select()...run()`). Missing `await` leaves the promise unresolved.
4. **Remove Bot Tokens from Configs:** TGCloud isolates communicate with the Bot API proxy automatically via virtual import `api` from `'sdk'`. Never commit or hardcode bot tokens into serverless repositories.
