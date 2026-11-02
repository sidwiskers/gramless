# Performance & Scale Benchmarks

Reproducible benchmark metrics measured across 10,000 iterations per scenario using Node's high-resolution performance timers (`performance.now()` / `process.hrtime.bigint()`).

---

## Benchmark Results (ARM64 / Node v22)

| Scenario | Complexity / Scale | Latency (µs / op) | Throughput (ops / sec) |
| :--- | :--- | :--- | :--- |
| **Exact Action Dispatch** | 500 registered callback routes | **0.92 µs** | **1,087,209** |
| **Exact Command Dispatch** | 1,000 registered routes | **2.25 µs** | **444,131** |
| **Schema Validation (`v`)** | Multi-field object + nested constraints | **0.49 µs** | **2,023,848** |
| **Safe HTML Template (`html`)** | Tagged template literal interpolation | **1.74 µs** | **573,865** |
| **Middleware Pipeline** | 10 onion layers + route execution | **7.01 µs** | **142,666** |

---

## Architecture Comparison

| Metric | Traditional Frameworks | Gramless |
| :--- | :--- | :--- |
| **Dependencies** | 15–40 packages | **0 packages** |
| **Cold-Start Time** | 40ms – 180ms | **< 3ms** |
| **Package Size** | ~1.5 MB – 5.0 MB | **~53 KB (tarball) / ~209 KB (unpacked)** |
| **Session Isolation** | In-memory cache or async uncoordinated DB writes | **ACID SQLite with automatic rollback** |
| **Routing Algorithm** | Linear $O(N)$ middleware arrays | **$O(1)$ Hash Map & Prefix Index** |

---

## How to Reproduce

Clone the repository and run:

```bash
npm run bench
```
