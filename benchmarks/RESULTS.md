# Gramless Performance & Scale Benchmarks

This document records reproducible performance and scale benchmarks for **Gramless**.

All measurements are conducted using Node.js's high-resolution performance timers (`performance.now()` / `process.hrtime.bigint()`) across 10,000 iterations per scenario following a warm-up phase to trigger V8 TurboFan tier-up compilation.

---

## 1. Test Environment

- **Architecture:** ARM64 (`aarch64` / ARMv8.1-A+)
- **Runtime:** Node.js v22 (ECMAScript 2024 Modules)
- **Engine:** Google V8 v12+
- **Operating System:** Linux 6.1 (Android userspace sandbox)

---

## 2. Benchmark Results

| Scenario | Complexity / Scale | Latency (µs / op) | Throughput (ops / sec) |
| :--- | :--- | :--- | :--- |
| **Exact Command Dispatch** | 1,000 registered routes | **2.44 µs** | **409,792** |
| **Exact Action Dispatch** | 500 registered callback routes | **0.97 µs** | **1,031,676** |
| **Middleware Pipeline** | 10 onion layers + route execution | **7.86 µs** | **127,232** |
| **Schema Validation (`v`)** | Multi-field object + nested constraints | **0.46 µs** | **2,153,877** |

---

## 3. Comparative Architecture Analysis

| Metric | Traditional Frameworks (Telegraf / grammY) | Gramless |
| :--- | :--- | :--- |
| **Dependencies** | 15–40 packages (`node_modules` bloat) | **Zero (0)** |
| **Cold-Start Time** | 40ms – 180ms | **< 3ms** |
| **Unpacked Package Size** | ~1.5 MB – 5.0 MB | **< 25 KB** |
| **Session Isolation** | In-memory cache or async uncoordinated DB writes | **ACID Transactional Rollback + Mutex Concurrency** |
| **Routing Algorithm** | Linear $O(N)$ middleware arrays | **$O(1)$ Hash Map & Length-Partitioned Prefix Trie** |
| **Mini App RPC Support** | Unofficial external plugins | **Native `createEndpoint` + `v` validator** |

---

## 4. How to Reproduce

Clone the repository and run:

```bash
npm run bench
```
