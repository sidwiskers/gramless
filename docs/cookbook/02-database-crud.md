# Recipe 02: Transactional SQLite CRUD & Persistence

This recipe shows how to build a persistent Task Manager bot using Telegram Serverless's native SQLite engine (`sdk/db`) combined with Gramless's transactional session middleware.

---

## Architectural Problem: The Lost Update & Broken State Hazard

In a serverless environment, incoming updates trigger separate V8 isolate runs.
1. **Uncoordinated Database Writes:** Traditional bot frameworks store sessions in RAM or issue uncoordinated `UPDATE` queries. If an outbound Telegram API call fails halfway through (e.g. rate limit, bad file ID), the database is left in a dirty, partially mutated state.
2. **Foreign Key Pitfall:** TGCloud SQLite has `PRAGMA foreign_keys = OFF`. Declaring `.references()` will throw an error at startup.

### How Gramless Solves This
- **Transactional Rollback:** When you use `bot.use(session({ store: new TgCloudSessionStore(...) }))`, mutations to `ctx.session` are held in an in-memory staging clone. Only when the handler resolves successfully are changes committed to the SQLite database. If any error or panic occurs, all mutations are discarded.
- **In-Process Mutex Serialization:** Rapid sequential button clicks from the same user are serialized through `KeyedMutex` to eliminate read-modify-write race conditions.

---

## Directory Structure

```text
02-database-crud/
├── tgcloud/
│   ├── schema.js               # Declarative SQLite tables & indexes
│   ├── handlers/
│   │   ├── message.js          # export default bot.handler();
│   │   └── callback_query.js   # export default bot.handler();
│   └── lib/
│       └── bot.js              # Bot routes & CRUD operations
├── package.json
└── tgcloud.jsonc
```

---

## Schema Declaration (`tgcloud/schema.js`)

All tables must be declared using the `sdk/db` DSL:

```javascript
import { table, integer, text, boolean, json, index, sql } from 'sdk/db';

export const tasks = table('tasks', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  userId:      integer('user_id').notNull(),
  title:       text('title').notNull(),
  isCompleted: boolean('is_completed').default(false),
  createdAt:   integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  userStatusIdx: index('idx_tasks_user_status').on(t.userId, t.isCompleted),
}));

export const sessions = table('sessions', {
  id:        text('id').primaryKey(),
  data:      json('data'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
```

---

## Deploying Schema & Handlers

When you push code with `@tgcloud/cli`, the platform automatically inspects `tgcloud/schema.js` and applies necessary migrations before activating your handlers:

```bash
# Preview schema migrations and code diff
tgcloud diff

# Apply schema migrations and deploy code
tgcloud push
```

---

## Rules That Bite

- **Every DB Call Is Asynchronous:** In `sdk/db`, calling `db.select().from(table).get()` returns a Promise. **Always `await` every query**, otherwise you receive an unexecuted query builder object.
- **Do Not Declare Foreign Keys:** Foreign keys throw at declaration time. Store related IDs as plain `integer('user_id').notNull()` and query them with `eq(tasks.userId, ctx.userId)`.
