import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBot,
  sleep,
  safeSetTimeout,
  safeClearTimeout,
  isIsolateRuntime,
  FloodWaitError,
  executeWithRetry,
  rateLimitGuard,
  createBatchJob,
  session,
  MemorySessionStore,
} from '../src/index.js';
import { createLab } from '../src/testkit/index.js';
import { GramlessContext } from '../src/context.js';

test('isolate: sleep resolves successfully in host environment', async () => {
  const start = Date.now();
  await sleep(25);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 20, `Expected elapsed >= 20ms, got ${elapsed}ms`);
});

test('isolate: safeSetTimeout and safeClearTimeout work normally with host timers', async () => {
  let fired = false;
  const handle = safeSetTimeout(() => {
    fired = true;
  }, 10);
  assert.ok(handle);

  await sleep(25);
  assert.equal(fired, true);

  // Test clear
  let clearFired = false;
  const clearHandle = safeSetTimeout(() => {
    clearFired = true;
  }, 20);
  safeClearTimeout(clearHandle);
  await sleep(35);
  assert.equal(clearFired, false);
});

test('isolate: functions correctly in simulated pure isolate without setTimeout', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  try {
    // Simulate isolate: remove setTimeout and clearTimeout
    // @ts-ignore
    delete globalThis.setTimeout;
    // @ts-ignore
    delete globalThis.clearTimeout;

    assert.equal(isIsolateRuntime(), true);

    // sleep should spin or use atomics without throwing ReferenceError
    const start = Date.now();
    await sleep(15);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 12, `Expected elapsed >= 12ms, got ${elapsed}ms`);

    // safeSetTimeout queues via microtask without throwing ReferenceError
    let executed = false;
    const handle = safeSetTimeout(() => {
      executed = true;
    });
    assert.ok(handle);
    assert.equal(handle.cancelled, false);

    // Wait for microtask drain
    await Promise.resolve();
    assert.equal(executed, true);

    // safeClearTimeout marks handle as cancelled
    let shouldNotExecute = false;
    const cancelledHandle = safeSetTimeout(() => {
      shouldNotExecute = true;
    });
    safeClearTimeout(cancelledHandle);
    assert.equal(cancelledHandle.cancelled, true);
    await Promise.resolve();
    assert.equal(shouldNotExecute, false);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('context: clock awareness and deadline calculation', async () => {
  const ctx = new GramlessContext(
    { message: { text: 'hello' } },
    { executionTimeoutMs: 5000 },
    null
  );

  assert.ok(ctx.startedAt > 0);
  assert.equal(ctx.executionTimeoutMs, 5000);
  assert.ok(ctx.deadline >= ctx.startedAt + 5000);
  assert.ok(ctx.elapsedMs >= 0);
  assert.ok(ctx.remainingMs() <= 5000 && ctx.remainingMs() > 4000);
  assert.equal(ctx.isTimedOut, false);
  assert.equal(ctx.hasTimeFor(1000), true);
  assert.equal(ctx.hasTimeFor(10000), false);
});

test('session: mid-execution checkpointing saves state to store', async () => {
  const store = new MemorySessionStore();
  const bot = createBot();
  bot.use(session({ store, initial: () => ({ step: 0, items: [] }) }));

  bot.command('process', async (ctx) => {
    ctx.session.step = 1;
    ctx.session.items.push('item1');
    await ctx.checkpoint(); // Persist step 1 immediately

    ctx.session.step = 2;
    ctx.session.items.push('item2');
    await ctx.checkpoint(); // Persist step 2 immediately
  });

  const lab = createLab(bot);
  const actor = lab.user(42, 'Alice');
  await actor.command('/process');

  const saved = await store.get('chat_user:42:42');
  assert.deepEqual(saved, { step: 2, items: ['item1', 'item2'] });
});

test('autoRetry: throws FloodWaitError when flood delay exceeds serverless ceiling', async () => {
  const fakeApiCall = async () => {
    const err = new Error('Too Many Requests: retry after 8');
    // @ts-ignore
    err.code = 429;
    // @ts-ignore
    err.retryAfter = 8;
    throw err;
  };

  await assert.rejects(
    async () => {
      await executeWithRetry(fakeApiCall, {
        serverless: true,
        maxServerlessDelay: 1500,
      });
    },
    (err) => {
      assert.ok(err instanceof FloodWaitError);
      assert.equal(err.code, 'FLOOD_WAIT');
      assert.equal(err.retryAfter, 8);
      assert.equal(err.retryAfterMs, 8000);
      assert.match(err.message, /8s exceeds serverless isolate ceiling/);
      return true;
    }
  );
});

test('rateLimitGuard: deflects rapid clicks with alert toast', async () => {
  const bot = createBot();
  let executedCount = 0;

  bot.action('btn_action', rateLimitGuard({ window: '1s' }), async (ctx) => {
    executedCount++;
    await ctx.reply('Action executed');
  });

  const lab = createLab(bot);
  const actor = lab.user(100, 'TestUser');

  // First click succeeds
  await actor.click('btn_action');
  assert.equal(executedCount, 1);

  // Second immediate click should be deflected by guard with answer toast
  await actor.click('btn_action');
  assert.equal(executedCount, 1); // Handler was guarded

  const outbound = lab.api.calls;
  const alertToast = outbound.find(
    (c) => c.method === 'answerCallbackQuery' && c.params?.show_alert === true
  );
  assert.ok(alertToast, 'Expected answerCallbackQuery with show_alert: true');
  assert.match(alertToast.params.text, /Please wait/);
});

test('batch: slices large item lists across continuation passes', async () => {
  const processedItems = [];
  let onProgressCalls = 0;
  let onCompleteCalls = 0;

  const job = createBatchJob({
    name: 'sync_items',
    chunkSize: 3,
    timeBudgetMs: 5000,
    processItem: async (item) => {
      processedItems.push(item);
    },
    onProgress: async (info) => {
      onProgressCalls++;
      assert.equal(info.cursor, 3);
    },
    onComplete: async (summary) => {
      onCompleteCalls++;
      assert.equal(summary.total, 5);
    },
  });

  const items = ['a', 'b', 'c', 'd', 'e'];
  const bot = createBot();
  bot.use(session({ initial: () => ({}) }));

  bot.command('start_sync', async (ctx) => {
    const res = await job.run(items, ctx);
    if (!res.completed) {
      await ctx.reply('Progress paused', {
        reply_markup: job.createContinuationMarkup(res.cursor, res.total),
      });
    }
  });

  bot.action(/^batch:sync_items:(\d+)$/, job.middleware(() => items));

  const lab = createLab(bot);
  const actor = lab.user(50, 'Bob');

  // Pass 1: processes items a, b, c (chunkSize=3), pauses
  await actor.command('/start_sync');
  assert.deepEqual(processedItems, ['a', 'b', 'c']);
  assert.equal(onProgressCalls, 1);
  assert.equal(onCompleteCalls, 0);

  // Verify continuation markup button was sent
  const outbound = lab.api.calls;
  const sentMsg = outbound.find((c) => c.method === 'sendMessage');
  assert.ok(sentMsg);
  const button = sentMsg.params.reply_markup.inline_keyboard[0][0];
  assert.equal(button.callback_data, 'batch:sync_items:3');
  assert.match(button.text, /Continue \(3\/5\)/);

  // Pass 2: user taps continuation button -> processes d, e -> completes!
  await actor.click('batch:sync_items:3');
  assert.deepEqual(processedItems, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(onCompleteCalls, 1);
});

test('router: direct dependency injection in handler', async () => {
  const bot = createBot();
  let receivedDb = null;
  let receivedTimeout = null;

  bot.command('test_di', (ctx) => {
    receivedDb = ctx.db;
    receivedTimeout = ctx.executionTimeoutMs;
  });

  const mockDb = { query: () => [] };
  const mockApi = { call: async () => ({}) };

  // Generate serverless handler with direct DI
  const serverlessHandler = bot.handler({
    api: mockApi,
    db: mockDb,
    executionTimeoutMs: 8000,
  });

  // Call serverless handler
  await serverlessHandler({
    message: {
      text: '/test_di',
      chat: { id: 123, type: 'private' },
      from: { id: 123 },
    },
  });

  assert.equal(receivedDb, mockDb);
  assert.equal(receivedTimeout, 8000);
});
