# create-gramless

Scaffold a production Telegram bot with **Gramless** in seconds.

## Usage

Interactive scaffolding:

```bash
# With npm
npm create gramless@latest

# With pnpm
pnpm create gramless

# With yarn
yarn create gramless

# With bun
bun create gramless
```

Or pass project name and template flag directly:

```bash
npm create gramless my-bot -- --template tgcloud
```

## Available Templates

| Template | Description |
| :--- | :--- |
| `tgcloud` | **Telegram Serverless (TGCloud):** Single-line handler exports, V8 edge isolates, and transactional SQLite sessions. |
| `cloudflare` | **Cloudflare Workers:** Zero-dependency edge isolate export using `bot.fetch`. |
| `polling` | **Node.js Long Polling:** Standalone persistent daemon using `bot.start()` with automatic backoff and signal handling. |
| `mini-app` | **Telegram Mini App (Fullstack):** Static CDN frontend with serverless RPC backend endpoints and schema validation (`v`). |

## Documentation

Full documentation, guides, and API specifications:
https://sidwiskers.github.io/gramless/

## License

MIT © sidwiskers
