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
    details: Written in standard ECMAScript. Executes directly in V8 isolates and edge runtimes with zero external packages.
  - title: Sub-Microsecond Routing
    details: Pre-compiled $O(1)$ Hash Map command routing (2.25 µs) and action callback dispatch (0.92 µs).
  - title: ACID Transactional Sessions
    details: SQLite state commits only when the handler completes successfully. Unhandled errors trigger an automatic rollback.
  - title: Complete Bot API & Direct Calls
    details: Helper methods with automatic chat_id inference, plus direct access (ctx.call) for all Telegram Bot API methods.
  - title: Mini App RPC Bridge
    details: Serverless endpoint handlers (createEndpoint) with platform initData verification and built-in schema validation (v).
  - title: Universal Execution
    details: Direct support for TGCloud, Cloudflare Workers, Vercel, and traditional Node.js servers with long polling.
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
