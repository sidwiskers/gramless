import { createBot } from '../src/index.js';

console.log('--- Gramless Performance & Scale Benchmark ---');

const bot = createBot();

// Register 1,000 distinct commands
for (let i = 0; i < 1000; i++) {
  bot.command(`cmd_${i}`, async (ctx) => {
    ctx.state.val = i;
  });
}

// Register 500 callback actions
for (let i = 0; i < 500; i++) {
  bot.action(`action_${i}`, async (ctx) => {
    ctx.state.val = i;
  });
}

const mockMessage = {
  chat: { id: 123 },
  from: { id: 456 },
  text: '/cmd_999 benchmark_payload',
};

const mockCallback = {
  id: 'cb_1',
  from: { id: 456 },
  data: 'action_499',
};

// Warmup
for (let i = 0; i < 100; i++) {
  await bot.handle(mockMessage);
  await bot.handle(mockCallback);
}

// 1. Measure 1,000-route Command Dispatch
const ITERS = 10000;
let t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  await bot.handle(mockMessage);
}
let t1 = performance.now();
let cmdMicros = ((t1 - t0) / ITERS) * 1000;

// 2. Measure 500-route Callback Dispatch
t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  await bot.handle(mockCallback);
}
t1 = performance.now();
let actionMicros = ((t1 - t0) / ITERS) * 1000;

console.log(`[Results across ${ITERS.toLocaleString()} iterations]`);
console.log(`• Exact Command Dispatch (1,000 routes):  ${cmdMicros.toFixed(2)} µs / op`);
console.log(`• Exact Action Dispatch  (500 routes):    ${actionMicros.toFixed(2)} µs / op`);
console.log('----------------------------------------------');
