# What is Gramless?

**Gramless** is a zero-dependency Telegram bot framework built for **Telegram Serverless (TGCloud)**, Cloudflare Workers, and traditional Node.js servers.

It provides pre-compiled route dispatching, transactional SQLite sessions with automatic rollback, composable filters, Bot API helpers, Mini App RPC endpoints, and an in-memory testing lab.

---

## Background & Rationale

Traditional Node.js bot libraries (such as grammY and Telegraf) were designed for long-running servers with persistent processes and local `node_modules` installations.

In serverless V8 environments such as TGCloud:
1. **No Runtime Package Manager:** TGCloud isolates execute pure JavaScript modules directly and do not support `node_modules` at runtime.
2. **Server Assumptions:** Traditional frameworks rely on long-polling loops or local HTTP server bindings that are incompatible with isolated serverless handlers.
3. **Session Consistency:** Storing state in process memory or uncoordinated database writes can lead to lost updates when concurrent webhooks execute across multiple isolates.

Gramless addresses these constraints by compiling routing tables at startup, executing with zero external runtime dependencies, and managing state through atomic SQLite transactions.

---

## Comparison

| Feature | Traditional Frameworks | Gramless |
| :--- | :--- | :--- |
| **Runtime Dependencies** | 15–40 packages | **0 packages** |
| **Command Lookup (1,000 routes)** | Linear regex scan | **$O(1)$ Hash Map (2.25 µs)** |
| **Callback Query Dispatch** | Linear search | **$O(1)$ Hash Map & Prefix Index (0.92 µs)** |
| **Session Persistence** | In-memory cache or external DB | **ACID SQLite with automatic rollback** |
| **Mini App Endpoints** | External web server | **Built-in `createEndpoint` + `v` validator** |
| **Offline Testing** | Requires live bot token or mocks | **In-memory test lab (`gramless/lab`)** |
| **Supported Runtimes** | Node.js servers | **TGCloud, Cloudflare Workers, Vercel, Node.js** |
