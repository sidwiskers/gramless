# Telegram Serverless Bot (TGCloud)

Production-ready Telegram Serverless bot demonstrating constant-time $O(1)$ routing, transactional SQLite sessions, and single-line handler re-exports on **Telegram Serverless (TGCloud)** with **Gramless**.

## Project Layout

```text
tgcloud-serverless/
├── tgcloud/
│   ├── schema.js               # SQLite table definitions
│   ├── handlers/
│   │   ├── message.js          # Ingress for text and media updates
│   │   └── callback_query.js   # Ingress for inline keyboard buttons
│   └── lib/
│       └── bot.js              # Central bot routing & transactional session
├── package.json
└── tgcloud.jsonc
```

## Deployment

Deploy using the official `@tgcloud/cli`:

```bash
# Preview diff against cloud
tgcloud diff

# Apply pending SQLite schema migrations
tgcloud migrate

# Deploy code and activate handlers
tgcloud push
```
