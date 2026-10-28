---
layout: home

hero:
  name: "Gramless"
  text: "Telegram Serverless Framework"
  tagline: "Sub-microsecond dispatch, zero dependencies, and transactional SQLite sessions engineered for TGCloud & V8 isolates."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View Recipes
      link: /cookbook/01-minimal-bot
    - theme: alt
      text: GitHub
      link: https://github.com/sidwiskers/gramless

features:
  - title: Zero Runtime Dependencies
    details: Pure modern ECMAScript standard library. Boots in < 3ms inside V8 isolates with zero supply-chain vulnerabilities.
  - title: Sub-Microsecond Routing
    details: Pre-compiled $O(1)$ Hash Map command routing (2.44 µs) and length-partitioned prefix tries (0.97 µs).
  - title: ACID Transactional Sessions
    details: SQLite state commits only if the handler resolves successfully. Any error or panic triggers an automatic rollback.
  - title: 100% Telegram Bot API
    details: Complete ergonomic method surface with automatic chat_id inference, plus raw escape hatches (ctx.call) for day-zero API updates.
  - title: Mini App RPC Bridge
    details: Native serverless endpoint handlers (createEndpoint) with cryptographic initData verification and zero-dep validation (v).
  - title: Hermetic Offline Lab
    details: In-process testkit to simulate realistic user conversations, clicks, and session persistence completely offline in node:test.
---

<div style="margin-top: 40px; text-align: center;">

## Quick Look

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

bot.action('settings:view', async (ctx) => {
  await ctx.answer();
  await ctx.edit('<b>Settings Menu</b>\nSelect your preferences below:', {
    parse_mode: 'HTML',
  });
});

// Single-line export for Telegram Serverless:
export default bot.handler();
```

</div>
