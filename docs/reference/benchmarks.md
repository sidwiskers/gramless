# Performance & Scale Benchmarks

Reproducible benchmark metrics measured across 10,000 iterations per scenario using Node's high-resolution performance timers (`performance.now()` / `process.hrtime.bigint()`).

---

## Benchmark Results (ARM64 / Node v22)

| Scenario | Complexity / Scale | Latency (µs / op) | Throughput (ops / sec) |
| :--- | :--- | :--- | :--- |
| **Exact Command Dispatch** | 1,000 registered routes | **2.44 µs** | **409,792** |
| **Exact Action Dispatch** | 500 registered callback routes | **0.97 µs** | **1,031,676** |
| **Middleware Pipeline** | 10 onion layers + route execution | **7.86 µs** | **127,232** |
| **Schema Validation (`v`)** | Multi-field object + nested constraints | **0.46 µs** | **2,153,877** |

---

## Comparison to Legacy Architectures

| Metric | Traditional Frameworks (Telegraf / grammY) | Gramless |
| :--- | :--- | :--- |
| **Dependencies** | 15–40 packages | **Zero (0)** |
| **Cold-Start Time** | 40ms – 180ms | **< 3ms** |
| **Package Size** | ~1.5 MB – 5.0 MB | **< 25 KB** |
| **Session Isolation** | In-memory cache or async uncoordinated DB writes | **ACID Transactional Rollback + Mutex Concurrency** |
| **Routing Algorithm** | Linear $O(N)$ middleware arrays | **$O(1)$ Hash Map & Length-Partitioned Prefix Trie** |

---

## How to Reproduce

Clone the repository and run:

```bash
npm run bench
```
