# Recipe 04: Fullstack Mini App RPC & WebApp Integration

This recipe shows how to build an end-to-end Telegram Mini App where a client-side frontend calls serverless backend endpoints via `Telegram.WebApp.Serverless.call`, verified and validated using **Gramless Endpoint** (`createEndpoint`).

---

## Architectural Problem: WebApp Authentication & Validation

Building Mini Apps on standard hosting (Node/Express/Next.js) requires:
1. Setting up external domains, SSL certs, and CORS configurations.
2. Manually parsing and hashing the raw `initData` string with your bot token to verify that the user ID wasn't spoofed by a client-side attacker.
3. Installing heavy validation libraries (Zod, Joi, Yup) that balloon cold-start times.

### The Gramless & TGCloud Solution
- **Zero-Config Hosting:** By setting `"static": "public"` in `tgcloud.jsonc`, your HTML/CSS/JS frontend is served directly from Telegram's global CDN with automatic SSL and zero server maintenance.
- **Built-in Cryptographic Identity:** TGCloud's runtime verifies caller credentials before passing execution to your isolate. `createEndpoint({ requireAuth: true })` automatically extracts the verified user and attaches it to `ctx.user`.
- **Built-in Schema Validation:** Gramless includes `v` (`v.string()`, `v.number()`, `v.boolean()`, `v.object()`) for validating incoming payloads without external dependencies.

---

## Directory Structure

```text
04-mini-app-rpc/
├── public/                     # Static files served on Telegram CDN
│   ├── index.html
│   └── app.js                  # Frontend calling Telegram.WebApp.Serverless.call
├── tgcloud/
│   ├── schema.js               # SQLite leaderboard table
│   ├── endpoints/              # Flat directory of RPC endpoints
│   │   ├── getLeaderboard.js
│   │   └── submitScore.js
│   └── handlers/
│       └── message.js          # Bot command to launch Mini App
├── package.json
└── tgcloud.jsonc
```

---

## Backend Endpoint Definition (`tgcloud/endpoints/submitScore.js`)

```javascript
import { createEndpoint, v } from 'gramless/endpoint';
import { db } from 'sdk';
import { sql } from 'sdk/db';
import { leaderboard } from '../schema.js';

export default createEndpoint({
  requireAuth: true,
  schema: v.object({
    score: v.number({ min: 1, max: 1000000 }),
  }),
}, async (ctx) => {
  const user = ctx.user; // Verified Telegram user
  const { score } = ctx.input; // Guaranteed valid number

  await db.insert(leaderboard).values({
    tgId: user.id,
    firstName: user.first_name,
    score,
  }).run();

  return { success: true, score };
});
```

---

## Frontend Invocation (`public/app.js`)

```javascript
// Invoking serverless RPC from the Mini App
const result = await Telegram.WebApp.Serverless.call('submitScore', {
  score: 1500,
});

console.log('Server response:', result);
```

---

## Rules That Bite

- **Endpoints Must Be in a Flat Directory:** All RPC endpoint files must reside directly in `tgcloud/endpoints/` (e.g. `tgcloud/endpoints/submitScore.js`). Subdirectories inside `endpoints/` are not supported by the TGCloud router.
- **Verified Caller Identity:** In raw TGCloud, the authenticated user is located at `ctx.initData.user`. Gramless's `createEndpoint` automatically unwraps this onto `ctx.user` for convenience.
