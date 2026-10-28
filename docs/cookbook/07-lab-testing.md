# Recipe 07: Hermetic Testing with Gramless Lab

This recipe demonstrates how to write 100% deterministic, offline automated tests for your Telegram bots using **Gramless Lab** (`gramless/testkit`) and Node's built-in test runner (`node:test`).

---

## Architectural Problem: The Fragility of Bot Testing

Historically, testing a Telegram bot required:
1. Registering disposable test bots via @BotFather.
2. Running live network requests against `api.telegram.org` during CI runs, hitting rate limits and network flakiness.
3. Setting up complex mock HTTP servers (nock, msw) that constantly diverge from Telegram's real payload schemas.

### The Gramless Lab Solution
Gramless Lab runs entirely in-process inside your test runner:
- **Zero Bot Tokens & Zero Network:** All outbound actions (`sendMessage`, `editMessageText`, `answerCallbackQuery`) are intercepted by a high-speed in-memory mock engine.
- **Virtual User Actors:** Simulate realistic multi-turn conversations using `lab.user(id, name)`.
- **Fluent Matcher Assertions:** Test expectations declaratively using `Sent('pattern')`, `Edited('pattern')`, and `Answered()`.
- **Session & Concurrency Isolation:** Multiple virtual actors maintain completely isolated session stores, letting you verify multi-user isolation and race condition safety.

---

## Directory Structure

```text
07-lab-testing/
├── bot.js                      # The bot under test
├── tests/
│   └── bot.test.js             # Gramless Lab offline test suite
└── package.json                # "scripts": { "test": "node --test tests/*.test.js" }
```

---

## Code Walkthrough

### 1. The Bot Implementation (`bot.js`)

```javascript
import { createBot, session } from 'gramless';

export function createTestBot() {
  const bot = createBot();

  bot.use(session({ initial: () => ({ counter: 0 }) }));

  bot.command('start', async (ctx) => {
    await ctx.reply(`Welcome ${ctx.from?.first_name}!`, {
      buttons: [[{ text: '+1 Increment', data: 'action:inc' }]],
    });
  });

  bot.action('action:inc', async (ctx) => {
    ctx.session.counter += 1;
    await ctx.answer('Incremented!');
    await ctx.edit(`Current count: ${ctx.session.counter}`);
  });

  return bot;
}
```

### 2. The Offline Test Suite (`tests/bot.test.js`)

```javascript
import test from 'node:test';
import { createLab, Sent, Edited, Answered } from 'gramless/testkit';
import { createTestBot } from '../bot.js';

test('Simulate multi-turn user conversation offline', async () => {
  const bot = createTestBot();
  const lab = createLab(bot);
  const alice = lab.user(101, 'Alice');

  // 1. Alice sends /start command
  const res1 = await alice.command('/start');
  res1.want(Sent('Welcome Alice!'));

  // 2. Alice clicks the "+1 Increment" inline button
  const res2 = await alice.click('action:inc');
  res2.want(Answered('Incremented!'));
  res2.want(Edited('Current count: 1'));

  // 3. Alice clicks again — verifies session persistence
  const res3 = await alice.click('action:inc');
  res3.want(Edited('Current count: 2'));
});
```

---

## Running the Tests

Run directly using Node.js's built-in test runner without installing Jest, Mocha, or Vitest:

```bash
npm test
```
