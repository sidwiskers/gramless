# What is Gramless?

**Gramless** is an ultra-fast, zero-dependency, transactional Telegram framework engineered from first principles specifically for **Telegram Serverless (TGCloud)** and isolated V8 environments.

Built with zero-allocation systems discipline, Gramless replaces raw isolate `if/else` boilerplate with constant-time routing, transactional SQLite state with automatic rollback, composable filters, full Bot API method coverage, type-safe Mini App RPC endpoints, and hermetic offline testing via **Gramless Lab**.

---

## Why Not Traditional Frameworks?

Existing bot libraries like **grammY** and **Telegraf** were designed for long-running servers. In serverless V8 isolates:
1. **Long-Polling Assumptions:** They attempt to bind persistent event loops or local HTTP listener servers that crash in ephemeral serverless workers.
2. **Heavy Dependency Bloat:** 15–40 external npm packages inflate bundle size and delay cold-starts.
3. **Session Race Conditions:** Storing sessions in memory or uncoordinated asynchronous database queries leads to dirty writes and lost updates when a user rapidly double-taps buttons.

---

## The Gramless Guarantees

| Metric / Feature | Traditional Frameworks | Gramless |
| :--- | :--- | :--- |
| **Dependencies** | 15–40 packages | **Zero (0)** |
| **Cold-Start Time** | 40ms – 180ms | **< 3ms** |
| **Command Lookup (1,000 routes)** | $O(N)$ regex scanning | **$O(1)$ Hash Map (2.44 µs)** |
| **Callback Query Dispatch** | Linear regex search | **Length-partitioned prefix trie (0.97 µs)** |
| **Session Safety** | Racy in-memory or uncoordinated DB | **ACID SQLite with automatic rollback** |
| **Mini App RPC Support** | External web server | **Built-in `createEndpoint` + `v` validator** |
| **Offline Testing** | Requires live bot token | **Gramless Lab (100% in-process)** |
