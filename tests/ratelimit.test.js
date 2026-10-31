import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, parseDuration, MemoryRateLimitStore } from '../src/ratelimit.js';
import { GramlessRouter } from '../src/router.js';

test('rateLimit: parseDuration helper parses time units accurately', () => {
  assert.equal(parseDuration(500), 500);
  assert.equal(parseDuration('500ms'), 500);
  assert.equal(parseDuration('10s'), 10000);
  assert.equal(parseDuration('1.5s'), 1500);
  assert.equal(parseDuration('2m'), 120000);
  assert.equal(parseDuration('1h'), 3600000);
  assert.equal(parseDuration('invalid'), 1000);
});

test('rateLimit: MemoryRateLimitStore tracks and enforces limits', () => {
  const store = new MemoryRateLimitStore();
  const key = 'user:123';

  // 1. Consume 3 tokens with limit 3 in 1000ms window
  const r1 = store.consume(key, 3, 1000);
  assert.equal(r1.ok, true);
  assert.equal(r1.remaining, 2);

  const r2 = store.consume(key, 3, 1000);
  assert.equal(r2.ok, true);
  assert.equal(r2.remaining, 1);

  const r3 = store.consume(key, 3, 1000);
  assert.equal(r3.ok, true);
  assert.equal(r3.remaining, 0);

  // 4th request exceeds limit
  const r4 = store.consume(key, 3, 1000);
  assert.equal(r4.ok, false);
  assert.equal(r4.remaining, 0);
  assert.ok(r4.retryAfterMs > 0);
});

test('rateLimit: router middleware blocks rapid spam and allows below limit', async () => {
  const router = new GramlessRouter();
  let executedCount = 0;
  let blockedCount = 0;

  router.use(rateLimit({
    limit: 2,
    window: '500ms',
    onLimitReached: async (ctx, info) => {
      blockedCount++;
      assert.ok(info.retryAfterMs > 0);
    },
  }));

  router.command('ping', async () => {
    executedCount++;
  });

  const user = { chat: { id: 10 }, from: { id: 10 }, text: '/ping' };

  // 1st request -> pass
  await router.handle(user);
  // 2nd request -> pass
  await router.handle(user);
  // 3rd request -> blocked
  await router.handle(user);
  // 4th request -> blocked
  await router.handle(user);

  assert.equal(executedCount, 2);
  assert.equal(blockedCount, 2);
});

test('rateLimit: skip option bypasses rate limiting for designated users', async () => {
  const router = new GramlessRouter();
  let hits = 0;

  router.use(rateLimit({
    limit: 1,
    window: '1s',
    skip: (ctx) => ctx.userId === 999, // Admin VIP
  }));

  router.command('data', async () => {
    hits++;
  });

  const vip = { chat: { id: 999 }, from: { id: 999 }, text: '/data' };

  await router.handle(vip);
  await router.handle(vip);
  await router.handle(vip);

  // VIP should never be blocked
  assert.equal(hits, 3);
});
