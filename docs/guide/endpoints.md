# Mini App RPC Endpoints

Host serverless RPC functions in `tgcloud/endpoints/*.js` called directly by Telegram Mini Apps via `Telegram.WebApp.Serverless.call`.

---

## Defining Endpoints (`tgcloud/endpoints/submitScore.js`)

```javascript
import { createEndpoint, v } from 'gramless/endpoint';
import { db } from 'sdk';
import { leaderboard } from '../schema.js';

export default createEndpoint({
  requireAuth: true,
  schema: v.object({
    score: v.number({ min: 1, max: 1000000 }),
    tag: v.optional(v.string({ maxLength: 10 })),
  }),
}, async (ctx) => {
  const user = ctx.user; // Verified Telegram user from initData
  const { score } = ctx.input; // Validated payload

  await db.insert(leaderboard).values({
    tgId: user.id,
    firstName: user.first_name,
    score,
  }).run();

  return { success: true, rank: 1 };
});
```

---

## Schema Validator (`v`)

Gramless includes a sub-microsecond, zero-dependency schema validator:

- `v.string({ minLength, maxLength, pattern })`
- `v.number({ min, max })`
- `v.boolean()`
- `v.optional(schema)`
- `v.object({ [key]: schema })`
- `v.array(itemSchema)`
