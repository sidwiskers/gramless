# Recipe 04: Fullstack Mini App RPC & WebApp Integration

This recipe shows how to build an end-to-end Telegram Mini App where a client-side frontend calls serverless backend endpoints via `Telegram.WebApp.Serverless.call`, verified and validated using **Gramless Endpoint** (`createEndpoint`).

---

## Overview: Mini App Architecture & Authentication

Building Telegram Mini Apps with serverless backends involves:
1. Serving static assets (HTML/CSS/JS) securely via CDN.
2. Authenticating incoming client requests by validating Telegram `initData`.
3. Validating payload structures before passing them to database and business logic.

### Gramless & TGCloud Integration
- **Static Hosting:** Setting `"static": "public"` in `tgcloud.jsonc` serves frontend assets directly from Telegram's CDN with HTTPS enabled.
- **Caller Identity:** TGCloud validates caller signatures before invoking your isolate. Setting `createEndpoint({ requireAuth: true })` ensures that only authenticated requests reach the handler, attaching verified user data to `ctx.user`.
- **Schema Validation:** Gramless includes lightweight schema validators (`v.string()`, `v.number()`, `v.boolean()`, `v.object()`) for runtime payload validation without external dependencies.

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
// Invoking serverless RPC from the Mini App via callback
Telegram.WebApp.Serverless.call('submitScore', { score: 1500 }, (err, result) => {
  if (err) {
    console.error('Call failed:', err);
    return;
  }
  console.log('Server response:', result);
});

// Or using an asynchronous Promise wrapper:
const callEndpoint = (name, payload) =>
  new Promise((resolve, reject) => {
    Telegram.WebApp.Serverless.call(name, payload, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });

const result = await callEndpoint('submitScore', { score: 1500 });
console.log('Server response:', result);
```

---

## Key Considerations

- **Flat Endpoint Hierarchy:** Endpoint files must reside directly in `tgcloud/endpoints/` (e.g. `tgcloud/endpoints/submitScore.js`). Nested subdirectories inside `endpoints/` are not supported.
- **Verified Caller Identity:** In the raw platform context, verified user information is located at `ctx.initData.user`. Gramless provides access directly on `ctx.user`.
