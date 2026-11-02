# Fullstack Telegram Mini App

An end-to-end Telegram Mini App with a client-side frontend served via CDN and a serverless RPC backend using **Gramless** on **Telegram Serverless (TGCloud)**.

## Architecture

- **Frontend (`public/`):** Served from Telegram's global CDN (`"static": "public"` in `tgcloud.jsonc`).
- **RPC Endpoints (`tgcloud/endpoints/`):** Serverless handlers invoked via `Telegram.WebApp.Serverless.call`. Authenticated via Telegram `initData` and validated using `v` schemas.
- **Persistence (`tgcloud/schema.js`):** Embedded SQLite database table for leaderboard entries.

## Deployment

Deploy using `@tgcloud/cli`:

```bash
# Preview changes
tgcloud diff

# Apply SQLite schema migration
tgcloud migrate

# Deploy frontend assets and backend endpoints
tgcloud push
```
