import test from 'node:test';
import assert from 'node:assert/strict';
import { GramlessRouter, parseCommand, composeMiddleware } from '../src/router.js';

test('parseCommand: parses clean command and payload variations', () => {
  assert.deepEqual(parseCommand('/start'), { command: 'start', targetBot: null, payload: '', args: [] });
  assert.deepEqual(parseCommand('/START'), { command: 'start', targetBot: null, payload: '', args: [] });
  assert.deepEqual(parseCommand('/start ref_123'), { command: 'start', targetBot: null, payload: 'ref_123', args: ['ref_123'] });
  assert.deepEqual(parseCommand('/help@GramlessBot details 42'), { command: 'help', targetBot: 'gramlessbot', payload: 'details 42', args: ['details', '42'] });
  assert.equal(parseCommand('hello world'), null);
  assert.equal(parseCommand(''), null);
});

test('composeMiddleware: executes in onion order and handles next()', async () => {
  const trace = [];

  const m1 = async (ctx, next) => {
    trace.push('m1_enter');
    await next();
    trace.push('m1_exit');
  };

  const m2 = async (ctx, next) => {
    trace.push('m2_enter');
    await next();
    trace.push('m2_exit');
  };

  const handler = async (ctx) => {
    trace.push('handler');
    ctx.done = true;
  };

  const pipeline = composeMiddleware([m1, m2], handler);
  const fakeCtx = {};
  await pipeline(fakeCtx);

  assert.deepEqual(trace, ['m1_enter', 'm2_enter', 'handler', 'm2_exit', 'm1_exit']);
  assert.equal(fakeCtx.done, true);
});

test('GramlessRouter: exact command dispatch and argument extraction', async () => {
  const router = new GramlessRouter();
  let executed = false;
  let receivedPayload = null;

  router.command('settings', async (ctx) => {
    executed = true;
    receivedPayload = ctx.match[1];
  });

  const message = {
    chat: { id: 101 },
    from: { id: 501 },
    text: '/settings dark_mode',
  };

  const result = await router.handle(message);
  assert.equal(result, true);
  assert.equal(executed, true);
  assert.equal(receivedPayload, 'dark_mode');
});

test('GramlessRouter: callback query routing (exact, prefix, and regex)', async () => {
  const router = new GramlessRouter();
  const matched = [];

  router.action('refresh', async (ctx) => {
    matched.push('exact_refresh');
  });

  router.action('item:*', async (ctx) => {
    matched.push(`prefix_item:${ctx.match[1]}`);
  });

  router.action(/^user:(\d+):view$/, async (ctx) => {
    matched.push(`regex_user:${ctx.match[1]}`);
  });

  // 1. Exact
  await router.handle({ data: 'refresh', from: { id: 1 } });
  // 2. Prefix
  await router.handle({ data: 'item:sku_999', from: { id: 1 } });
  // 3. Regex
  await router.handle({ data: 'user:42:view', from: { id: 1 } });

  assert.deepEqual(matched, [
    'exact_refresh',
    'prefix_item:sku_999',
    'regex_user:42',
  ]);
});

test('GramlessRouter: nested groups and filter conditions', async () => {
  const router = new GramlessRouter();
  const events = [];

  const privateGroup = router.group(ctx => ctx.isPrivate);
  privateGroup.command('profile', async (ctx) => {
    events.push('private_profile');
  });

  // 1. Group message (should be rejected by privateGroup)
  const groupMsg = {
    chat: { id: -999, type: 'supergroup' },
    from: { id: 12 },
    text: '/profile',
  };
  const res1 = await router.handle(groupMsg);
  assert.equal(res1, false);
  assert.equal(events.length, 0);

  // 2. Private message (should pass)
  const privateMsg = {
    chat: { id: 12, type: 'private' },
    from: { id: 12 },
    text: '/profile',
  };
  const res2 = await router.handle(privateMsg);
  assert.equal(res2, true);
  assert.deepEqual(events, ['private_profile']);
});

test('GramlessRouter: global error hook (onError)', async () => {
  let capturedError = null;
  const router = new GramlessRouter({
    onError: (err, ctx) => {
      capturedError = err;
    },
  });

  router.command('crash', async () => {
    throw new Error('Database connection failed');
  });

  const res = await router.handle({
    chat: { id: 1 },
    from: { id: 1 },
    text: '/crash',
  });

  assert.equal(res, true); // handled by onError
  assert.ok(capturedError);
  assert.equal(capturedError.message, 'Database connection failed');
});

test('GramlessRouter: scale benchmark (1,000 registered routes)', async () => {
  const router = new GramlessRouter();

  // Register 1,000 distinct commands
  for (let i = 0; i < 1000; i++) {
    router.command(`cmd_${i}`, async (ctx) => {
      ctx.state.hit = i;
    });
  }

  const testMessage = {
    chat: { id: 777 },
    from: { id: 888 },
    text: '/cmd_742 payload_data',
  };

  // Warm-up JIT
  for (let i = 0; i < 20; i++) {
    await router.handle(testMessage);
  }

  const iterations = 500;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await router.handle(testMessage);
  }
  const duration = performance.now() - start;
  const avgMicroseconds = (duration / iterations) * 1000;

  // Hermes benchmark standard: $O(1)$ dispatch on mobile ARM resolves in microseconds
  assert.ok(avgMicroseconds < 250, `Average dispatch took ${avgMicroseconds.toFixed(2)}µs, expected < 250µs`);
});
