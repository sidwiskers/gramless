# Gramless

[![Tests](https://img.shields.io/badge/tests-24%20passed-brightgreen.svg)](tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)
[![TGCloud Runtime](https://img.shields.io/badge/runtime-Telegram%20Serverless%20(V8)-orange.svg)](https://tgcloud.ai)

**Gramless** is an ultra-fast, zero-dependency, transactional Telegram framework engineered from first principles for **Telegram Serverless (TGCloud)** and isolated V8 runtimes.

Inspired by the engineering discipline and zero-allocation philosophy of [Hermes](https://github.com/sidwiskers/hermes), Gramless replaces raw isolate `if/else` boilerplate with constant-time routing, transactional SQLite state with automatic rollback, type-safe Mini App RPC endpoints, and hermetic offline testing via **Gramless Lab**.

```javascript
import { createBot } from 'gramless';

export const bot = createBot();

bot.command('start', async (ctx) => {
  await ctx.reply(`👋 Welcome <b>${ctx.from.first_name}</b>!`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: 'Open App 🚀', webApp: 'https://app.tgcloud.ai/' }],
      [{ text: 'Settings ⚙️', data: 'settings:view' }],
    ],
  });
});

bot.action('settings:view', async (ctx) => {
  await ctx.answer();
  await ctx.edit('⚙️ <b>Settings Menu</b>\nSelect your preferences below:', {
    parse_mode: 'HTML',
  });
});

// Single-line handler export for Telegram Serverless:
export default bot.handler();
```

---

## Why Gramless?

Telegram Serverless runs code inside lightweight, global V8 isolates. In this environment:
* Standard node bot frameworks (**grammY, Telegraf, Teloxide**) are unusable: they expect long-polling loops, external webhooks, bot tokens, and heavy npm dependency trees.
* Writing vanilla TGCloud handlers forces developers into brittle, unmaintainable string-matching spaghetti without session safety or testing tools.

Gramless bridges this gap with zero compromises:

| Metric / Capability | Vanilla TGCloud | Traditional Frameworks | Gramless |
| :--- | :---: | :---: | :---: |
| **Runtime Overhead** | Low (raw JS) | High (heavy bundle) | **Zero (pure ESM, 0 dependencies)** |
| **Command Lookup (1,000 routes)** | $O(N)$ manual checks | $O(N)$ regex scanning | **$O(1)$ Hash Map (3.75 µs)** |
| **Callback Dispatch** | Manual `.split(':')` | Regex matching | **Length-partitioned prefix trie (2.91 µs)** |
| **Session Safety** | Manual SQL queries | Racy in-memory/Redis | **ACID SQLite with automatic rollback** |
| **Offline Testability** | None (push to cloud) | Requires test token | **Gramless Lab (100% in-process)** |
| **Mini App RPC** | Raw POST handlers | External server | **Native type-safe `createEndpoint`** |

---

## Performance & Scale Benchmarks

Recorded on an ARM64 Linux host across 10,000 warm iterations (`npm run bench`):

```text
--- Gramless Performance & Scale Benchmark ---
[Results across 10,000 iterations]
• Exact Command Dispatch (1,000 routes):  3.75 µs / op
• Exact Action Dispatch  (500 routes):    2.91 µs / op
----------------------------------------------
```

Routing is compiled into immutable lookup tables upon registration. Dispatching across 1,000 commands incurs zero array allocations on the hot path.

---

## Core Systems & Architecture

```text
gramless/
├── src/
│   ├── index.js          # Root facade & bot constructor
│   ├── router.js         # Constant-time route compiler & update dispatcher
│   ├── context.js        # Ergonomic Context facade with day-zero escape hatches
│   ├── errors.js         # Typed error system with token & credential sanitization
│   ├── session.js        # Transactional SQLite session engine with rollback
│   ├── fsm.js            # Finite State Machine / conversation scenes
│   ├── endpoint.js       # Mini App RPC bridge with zero-dependency schema validation
│   └── testkit/          # Gramless Lab: deterministic offline test harness
```

---

## 1. Transactional SQLite Sessions with Rollback

Gramless introduces **transactional session semantics**. Changes made to `ctx.session` are held in an in-memory transaction and committed to Telegram's built-in SQLite (`sdk/db`) **only if the handler succeeds**.

If a handler throws an unhandled error, panics, or the Telegram Bot API rejects a message, **the mutation is immediately discarded and rolled back**:

```javascript
import { createBot, session, TgCloudSessionStore } from 'gramless';
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { sessions } from '../schema.js';

const bot = createBot();

bot.use(session({
  store: new TgCloudSessionStore({ db, table: sessions, eq }),
  initial: () => ({ balance: 100 }),
}));

bot.command('transfer', async (ctx) => {
  // 1. Mutate state
  ctx.session.balance -= 50;

  // 2. Outbound network operation throws an error
  await ctx.call('sendInvoice', { ...invalidParams });

  // Invariant: The handler threw before returning!
  // Gramless rolls back ctx.session.balance to 100.
  // The database is never corrupted with partial state.
});
```

---

## 2. Multi-Step Conversation Wizards (FSM)

Build complex linear or branching dialogues with validation guards and automatic `/cancel` handling:

```javascript
import { createBot, createFSM } from 'gramless';

const bot = createBot();
const onboarding = createFSM();

// Step 1: Prompt for username
onboarding.step('ask_username', async (ctx) => {
  const username = ctx.text.trim();
  ctx.fsm.data.username = username;
  await ctx.reply(`Welcome @${username}! Now please enter your age:`);
  ctx.fsm.goto('ask_age');
});

// Step 2: Validate age with a guard predicate
onboarding.step(
  'ask_age',
  async (ctx) => {
    ctx.fsm.data.age = parseInt(ctx.text.trim(), 10);
    await ctx.reply(`Profile saved! Username: ${ctx.fsm.data.username}, Age: ${ctx.fsm.data.age}`);
    ctx.fsm.complete(); // Cleans up FSM state
  },
  async (ctx) => {
    const age = parseInt(ctx.text.trim(), 10);
    if (isNaN(age) || age < 18) {
      await ctx.reply('⚠️ You must be at least 18 years old. Please re-enter your age:');
      return false; // Guard rejected; user stays on current step
    }
    return true;
  }
);

bot.use(onboarding.middleware());

bot.command('register', async (ctx) => {
  await ctx.reply('Starting registration. What is your username?');
  ctx.fsm.goto('ask_username');
});
```

---

## 3. Mini App RPC Endpoints

Host serverless RPC functions in `tgcloud/endpoints/*.js` called directly from your Mini App via `Telegram.WebApp.Serverless.call`. Gramless verifies caller identity (`ctx.initData`) and validates payloads without external dependencies:

```javascript
// tgcloud/endpoints/submitOrder.js
import { createEndpoint, v } from 'gramless/endpoint';

export default createEndpoint({
  requireAuth: true, // Rejects unauthenticated callers
  schema: v.object({
    productId: v.string({ minLength: 3 }),
    quantity: v.number({ min: 1, max: 99 }),
    coupon: v.optional(v.string()),
  }),
}, async (ctx) => {
  const user = ctx.user; // Verified Telegram user object
  const { productId, quantity } = ctx.input; // Guaranteed valid

  return {
    orderId: 'ORD-' + Date.now(),
    buyer: user.first_name,
    total: quantity * 15.00,
  };
});
```

Frontend caller from `public/index.html`:
```javascript
Telegram.WebApp.Serverless.call('submitOrder', { productId: 'PRO-10', quantity: 2 }, (err, res) => {
  if (err) console.error('Order failed:', err.message);
  else console.log('Order confirmed:', res.orderId, res.total);
});
```

---

## 4. Gramless Lab: Deterministic In-Process Testing

Test complete bot conversations and callback button presses inside standard `node:test` without deploying to TGCloud or hitting Telegram's live servers:

```javascript
import test from 'node:test';
import { createBot } from 'gramless';
import { createLab, Sent, Edited, Answered } from 'gramless/testkit';

test('Settings Flow Test', async () => {
  const bot = createBot();

  bot.command('menu', async (ctx) => {
    await ctx.reply('Main Menu:', {
      buttons: [[{ text: 'Profile', data: 'btn_profile' }]],
    });
  });

  bot.action('btn_profile', async (ctx) => {
    await ctx.answer();
    await ctx.edit(`User Profile for: ${ctx.from.first_name}`);
  });

  const lab = createLab(bot);
  const alice = lab.user(42, 'Alice');

  // 1. Send command
  const res1 = await alice.command('/menu');
  res1.want(Sent('Main Menu:'));

  // 2. Click inline keyboard button
  const res2 = await alice.click('btn_profile');
  res2.want(Answered());
  res2.want(Edited('User Profile for: Alice'));
});
```

---

## 5. Deployment Workflow to Telegram Serverless

Gramless projects follow standard TGCloud conventions:

```bash
# 1. Inspect local changes vs cloud revision
npx tgcloud status
npx tgcloud diff

# 2. Upload code, handlers, and Mini App static assets
npx tgcloud push

# 3. Apply schema migrations to SQLite
npx tgcloud migrate
```

---

## Day-Zero Escape Hatches

Gramless never restricts access to the Telegram Bot API. If Telegram introduces a new feature today, call it immediately:

```javascript
// High-level ergonomic sugar:
await ctx.reply('Hello');
await ctx.edit('Updated text');
await ctx.alert('Attention');

// Direct platform API proxy:
await ctx.api.sendChatAction({ chat_id: ctx.chatId, action: 'typing' });

// Permanent raw escape hatch:
await ctx.call('newTelegramMethod2026', { chat_id: ctx.chatId, custom_param: true });
```

---

## License

MIT © [sidwiskers](https://github.com/sidwiskers)
