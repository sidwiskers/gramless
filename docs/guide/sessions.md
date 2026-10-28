# ACID Sessions & Concurrency

Gramless includes a transactional session engine that guarantees state consistency and automatic error rollback across serverless V8 isolate executions.

---

## Transactional Rollback

In standard frameworks, mutating session state immediately mutates external storage. If an external API call fails halfway through the handler, your database is corrupted with dirty data.

In Gramless, mutations to `ctx.session` are held in an isolated working copy:
- **On Handler Success:** The new state is atomically committed to SQLite (`sdk/db`).
- **On Handler Error or Panic:** The working copy is discarded. **Zero changes are committed to SQLite.**

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

bot.command('purchase', async (ctx) => {
  // 1. Mutate in memory
  ctx.session.balance -= 50;

  // 2. Outbound call fails
  await ctx.call('nonExistentMethod');

  // Invariant: Because this threw, ctx.session.balance remains 100!
});
```

---

## In-Process Mutex Serialization

When users rapidly double-tap inline buttons, multiple webhook updates arrive concurrently. Gramless serializes execution for the same user via `KeyedMutex`:

```text
User clicks button twice (rapid fire):
Update A ──────> [KeyedMutex: user:123] ───> Executes ───> Commits State
Update B ─────────────────── waiting ──────────────────> Reads Updated State ──> Commits
```

This completely eliminates lost read-modify-write updates.
