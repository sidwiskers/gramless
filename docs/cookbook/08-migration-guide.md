# Recipe 08: Migration Guide (grammY & Telegraf to Gramless)

This guide provides a comprehensive, side-by-side technical translation for developers migrating existing bots from **grammY** or **Telegraf** to **Gramless** on **Telegram Serverless (TGCloud)**.

---

## 1. Core Mental Model Shift

Traditional Node.js frameworks were designed for long-running servers. TGCloud runs discrete V8 isolates on Telegram's edge:

| Feature / Architecture | grammY / Telegraf | Gramless (TGCloud) |
| :--- | :--- | :--- |
| **Execution Model** | Persistent Node.js process | Ephemeral V8 isolates |
| **Bot Token Handling** | Read via `process.env.BOT_TOKEN` | Managed by Telegram Cloud proxy (no tokens in code) |
| **Ingress Pipeline** | `bot.start()` (long polling) or Express webhook | `export default bot.handler()` |
| **Runtime Dependencies** | External packages | **Zero external dependencies** |
| **Database & Sessions** | External Redis / MongoDB / Postgres | Built-in SQLite (`sdk/db`) with transactional rollback |
| **Mini App Backend** | External Express / FastAPI backend | Built-in serverless RPC (`createEndpoint`) |

---

## 2. Side-by-Side Syntax Translation

### Initialization & Entry Point

#### In grammY / Telegraf:
```javascript
// Requires token and long-polling loop or webhook server
import { Bot } from 'grammy'; // or { Telegraf } from 'telegraf';

const bot = new Bot(process.env.BOT_TOKEN);

bot.command('start', (ctx) => ctx.reply('Hello!'));

bot.start(); // Blocks process
```

#### In Gramless (TGCloud):
```javascript
// Zero tokens required in TGCloud, instant export
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
// Requires importing keyboard builder class
import { InlineKeyboard } from 'grammy';

const keyboard = new InlineKeyboard()
  .text('Click me', 'btn_click')
  .row()
  .url('Website', 'https://example.com');

await ctx.reply('Menu:', { reply_markup: keyboard });
```

#### In Gramless:
```javascript
// Array shorthand without extra imports
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
// External Redis adapter
import { session } from 'grammy';
import { RedisAdapter } from '@grammyjs/storage-redis';

bot.use(session({
  storage: new RedisAdapter({ instance: redisClient }),
}));

bot.command('transfer', async (ctx) => {
  ctx.session.balance -= 50;
  await callExternalPayment(); // If this fails, state is already updated
});
```

#### In Gramless:
```javascript
// SQLite session store with transactional staging
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
  await callExternalPayment(); // If this throws, ctx.session rolls back automatically
});
```

---

### Composable Filters

#### In grammY:
```javascript
// grammY filter queries
bot.on('message:photo', async (ctx) => { ... });
bot.filter((ctx) => ctx.chat?.type === 'group', async (ctx) => { ... });
```

#### In Gramless:
```javascript
// Functional filter combinators
import { Filter } from 'gramless';

// Matches photos inside groups:
bot.on(Filter.all(Filter.group, Filter.hasPhoto), async (ctx) => {
  await ctx.reply('Photo received.');
});
```

---

## 3. Common Migration Considerations

1. **Deploying on TGCloud vs Traditional Servers:** In TGCloud, export `bot.handler()`. When running on traditional servers (VPS or container), use `bot.start()` for polling or `bot.webhookCallback()` for HTTP servers.
2. **ES Module Imports:** TGCloud V8 isolates enforce standard ECMAScript module resolution. Relative imports must include file extensions (`import { bot } from './lib/bot.js'`).
3. **Asynchronous Database Calls:** In `sdk/db`, all query builder operations are asynchronous and return Promises. Always prefix queries with `await`.
4. **Token Management on TGCloud:** In TGCloud environments, the API client communicates automatically via the runtime proxy (`import { api } from 'sdk'`). Bot tokens do not need to be passed in application code.
