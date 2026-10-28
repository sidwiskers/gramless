# TGCloud Architecture & Mental Model

Understanding the execution lifecycle of **Telegram Serverless** and how **Gramless** optimizes performance within V8 isolates.

---

## The V8 Isolate Lifecycle

Unlike a traditional Node.js server that runs continuously on a single machine, Telegram Serverless runs discrete **V8 isolates** near the user:

```text
Incoming Telegram Update (Webhook)
               │
               ▼
   [TGCloud Edge Dispatcher]
               │
    ┌──────────┴──────────┐
    ▼                     ▼
handlers/message.js   handlers/callback_query.js
    │                     │
    └──────────┬──────────┘
               │
               ▼
       [bot.handler()]
               │
         Gramless Engine:
         • $O(1)$ Hash Route Dispatch
         • ACID Session Staging
         • Composable Filter Guards
               │
               ▼
       Handler Execution
               │
         (On Success)
               ▼
  [Commit SQLite State & Reply]
```

### Key Serverless Principles

1. **No Tokens in Code:** The runtime injects the authenticated API proxy automatically via `import { api } from 'sdk'`. You never commit bot tokens to repository configs.
2. **No Persistent Event Loops:** Never invoke `bot.start()` or `bot.launch()`. Export `bot.handler()`.
3. **Atomic SQLite:** All database persistence runs via built-in SQLite (`sdk/db`) with zero network round-trip overhead.

---

## Rules That Bite

- **Relative Imports Require Extensions:** Always write `import { bot } from './lib/bot.js'`. Omitting `.js` will cause module resolution errors in production.
- **Async Database Calls:** Every query in `sdk/db` must be awaited (`await db.select()...run()`).
- **No Foreign Key Declarations:** `PRAGMA foreign_keys = OFF`. Do not use `.references()`.
- **Always Answer Callback Queries:** Call `await ctx.answer()` inside button handlers to dismiss loading feedback.
