# Recipe 02: Transactional SQLite CRUD & Persistence

This recipe shows how to build a persistent Task Manager bot using Telegram Serverless's native SQLite engine (`sdk/db`) combined with Gramless's transactional session middleware.

---

## State Consistency & Transactional Sessions

In serverless execution environments, incoming updates trigger separate V8 isolate invocations:
1. **Uncoordinated Database Writes:** Traditional state stores commit mutations immediately. If an outbound Telegram API call fails halfway through (e.g., due to network interruptions or invalid parameters), external databases can be left in an inconsistent state.
2. **Foreign Key Support:** TGCloud SQLite operates with `PRAGMA foreign_keys = OFF`. Declaring `.references()` is not supported and throws an error at startup.

### Gramless State Handling
- **Transactional Rollback:** When using `bot.use(session({ store: new TgCloudSessionStore(...) }))`, mutations to `ctx.session` are held in an in-memory staging copy. Only when the handler resolves successfully are changes committed to the SQLite database. If an unhandled error occurs, staged mutations are discarded.
- **Mutex Serialization:** Rapid sequential updates from the same user are serialized through `KeyedMutex` to prevent concurrent read-modify-write conflicts.

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

When deploying with `@tgcloud/cli`:
1. Use `tgcloud diff` to inspect pending schema and code changes.
2. Run `tgcloud migrate` to apply any pending SQLite DDL migrations defined in `tgcloud/schema.js`.
3. Run `tgcloud push` to upload code and activate your handlers.

```bash
# Preview schema migrations and code diff
tgcloud diff

# Apply SQLite schema migrations
tgcloud migrate

# Deploy code and static assets
tgcloud push
```

---

## Key Considerations

- **Asynchronous DB Operations:** In `sdk/db`, database queries return Promises. Always `await` query execution (`await db.select().from(table)...`).
- **Foreign Keys:** Avoid declaring `.references()`. Instead, store related identifiers as integer columns (e.g. `integer('user_id').notNull()`) and filter with query predicates such as `eq(tasks.userId, ctx.userId)`.
