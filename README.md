# Gramless

[![Tests](https://img.shields.io/badge/tests-60%20passed-brightgreen.svg)](tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bot API](https://img.shields.io/badge/Telegram%20Bot%20API-10.3%20ready-blue.svg)](https://core.telegram.org/bots/api-changelog#august-24-2026)
[![Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/types-included-blue.svg)](types/index.d.ts)
[![TGCloud Runtime](https://img.shields.io/badge/runtime-Telegram%20Serverless%20(V8)-orange.svg)](https://tgcloud.ai)
[![Cookbook](https://img.shields.io/badge/cookbook-8%20recipes-purple.svg)](https://github.com/sidwiskers/gramless-cookbook)

**Gramless** is a zero-dependency Telegram framework built for **Telegram Serverless (TGCloud)** and isolated V8 runtimes.

It provides route dispatch, transactional SQLite sessions with automatic rollback, composable filters, Bot API helpers, Mini App RPC endpoints, and offline testing via **Gramless Lab**.

> **Production Recipes:** Explore the [**Gramless Cookbook**](https://github.com/sidwiskers/gramless-cookbook) for complete projects covering SQLite CRUD, FSM wizards, Mini App RPC, Telegram Stars, and offline testing.

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

// Single-line handler export for Telegram Serverless:
export default bot.handler();
```

---

## Why Gramless?

Telegram Serverless runs code inside lightweight, global V8 isolates. In this environment:
* Standard node bot frameworks (**grammY, Telegraf, Teloxide**) are unusable: they expect long-polling loops, external webhooks, bot tokens, and heavy npm dependency trees.
* Writing vanilla TGCloud handlers forces developers into brittle, unmaintainable string-matching spaghetti without session safety, typed keyboards, or testing tools.

Gramless bridges this gap with zero compromises:

| Metric / Capability | Vanilla TGCloud | Traditional Frameworks | Gramless |
| :--- | :---: | :---: | :---: |
| **Runtime Overhead** | Low (raw JS) | High (heavy bundle) | **Zero (pure ESM, 0 dependencies)** |
| **Command Lookup (1,000 routes)** | $O(N)$ manual checks | $O(N)$ regex scanning | **$O(1)$ Hash Map (2.44 µs)** |
| **Callback Dispatch** | Manual `.split(':')` | Regex matching | **Length-partitioned prefix trie (0.97 µs)** |
| **Session Safety** | Manual SQL queries | Racy in-memory/Redis | **ACID SQLite with automatic rollback** |
| **Bot API Method Coverage** | Raw `api.*` proxy | Varying | **100% typed Context facade + escape hatches** |
| **Offline Testability** | None (push to cloud) | Requires live token | **Gramless Lab (100% in-process)** |
| **Mini App RPC** | Raw POST handlers | External server | **Native type-safe `createEndpoint`** |
| **Type Safety** | None | npm `@types/*` | **First-class `types/index.d.ts` included** |

---

## Performance & Scale Benchmarks

Recorded on an ARM64 host across 10,000 warm iterations (`npm run bench`):

```text
--- Gramless Performance & Scale Benchmark ---
[Results across 10,000 iterations]
• Exact Command Dispatch (1,000 routes):  2.44 µs / op
• Exact Action Dispatch  (500 routes):    0.97 µs / op
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
│   ├── context.js        # Ergonomic Context facade with full Bot API coverage
│   ├── filters.js        # Composable functional filter predicates
│   ├── errors.js         # Typed error system with token & credential sanitization
│   ├── session.js        # Transactional SQLite session engine with rollback
│   ├── fsm.js            # Finite State Machine / conversation scenes
│   ├── endpoint.js       # Mini App RPC bridge with zero-dependency schema validation
│   ├── ratelimit.js      # Sliding-window anti-spam & flood wait control
│   ├── i18n.js           # Multi-language localization & pluralization
│   ├── menu.js           # Interactive menus & pagination engine
│   ├── deeplink.js       # Deep link parsing & referral tracking
│   ├── payments.js       # Telegram Stars (XTR) payments engine
│   └── testkit/          # Gramless Lab: deterministic offline test harness
├── types/
│   └── index.d.ts        # Comprehensive TypeScript definitions
└── tests/                # 60 unit, integration, and benchmark tests
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

---

## Day-Zero Escape Hatches

Gramless never restricts access to the Telegram Bot API. If Telegram introduces a new feature today, call it immediately:

```javascript
// High-level ergonomic sugar:
await ctx.reply('Hello');
await ctx.edit('Updated text');
await ctx.sendPoll('Question', ['A', 'B']);

// Direct platform API proxy:
await ctx.api.sendChatAction({ chat_id: ctx.chatId, action: 'typing' });

// Permanent raw escape hatch:
await ctx.call('newTelegramMethod2026', { chat_id: ctx.chatId, custom_param: true });
```

---

## Benchmarks & Scale

Gramless is engineered from first principles for sub-millisecond execution in isolated V8 environments:

| Scenario | Complexity / Scale | Latency (µs / op) | Throughput (ops / sec) |
| :--- | :--- | :--- | :--- |
| **Exact Command Dispatch** | 1,000 registered routes | **2.44 µs** | **409,792** |
| **Exact Action Dispatch** | 500 registered callback routes | **0.97 µs** | **1,031,676** |
| **Middleware Pipeline** | 10 onion layers + route execution | **7.86 µs** | **127,232** |
| **Schema Validation (`v`)** | Multi-field object + nested constraints | **0.46 µs** | **2,153,877** |

For reproducible methodology and benchmark details, see [benchmarks/RESULTS.md](benchmarks/RESULTS.md).

---

## License

MIT © [sidwiskers](https://github.com/sidwiskers)
