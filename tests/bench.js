import { createBot } from '../src/index.js';
import { v } from '../src/endpoint.js';

console.log('--- Gramless Performance & Scale Benchmark ---');

// 1. Setup 1,000-command bot
const bot = createBot();
for (let i = 0; i < 1000; i++) {
  bot.command(`cmd_${i}`, async (ctx) => {
    ctx.state.val = i;
  });
}

// Setup 500 callback actions
for (let i = 0; i < 500; i++) {
  bot.action(`action_${i}`, async (ctx) => {
    ctx.state.val = i;
  });
}

// 2. Setup 10-layer middleware bot
const middlewareBot = createBot();
for (let i = 0; i < 10; i++) {
  middlewareBot.use(async (ctx, next) => {
    ctx.state[`layer_${i}`] = true;
    return next();
  });
}
middlewareBot.command('test', async (ctx) => {
  ctx.state.done = true;
});

// 3. Setup Schema Validator
const schema = v.object({
  action: v.string({ minLength: 3 }),
  amount: v.number({ min: 1, max: 1000 }),
  active: v.boolean(),
  metadata: v.optional(v.object({
    tag: v.string(),
  })),
});
const validPayload = { action: 'transfer', amount: 250, active: true, metadata: { tag: 'vip' } };

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

const mockMiddlewareMessage = {
  chat: { id: 123 },
  from: { id: 456 },
  text: '/test',
};

// Warmup
for (let i = 0; i < 100; i++) {
  await bot.handle(mockMessage);
  await bot.handle(mockCallback);
  await middlewareBot.handle(mockMiddlewareMessage);
  schema.validate(validPayload);
}

const ITERS = 10000;

// Benchmark 1: Exact Command Dispatch (1,000 routes)
let t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  await bot.handle(mockMessage);
}
let t1 = performance.now();
const cmdMicros = ((t1 - t0) / ITERS) * 1000;
const cmdOps = Math.round((ITERS / (t1 - t0)) * 1000);

// Benchmark 2: Exact Action Dispatch (500 routes)
t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  await bot.handle(mockCallback);
}
t1 = performance.now();
const actionMicros = ((t1 - t0) / ITERS) * 1000;
const actionOps = Math.round((ITERS / (t1 - t0)) * 1000);

// Benchmark 3: 10-Layer Middleware Pipeline
t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  await middlewareBot.handle(mockMiddlewareMessage);
}
t1 = performance.now();
const middlewareMicros = ((t1 - t0) / ITERS) * 1000;
const middlewareOps = Math.round((ITERS / (t1 - t0)) * 1000);

// Benchmark 4: Schema Validation Engine
const SCHEMA_ITERS = 50000;
t0 = performance.now();
for (let i = 0; i < SCHEMA_ITERS; i++) {
  schema.validate(validPayload);
}
t1 = performance.now();
const schemaMicros = ((t1 - t0) / SCHEMA_ITERS) * 1000;
const schemaOps = Math.round((SCHEMA_ITERS / (t1 - t0)) * 1000);

console.log(`[Results across ${ITERS.toLocaleString()} iterations]`);
console.log(`• Exact Command Dispatch (1,000 routes):  ${cmdMicros.toFixed(2)} µs / op  (${cmdOps.toLocaleString()} ops/sec)`);
console.log(`• Exact Action Dispatch  (500 routes):    ${actionMicros.toFixed(2)} µs / op  (${actionOps.toLocaleString()} ops/sec)`);
console.log(`• 10-Layer Middleware Pipeline:           ${middlewareMicros.toFixed(2)} µs / op  (${middlewareOps.toLocaleString()} ops/sec)`);
console.log(`• Schema Validation Engine (v):           ${schemaMicros.toFixed(2)} µs / op  (${schemaOps.toLocaleString()} ops/sec)`);
console.log('----------------------------------------------');
