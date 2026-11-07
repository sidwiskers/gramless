# Gramless

[![Tests](https://img.shields.io/badge/tests-162%20passed-brightgreen.svg)](tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bot API](https://img.shields.io/badge/Telegram%20Bot%20API-8.x%20ready-blue.svg)](https://core.telegram.org/bots/api-changelog)
[![Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/types-included-blue.svg)](types/index.d.ts)
[![TGCloud Runtime](https://img.shields.io/badge/runtime-Telegram%20Serverless%20(V8)-orange.svg)](https://tgcloud.ai)
[![Cookbook](https://img.shields.io/badge/cookbook-8%20recipes-purple.svg)](https://github.com/sidwiskers/gramless-cookbook)

**Gramless** is a zero-dependency Telegram bot framework built for **Telegram Serverless (TGCloud)**, Cloudflare Workers, and traditional Node.js servers.

It provides pre-compiled route dispatching, transactional SQLite sessions with automatic rollback, composable filters, typed Bot API helpers, Mini App RPC endpoints, and an offline testing lab.

```bash
# Scaffold a new project in seconds
npm create gramless@latest
```

```javascript
import { createBot, Filter } from 'gramless';

export const bot = createBot();

bot.command('start', async (ctx) => {
  await ctx.reply(`Welcome <b>${ctx.from.first_name}</b>!`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: 'Open App', webApp: 'https://app.tgcloud.ai/' }],
      [{ text: 'Settings', data: 'settings:view' }],
    ],
  });
});

// Composable filter matching
bot.on(Filter.all(Filter.group, Filter.hasPhoto), async (ctx) => {
  await ctx.reply('Photo received.');
});

bot.action('settings:view', async (ctx) => {
  await ctx.answer();
  await ctx.edit('<b>Settings Menu</b>\nSelect your preferences below:', {
    parse_mode: 'HTML',
  });
});

// Export handler for Telegram Serverless:
export default bot.handler();
```

---

## Design Overview

Telegram Serverless (`tgcloud`) runs bot code inside sandboxed V8 isolates where `node_modules` are not available at runtime. Traditional Node.js bot libraries (Telegraf, grammY) carry 25–35 external dependencies and are designed around long-lived server processes.

Writing raw handlers directly on the platform requires implementing manual command routing, callback parsing, and state persistence. Gramless provides these abstractions in pure JavaScript with zero external runtime dependencies.

| Feature | Raw Handlers | Traditional Frameworks | Gramless |
| :--- | :---: | :---: | :---: |
| **Runtime Dependencies** | None | 25–35 packages | **0 packages** |
| **Command Lookup (1,000 routes)** | Manual `if/else` | Sequential regex scan | **$O(1)$ Hash Map (2.25 µs)** |
| **Callback Query Dispatch** | String splitting | Regex scan | **$O(1)$ Hash Map & Prefix Index (0.92 µs)** |
| **Session Persistence** | Manual SQL queries | In-memory / external cache | **ACID SQLite with automatic rollback** |
| **Bot API Methods** | Raw `api.*` proxy | Custom wrappers | **Typed Context facade + direct `ctx.call`** |
| **Offline Testing** | Cloud deployment | Mocking libraries | **In-memory test lab (`gramless/testkit`)** |
| **Mini App Endpoints** | Raw HTTP POST | External web server | **Built-in `createEndpoint`** |
| **TypeScript Support** | None | `@types/*` packages | **Built-in `types/index.d.ts`** |

---

## Performance & Scale Benchmarks

Recorded on an ARM64 host across 10,000 warm iterations (`npm run bench`):

```text
--- Gramless Performance & Scale Benchmark ---
[Results across 10,000 iterations]
• Exact Action Dispatch  (500 routes):    0.92 µs / op  (1,087,209 ops/sec)
• Exact Command Dispatch (1,000 routes):  2.25 µs / op  (444,131 ops/sec)
• Schema Validation Engine (v):           0.49 µs / op  (2,023,848 ops/sec)
• Safe HTML Template Literal (html):      1.74 µs / op  (573,865 ops/sec)
• 10-Layer Middleware Pipeline:           7.01 µs / op  (142,666 ops/sec)
----------------------------------------------
```

Routes are compiled into static lookup tables upon registration, avoiding array iterations and allocations on incoming update paths.

---

## Core Systems & Architecture

```text
gramless/
├── src/
│   ├── index.js          # Root facade & bot constructor
│   ├── router.js         # Constant-time route compiler, update dispatcher & fetch adapter
│   ├── context.js        # Ergonomic Context facade with full Bot API coverage & clock budgets
│   ├── filters.js        # Composable functional filter predicates
│   ├── errors.js         # Typed error system with classification & token sanitization
│   ├── session.js        # Transactional SQLite session engine with rollback & checkpointing
│   ├── fsm.js            # Finite State Machine / conversation scenes
│   ├── endpoint.js       # Mini App RPC bridge with zero-dependency schema validation
│   ├── ratelimit.js      # Sliding-window anti-spam & declarative rateLimitGuard shield
│   ├── i18n.js           # Multi-language localization & pluralization
│   ├── menu.js           # Interactive menus & pagination engine
│   ├── deeplink.js       # Deep link parsing & referral tracking
│   ├── payments.js       # Telegram Stars (XTR) payments engine
│   ├── media_group.js    # Album / multi-photo debounce aggregator
│   ├── auto_retry.js     # Telegram 429 flood wait auto-retry with serverless ceiling
│   ├── stateless_question.js # Zero-state force_reply prompts
│   ├── cleaner.js        # Message cleaner & temp notice purger
│   ├── format.js         # Zero-dependency safe entity escaping & template tags
│   ├── init_data.js      # Cryptographic Mini App auth via Web Crypto API
│   ├── pacer.js          # Proactive flood control (1s DM, 3s group pacing)
│   ├── isolate.js        # Isolate-native delay and timer primitives (Atomics / spin-loop)
│   ├── batch.js          # Multi-pass batch processing with interactive continuation UI
│   └── testkit/          # Gramless Lab: deterministic offline test harness
├── types/
│   └── index.d.ts        # Comprehensive TypeScript definitions
└── tests/                # 162 unit, integration, and benchmark tests
```

---

## 1. Full Bot API Context Facade

Gramless wraps the full Telegram Bot API with intuitive helpers that automatically infer and bind `chat_id` and `message_id`:

### Sending Media & Interactive Elements
```javascript
// Photos, Documents, Audio, Video, Voice, Video Notes, Animations, Stickers
await ctx.sendPhoto(photoId, { caption: 'Landscape' });
await ctx.sendVideo(videoId);
await ctx.sendVoice(voiceFileId);
await ctx.sendAnimation(gifId);
await ctx.sendSticker(stickerId);

// Media Groups (Albums)
await ctx.sendMediaGroup([
  { type: 'photo', media: photoId1 },
  { type: 'photo', media: photoId2, caption: 'Album cover' },
]);

// Location, Venues, and Contacts
await ctx.sendLocation(37.7749, -122.4194);
await ctx.sendVenue(37.7749, -122.4194, 'Office', '123 Main St');
await ctx.sendContact('+123456789', 'Alex');

// Polls & Dice
await ctx.sendPoll('Favorite language?', ['JavaScript', 'Go', 'Rust'], { is_anonymous: false });
await ctx.sendDice('🎯');

// Message Reactions & Typing Action
await ctx.chatAction('typing');
```

### Message Editing & Management
```javascript
// Edit text, captions, media, or reply markups
await ctx.edit('Updated text');
await ctx.editCaption('Updated caption');
await ctx.editKeyboard([[{ text: 'Refreshed', data: 'noop' }]]);

// Pinning, Forwarding, and Deletion
await ctx.pin();
await ctx.unpin();
await ctx.delete();
await ctx.forward(targetChatId);
await ctx.copy(targetChatId);
```

### Chat Administration & Moderation
```javascript
await ctx.banSender(true); // Bans author of current message and revokes messages
await ctx.banMember(userId);
await ctx.unbanMember(userId);
await ctx.restrictMember(userId, { can_send_messages: false });
await ctx.setChatTitle('New Community Name');
await ctx.createInviteLink({ member_limit: 100 });
```

---

## 2. Complete Keyboard Builders

Gramless provides unified builders for **Inline Keyboards**, **Reply Keyboards**, **Removers**, and **Force Reply**:

```javascript
import { buildReplyKeyboard, removeKeyboard, forceReply } from 'gramless';

// 1. Inline Keyboards (shorthand array)
await ctx.reply('Menu:', {
  buttons: [
    ['Simple Button', { text: 'Link', url: 'https://example.com' }],
    [{ text: 'Open Mini App', webApp: 'https://app.tgcloud.ai' }],
  ],
});

// 2. Custom Reply Keyboards
await ctx.reply('Share your info:', {
  keyboard: [
    [{ text: 'Share Contact', requestContact: true }],
    [{ text: 'Share Location', requestLocation: true }],
  ],
  resize: true,
  oneTime: true,
});

// 3. Remove Keyboard or Force Reply
await ctx.reply('Reset', { removeKeyboard: true });
await ctx.reply('What is your name?', { forceReply: true, placeholder: 'Enter name...' });
```

---

## 3. Composable Functional Filters

Chain logic declaratively without reflection:

```javascript
import { createBot, Filter } from 'gramless';

const bot = createBot();

// Match private messages from specific admins with text
const adminCommand = Filter.all(
  Filter.private,
  Filter.fromUsers(123456, 789012),
  Filter.hasText
);

bot.on(adminCommand, async (ctx) => {
  await ctx.reply('Welcome, Admin.');
});

// Match groups with audio or voice notes
bot.on(Filter.all(Filter.group, Filter.any(Filter.hasAudio, Filter.hasVoice)), async (ctx) => {
  await ctx.reply('Audio received.');
});
```

---

## 4. Transactional SQLite Sessions with Rollback

Mutations to `ctx.session` are held in an atomic transaction and committed to SQLite (`sdk/db`) **only if the handler succeeds**. If an unhandled error or network fault occurs, mutations are **automatically discarded and rolled back**:

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
  // 1. Mutate state in memory
  ctx.session.balance -= 50;

  // 2. Outbound operation throws an error
  await ctx.call('sendInvoice', { ...invalidParams });

  // Invariant: Because this threw, ctx.session.balance is rolled back to 100!
});
```

---

## 5. Multi-Step Conversation Wizards (FSM)

```javascript
import { createBot, createFSM } from 'gramless';

const bot = createBot();
const onboarding = createFSM();

onboarding.step('ask_name', async (ctx) => {
  ctx.fsm.data.name = ctx.text.trim();
  await ctx.reply('What is your email?');
  ctx.fsm.goto('ask_email');
});

onboarding.step(
  'ask_email',
  async (ctx) => {
    ctx.fsm.data.email = ctx.text.trim();
    await ctx.reply(`Profile saved! Name: ${ctx.fsm.data.name}, Email: ${ctx.fsm.data.email}`);
    ctx.fsm.complete();
  },
  // Validation guard: user stays on step if invalid
  async (ctx) => {
    if (!ctx.text.includes('@')) {
      await ctx.reply('Invalid email. Please re-enter:');
      return false;
    }
    return true;
  }
);

bot.use(onboarding.middleware());
```

---

## 6. Mini App RPC Endpoints

Host serverless RPC functions in `tgcloud/endpoints/*.js` called directly from your Mini App via `Telegram.WebApp.Serverless.call`. Gramless verifies caller identity (`ctx.initData`) and validates payloads without external dependencies:

```javascript
// tgcloud/endpoints/submitOrder.js
import { createEndpoint, v } from 'gramless/endpoint';

export default createEndpoint({
  requireAuth: true,
  schema: v.object({
    productId: v.string({ minLength: 3 }),
    quantity: v.number({ min: 1, max: 99 }),
  }),
}, async (ctx) => {
  const user = ctx.user; // Verified Telegram user
  const { productId, quantity } = ctx.input; // Guaranteed valid

  return { orderId: 'ORD-' + Date.now(), buyer: user.first_name };
});
```

---

## 7. Gramless Lab: Deterministic In-Process Testing

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
    await ctx.edit(`User Profile: ${ctx.from.first_name}`);
  });

  const lab = createLab(bot);
  const alice = lab.user(42, 'Alice');

  const res1 = await alice.command('/menu');
  res1.want(Sent('Main Menu:'));

  const res2 = await alice.click('btn_profile');
  res2.want(Answered());
  res2.want(Edited('User Profile: Alice'));
});
```

---

## 8. Optional Extension Modules

Gramless provides zero-dependency, tree-shakable subpath modules for common production requirements:

### Anti-Spam Rate Limiting (`gramless/ratelimit`)
```javascript
import { rateLimit } from 'gramless/ratelimit';

// Protect bot against spam (max 5 commands per 10s per user)
bot.use(rateLimit({
  limit: 5,
  window: '10s',
  skip: (ctx) => ctx.userId === ADMIN_ID,
}));
```

### Multi-Language Localization & Pluralization (`gramless/i18n`)
```javascript
import { createI18n } from 'gramless/i18n';

const i18n = createI18n({
  defaultLocale: 'en',
  locales: {
    en: { welcome: 'Welcome, {name}!', stars: '{count} star | {count} stars' },
    es: { welcome: '¡Bienvenido, {name}!', stars: '{count} estrella | {count} estrellas' },
  },
});
bot.use(i18n.middleware());

bot.command('start', async (ctx) => {
  await ctx.reply(ctx.t('welcome', { name: ctx.from.first_name }));
});
```

### Paginated Lists & Interactive Menus (`gramless/menu`)
```javascript
import { paginate, Menu } from 'gramless/menu';

bot.command('catalog', async (ctx) => {
  const items = await fetchCatalog();
  await paginate(ctx, {
    items,
    pageSize: 5,
    formatItem: (item, idx) => `📦 <b>${item.name}</b> — $${item.price}`,
    callbackPrefix: 'catalog:p:',
  });
});
```

### Deep Linking & Referral Tracking (`gramless/deeplink`)
```javascript
import { createDeepLinkRouter } from 'gramless/deeplink';

const dl = createDeepLinkRouter();
// Handles t.me/MyBot?start=ref_12345
dl.on('ref_:referrerId', async (ctx) => {
  await rewardReferral(ctx.params.referrerId, ctx.userId);
  await ctx.reply(`Welcome! You joined via referral code ${ctx.params.referrerId}.`);
});
bot.use(dl.middleware());
```

### Telegram Stars (`XTR`) Digital Goods (`gramless/payments`)
```javascript
import { createStarsEngine } from 'gramless/payments';

const stars = createStarsEngine();
bot.use(stars.middleware());

bot.command('buy_vip', async (ctx) => {
  await stars.sendInvoice(ctx, {
    title: 'VIP Pass',
    description: '30-day VIP membership',
    stars: 150,
    payload: `vip_${ctx.userId}`,
  });
});

stars.onPreCheckout(async (ctx) => true);
stars.onSuccess('vip_:id', async (ctx, payment) => {
  await ctx.reply(`🎉 Payment received! ${payment.total_amount} Stars.`);
});
```

### Media Group / Album Aggregator (`gramless/media-group`)
```javascript
import { mediaGroup } from 'gramless/media-group';

// Debounces rapid multi-photo album updates into a single execution
bot.use(mediaGroup({ timeout: 100 }));

bot.on('photo', async (ctx) => {
  if (ctx.mediaGroup) {
    await ctx.reply(`Received album with ${ctx.mediaGroup.length} items!`);
  } else {
    await ctx.reply('Received single photo.');
  }
});
```

### Auto-Retry on Telegram 429 Flood Wait (`gramless/auto-retry`)
```javascript
import { autoRetry } from 'gramless/auto-retry';

// Transparently sleeps and retries when Telegram responds with 429 Too Many Requests
bot.use(autoRetry({ maxRetries: 3, maxDelay: 30000 }));
```

### Stateless ForceReply Questions (`gramless/stateless-question`)
```javascript
import { createStatelessQuestion } from 'gramless/stateless-question';

const emailPrompt = createStatelessQuestion('ask_email', async (ctx) => {
  await ctx.reply(`Saved your email: ${ctx.text}`);
});
bot.use(emailPrompt.middleware());

bot.command('login', async (ctx) => {
  // Uses invisible zero-width unicode tagging; question looks clean to user
  await emailPrompt.reply(ctx, 'Please enter your email:');
});
```

### Message Cleaner & Temp Notice Purger (`gramless/cleaner`)
```javascript
import { cleaner } from 'gramless/cleaner';

bot.use(cleaner({ autoCleanOnCommand: true }));

bot.command('search', async (ctx) => {
  // replyTemp marks message for deletion
  await ctx.replyTemp('🔍 Searching database...');
  const results = await fetchResults();
  
  // Clean temporary notices and send final result
  await ctx.cleanTracked();
  await ctx.reply(`Found ${results.length} results!`);
});
```

### Safe Formatting & Templates (`gramless/format`)
When sending messages with `HTML` or `MarkdownV2` parse modes, unescaped reserved characters (`<`, `>`, `&` in HTML, or `_`, `*`, `[`, `]` in MarkdownV2) cause Telegram to return `400 Bad Request: can't parse entities`.

The `html` and `md` tagged template literals escape interpolated dynamic values while preserving literal formatting tags:

```javascript
import { html, md, fmt } from 'gramless/format';

bot.command('profile', async (ctx) => {
  // Dynamic variables are automatically escaped; tags and fmt helpers are preserved:
  const text = html`Welcome <b>${ctx.from.first_name}</b>!
Balance: <code>${100} Stars</code>
Status: ${fmt.bold('Active VIP')}
Bio: ${fmt.spoiler(userBio)}`;

  await ctx.replyWithHtml(text);
});
```

### Cryptographic Mini App Authentication (`gramless/init-data`)
Validates Telegram Mini App `initData` query strings using HMAC-SHA256 over the standard Web Crypto API (`crypto.subtle`). Supports replay attack defense via `maxAge` and automatically unpacks serialized `user` and `receiver` objects:

```javascript
import { validateInitData, parseInitData } from 'gramless/init-data';

const result = await validateInitData(rawInitData, process.env.BOT_TOKEN, {
  maxAge: 86400, // Reject if auth_date is older than 24 hours
});

if (result.ok) {
  console.log('Authenticated User:', result.data.user);
}
```

### Proactive Flood Control & Group Pacing (`gramless/pacer`)
Enforces Telegram's outbound rate limits per chat:
- **Private chats (`chat_id > 0`):** 1 message per second (1,000ms spacing).
- **Group and channel chats (`chat_id < 0`):** 20 messages per minute (3,000ms spacing).
- **Global limit:** 30 messages per second across all chats.

Outbound messages are queued per chat, allowing distinct chats to proceed concurrently without triggering `429 Too Many Requests`:

```javascript
import { pacer } from 'gramless/pacer';

// Injects proactive leaky-bucket serialization into ctx.api
bot.use(pacer({
  minPrivateChatIntervalMs: 1000, // 1 msg/sec in private chats
  minGroupChatIntervalMs: 3000,   // 20 msgs/min (3s interval) in groups
  globalLimitPerSec: 30,          // 30 msgs/sec across all chats
}));
```

### Universal Deployment & Execution

Gramless runs identically across all supported execution targets with zero external runtime dependencies:

#### 1. Cloudflare Workers
```javascript
import { createBot } from 'gramless';

const bot = createBot();
bot.command('start', (ctx) => ctx.reply('Hello from Cloudflare Workers!'));

export default {
  fetch: bot.fetch({
    secretToken: env.TELEGRAM_SECRET_TOKEN, // Constant-time verification
    webhookReply: true,                     // Returns reply in HTTP 200 JSON, eliminating outbound roundtrip
    background: true,                       // Executes remaining work via ctx.waitUntil()
  }),
};
```

#### 2. Vercel & Next.js
```javascript
// app/api/webhook/route.js (Next.js App Router / Vercel Edge)
import { createBot } from 'gramless';

const bot = createBot({ token: process.env.BOT_TOKEN });
bot.command('start', (ctx) => ctx.reply('Hello from Next.js on Vercel!'));

export const POST = bot.webhook({ secretToken: process.env.SECRET_TOKEN });
```

#### 3. Traditional Servers (Express, Fastify, Node `http`)
```javascript
// Express webhook:
import express from 'express';
import { createBot, webhookCallback } from 'gramless';

const app = express();
app.use(express.json());

const bot = createBot({ token: process.env.BOT_TOKEN });
bot.command('start', (ctx) => ctx.reply('Hello from Express!'));

app.use('/webhook', webhookCallback(bot, { secretToken: process.env.SECRET_TOKEN }));
app.listen(3000);
```

#### 4. Long Polling (Local Development & VPS)
For environments without a public domain or webhook endpoint:
```javascript
import { createBot } from 'gramless';

const bot = createBot({ token: process.env.BOT_TOKEN });
bot.command('start', (ctx) => ctx.reply('Polling live!'));

await bot.start({
  dropPendingUpdates: true,
  onStart: () => console.log('Bot started polling'),
});
```

#### 5. Telegram Serverless (`tgcloud`)
```javascript
// handlers/message.js:
import { createBot } from 'gramless';

const bot = createBot();
bot.command('start', (ctx) => ctx.reply('Hello from TGCloud!'));

export default bot.handler();
```

### Structured Telegram Error Diagnostics (`ApiError`)
Zero-allocation error classification for all 13 Telegram runtime failure modes:

```javascript
import { isBlockedError, isNotModifiedError, isPermissionError } from 'gramless';

try {
  await ctx.editKeyboard(newButtons);
} catch (err) {
  if (isNotModifiedError(err)) return; // Ignored: button double-tap with identical markup
  if (isBlockedError(err)) await db.markUserInactive(ctx.userId);
  if (err.isPermissionDenied) await ctx.reply('Admin permissions required.');
}
```

---

## V8 Isolate Systems & Execution Budgeting (v1.4+)

Telegram Serverless (`tgcloud`) executes bot code inside pure V8 isolates subject to strict runtime characteristics:
- **No timer globals:** Standard Node.js `setTimeout` and `clearTimeout` do not exist.
- **Hard 10.4s isolate execution ceiling:** Any execution reaching ~10,480ms is forcibly terminated by the platform.
- **Egress sandbox firewall:** Direct internal loopbacks to `api.telegram.org` or `*.tgcloud.ai` within the sandbox are blocked (`[sdk/io:166:36]`). Synthetic HMAC `initData` generated inside isolates is rejected (`401 Unauthorized`).

Gramless v1.4+ provides isolate-native primitives to manage these boundaries cleanly:

### 1. Isolate-Native Delays (`sleep`)
Zero-dependency delay primitive that never throws `ReferenceError: setTimeout is not defined`:
```javascript
import { sleep, safeSetTimeout, safeClearTimeout } from 'gramless';

// Uses setTimeout in Node.js, and Atomics.wait on SharedArrayBuffer or micro-yields in pure isolates
await sleep(100);

// Non-crashing timer wrappers
const handle = safeSetTimeout(() => console.log('Done'), 50);
safeClearTimeout(handle);
```

### 2. Execution Clock & Deadline Budgeting
`ctx` tracks invocation wall-clock time and remaining execution budget:
```javascript
bot.command('sync', async (ctx) => {
  console.log(`Elapsed: ${ctx.elapsedMs}ms`);
  console.log(`Remaining: ${ctx.remainingMs()}ms`);
  console.log(`Hard deadline: ${new Date(ctx.deadline).toISOString()}`);

  if (!ctx.hasTimeFor(2000)) {
    return ctx.reply('Workload paused to prevent platform isolate termination.');
  }
});
```

### 3. Transactional Mid-Execution Checkpointing
Commit intermediate progress to SQLite before the isolate reaches its 10.4s deadline:
```javascript
bot.command('import', async (ctx) => {
  for (const [idx, item] of items.entries()) {
    ctx.session.processedCount = idx + 1;

    // Checkpoint state immediately to SQLite every 10 items
    if (idx % 10 === 0) {
      await ctx.checkpoint();
    }
  }
});
```

### 4. Serverless-Aware Flood Control (`FloodWaitError`)
Unconditional sleep during a 429 flood wait (> 1.5s) will cause the platform to terminate the isolate. Gramless enforces a 1.5s serverless ceiling:
```javascript
import { autoRetry, FloodWaitError } from 'gramless';

bot.use(autoRetry({ maxServerlessDelay: 1500 }));

try {
  await ctx.sendPhoto(fileId);
} catch (err) {
  if (err instanceof FloodWaitError) {
    // Retry-after exceeded serverless ceiling: alert user without killing the isolate
    await ctx.reply(`Telegram servers are busy. Please retry in ${err.retryAfter}s.`);
  }
}
```

### 5. Declarative Rate Limit Shield (`rateLimitGuard`)
Deflects rapid button double-taps and spam clicks during active cooldowns with an instant toast alert (`ctx.answer`), bypassing downstream handler execution:
```javascript
import { rateLimitGuard } from 'gramless';

// Limits clicks to 1 per second per user; alerts on spam
bot.action('heavy_task', rateLimitGuard({ window: '1s' }), async (ctx) => {
  await ctx.reply('Heavy calculation starting...');
});
```

### 6. Interactive Multi-Pass Batch Processing (`createBatchJob`)
Slices large tasks (e.g. cloning 100+ stickers or bulk imports) across interactive passes within isolate deadlines:
```javascript
import { createBatchJob } from 'gramless';

const stickerSync = createBatchJob({
  name: 'sticker_sync',
  chunkSize: 15,          // Items per isolate pass
  timeBudgetMs: 8000,     // Pause before 8.0s isolate budget
  processItem: async (sticker, ctx) => {
    await ctx.call('addStickerToSet', sticker);
  },
  onProgress: async ({ cursor, total }, ctx) => {
    await ctx.reply(`Progress: ${cursor}/${total}`, {
      reply_markup: stickerSync.createContinuationMarkup(cursor, total),
    });
  },
  onComplete: async ({ total }, ctx) => {
    await ctx.reply(`Completed syncing all ${total} stickers!`);
  },
});

bot.command('sync_stickers', async (ctx) => {
  const stickers = await fetchStickerList();
  await stickerSync.run(stickers, ctx);
});

// Resumes when user clicks the "Continue ▶️" button
bot.action(/^batch:sticker_sync:(\d+)$/, stickerSync.middleware(fetchStickerList));
```

### 7. Direct Dependency Injection
Inject platform API and SQLite DB clients directly into `bot.handler()`, eliminating dynamic `import('sdk')` cold-start overhead:
```javascript
import { createBot } from 'gramless';
import { api, db } from 'sdk';

const bot = createBot();

export default bot.handler({
  api,
  db,
  executionTimeoutMs: 9500,
});
```

---

## Direct API Access (`ctx.call`)

Any method supported by the Telegram Bot API can be called directly without relying on framework updates:

```javascript
// High-level helpers:
await ctx.reply('Hello');
await ctx.edit('Updated text');
await ctx.sendPoll('Question', ['A', 'B']);

// Direct platform API proxy:
await ctx.api.sendChatAction({ chat_id: ctx.chatId, action: 'typing' });

// Raw method call:
await ctx.call('sendMessage', { chat_id: ctx.chatId, text: 'Direct call' });
```

---

## Benchmarks

Measured on an ARM64 host across 10,000 warm iterations (`npm run bench`):

| Scenario | Complexity / Scale | Latency (µs / op) | Throughput (ops / sec) |
| :--- | :--- | :--- | :--- |
| **Exact Action Dispatch** | 500 registered callback routes | **0.92 µs** | **1,087,209** |
| **Exact Command Dispatch** | 1,000 registered routes | **2.25 µs** | **444,131** |
| **Schema Validation (`v`)** | Multi-field object + nested constraints | **0.49 µs** | **2,023,848** |
| **Safe HTML Template (`html`)** | Tagged template literal interpolation | **1.74 µs** | **573,865** |
| **10-Layer Middleware** | 10 onion layers + route execution | **7.01 µs** | **142,666** |

For reproducible methodology and benchmark details, see [benchmarks/RESULTS.md](benchmarks/RESULTS.md).

---

## License

MIT © [sidwiskers](https://github.com/sidwiskers)
