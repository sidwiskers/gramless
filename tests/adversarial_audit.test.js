import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

import {
  createBot,
  ApiError,
  isParseEntityError,
  SessionKey,
  RateLimitKey,
  rateLimit,
  MemoryRateLimitStore,
  SessionConflictError,
  MemorySessionStore,
  session,
  ChatPacer,
  mediaGroup,
  createDeepLinkRouter,
  createFSM,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('BUG-01 & BUG-02: Bundler regexes do not corrupt intermediate code or strings', () => {
  const distFile = path.join(rootDir, 'dist', 'gramless.js');
  assert.ok(fs.existsSync(distFile), 'dist/gramless.js must exist');
  const bundle = fs.readFileSync(distFile, 'utf8');

  // Verify that code from errors, router, etc. is intact
  assert.ok(bundle.includes('class ApiError extends GramlessError'), 'ApiError exists in bundle');
  assert.ok(bundle.includes('class GramlessRouter'), 'GramlessRouter exists in bundle');
  assert.ok(bundle.includes('export function createBot'), 'createBot entrypoint exists in bundle');
  assert.ok(bundle.includes('export default createBot'), 'default export exists in bundle');

  // Ensure no unstripped local relative code imports remain
  assert.equal(/^import\s+.*?from\s+['"]\.\/.*['"];?/m.test(bundle), false, 'No relative code imports should remain');
});

test('SPEC-15: Standalone types definition dist/gramless.d.ts exists', () => {
  const dtsFile = path.join(rootDir, 'dist', 'gramless.d.ts');
  assert.ok(fs.existsSync(dtsFile), 'dist/gramless.d.ts must exist');
  const content = fs.readFileSync(dtsFile, 'utf8');
  assert.ok(content.includes('export class GramlessRouter'), 'GramlessRouter typed');
});

test('BUG-03: ApiError redacts bot tokens in description and details.description', () => {
  const secretToken = 'bot123456789:AAFlkjhsdf89234jsdf_';
  const rawDesc = `Bad Request: telegram token ${secretToken} leaked in API error response`;
  const err = new ApiError('sendMessage', rawDesc, 400);

  assert.ok(!err.message.includes(secretToken), 'Message should not leak token');
  assert.ok(!err.description.includes(secretToken), 'Description property should not leak token');
  assert.ok(!JSON.stringify(err.details).includes(secretToken), 'details JSON should not leak token');
  assert.ok(err.description.includes('bot[REDACTED]'), 'Redaction placeholder must be present');
});

test('BUG-04: ApiError distinguishes entity parsing errors from media restricted errors', () => {
  const parseDesc = "Bad Request: can't parse entities in photo caption: Can't find end tag";
  const err = new ApiError('sendPhoto', parseDesc, 400);

  assert.equal(err.isParseEntityError, true, 'Should be flagged as parse entity error');
  assert.equal(err.isMediaRestricted, false, 'Should NOT be classified as media restricted');
  assert.equal(err.category, 'PARSE_ENTITY_ERROR', 'Category must be PARSE_ENTITY_ERROR');
  assert.equal(isParseEntityError(err), true, 'isParseEntityError helper must return true');

  const mediaDesc = 'Bad Request: wrong file identifier/HTTP URL specified';
  const mediaErr = new ApiError('sendPhoto', mediaDesc, 400);
  assert.equal(mediaErr.isMediaRestricted, true, 'Real media error must be MEDIA_RESTRICTED');
  assert.equal(mediaErr.category, 'MEDIA_RESTRICTED');
});

test('BUG-05: mediaGroup middleware rejects all waiters if downstream handler throws', async () => {
  const mgMiddleware = mediaGroup({ timeout: 20 });
  const errorToThrow = new Error('Database write failed during album processing');

  let callCount = 0;
  const failingNext = async () => {
    callCount++;
    throw errorToThrow;
  };

  const ctx1 = { raw: { media_group_id: 'album_123', message_id: 1 } };
  const ctx2 = { raw: { media_group_id: 'album_123', message_id: 2 } };

  const p1 = mgMiddleware(ctx1, failingNext);
  const p2 = mgMiddleware(ctx2, failingNext);

  await assert.rejects(p1, (err) => err === errorToThrow, 'First waiter must reject with error');
  await assert.rejects(p2, (err) => err === errorToThrow, 'Second waiter must reject with error');
  assert.equal(callCount, 1, 'failingNext should only be called once for the batch');
});

test('BUG-06: SessionKey and RateLimitKey handle numeric ID 0 correctly', () => {
  const ctx = { userId: 0, chatId: 0 };
  assert.equal(SessionKey.byUser(ctx), 'user:0');
  assert.equal(SessionKey.byChat(ctx), 'chat:0');
  assert.equal(SessionKey.byChatUser(ctx), 'chat_user:0:0');

  assert.equal(RateLimitKey.byUser(ctx), 'user:0');
  assert.equal(RateLimitKey.byChat(ctx), 'chat:0');
  assert.equal(RateLimitKey.byChatUser(ctx), 'chat_user:0:0');
});

test('BUG-06: MemorySessionStore safely clones complex objects without destroying state', async () => {
  const store = new MemorySessionStore();
  const testDate = new Date('2026-01-01T00:00:00.000Z');
  const complexData = {
    date: testDate,
    set: new Set([1, 2, 3]),
    count: 42,
  };

  await store.set('user:1', complexData);
  const retrieved = await store.get('user:1');

  assert.equal(retrieved.count, 42);
  assert.equal(retrieved.date instanceof Date, true);
  assert.equal(retrieved.date.toISOString(), testDate.toISOString());
});

test('BUG-07: Optimistic concurrency control throws SessionConflictError on version mismatch', async () => {
  const store = new MemorySessionStore();
  await store.set('user:test', { balance: 100 });

  // Update with expectedVersion 1 (which matches initial version 1)
  await store.set('user:test', { balance: 150 }, { expectedVersion: 1 });

  // Concurrent update attempting with stale expectedVersion 1 should fail
  await assert.rejects(
    async () => {
      await store.set('user:test', { balance: 200 }, { expectedVersion: 1 });
    },
    (err) => err instanceof SessionConflictError,
    'Must throw SessionConflictError on version mismatch'
  );
});

test('BUG-08: ChatPacer enforces maxConcurrent semaphore limit', async () => {
  const pacer = new ChatPacer({
    minChatIntervalMs: 5,
    minPrivateChatIntervalMs: 5,
    maxConcurrent: 2,
    globalLimitPerSec: 100,
  });

  let running = 0;
  let maxObservedRunning = 0;

  const mockApiCall = async () => {
    running++;
    maxObservedRunning = Math.max(maxObservedRunning, running);
    await new Promise((r) => setTimeout(r, 25));
    running--;
    return true;
  };

  // Launch 5 concurrent calls across different chats
  const promises = [
    pacer.enqueue('chat_1', mockApiCall),
    pacer.enqueue('chat_2', mockApiCall),
    pacer.enqueue('chat_3', mockApiCall),
    pacer.enqueue('chat_4', mockApiCall),
    pacer.enqueue('chat_5', mockApiCall),
  ];

  await Promise.all(promises);
  assert.ok(maxObservedRunning <= 2, `Max running should not exceed 2, got: ${maxObservedRunning}`);
});

test('BUG-08: ChatPacer retains spacing across sequential queue drains', async () => {
  const pacer = new ChatPacer({
    minPrivateChatIntervalMs: 60,
    globalLimitPerSec: 100,
  });

  const t0 = Date.now();
  await pacer.enqueue(101, async () => 'first');
  const t1 = Date.now();

  // Enqueue immediately after first call finished and drained
  await pacer.enqueue(101, async () => 'second');
  const t2 = Date.now();

  const diff = t2 - t1;
  assert.ok(diff >= 50, `Second call should wait for minInterval, elapsed: ${diff}ms`);
});

test('BUG-09: rateLimit onLimitReached uses ctx.reply for text messages', async () => {
  const limiter = rateLimit({
    limit: 1,
    window: '1s',
    key: () => 'single_user',
  });

  let replyMessage = '';
  let answerCalled = false;

  const textCtx = {
    userId: 123,
    data: undefined, // Normal text update has undefined data
    reply: async (msg) => { replyMessage = msg; },
    answer: async () => { answerCalled = true; },
  };

  await limiter(textCtx, async () => {});
  // Second call exceeds limit
  await limiter(textCtx, async () => {});

  assert.equal(answerCalled, false, 'ctx.answer must NOT be called on text messages');
  assert.ok(replyMessage.includes('Slow down'), 'ctx.reply must be used for text rate limits');
});

test('BUG-10: router prefix action matches longer specific prefix before general prefix', async () => {
  const bot = createBot();
  let matchedRoute = '';

  // Register general prefix first
  bot.action('shop:*', async (ctx) => {
    matchedRoute = 'general_shop';
  });

  // Register more specific prefix second
  bot.action('shop:checkout:*', async (ctx) => {
    matchedRoute = 'specific_checkout';
  });

  const ctx = {
    data: 'shop:checkout:confirm',
    update_id: 1,
  };

  await bot.handle(ctx);
  assert.equal(matchedRoute, 'specific_checkout', 'Longer prefix must take precedence');
});

test('BUG-11: webhookCallback handles stringified body and invalid stream body', async () => {
  const bot = createBot();
  let executed = false;
  bot.command('test', async (ctx) => {
    executed = true;
  });

  const handler = bot.webhookCallback();

  // 1. Pre-parsed string body (from raw body parsers)
  const reqMock = {
    method: 'POST',
    body: JSON.stringify({ message: { text: '/test', chat: { id: 1 }, from: { id: 1 } } }),
    headers: {},
  };
  let responseStatus = 0;
  const resMock = {
    status: (s) => ({ send: (msg) => { responseStatus = s; } }),
  };

  await handler(reqMock, resMock);
  assert.equal(executed, true, 'Handler should execute from parsed string body');
  assert.equal(responseStatus, 200);

  // 2. Malformed JSON stream body returns 400
  const malformedReq = new (await import('node:stream')).Readable({
    read() {
      this.push('{"not-valid-json":');
      this.push(null);
    },
  });
  malformedReq.method = 'POST';
  malformedReq.headers = {};

  let badStatus = 0;
  let badMsg = '';
  const badRes = {
    status: (s) => ({ send: (msg) => { badStatus = s; badMsg = msg; } }),
  };

  await handler(malformedReq, badRes);
  assert.equal(badStatus, 400, 'Invalid JSON body must return 400 Bad Request');
});

test('BUG-12: DeepLinkRouter matches parameters containing underscores and calls next', async () => {
  const router = createDeepLinkRouter();
  let capturedId = '';
  let nextCalled = false;

  router.on('ref_:id', async (ctx, next) => {
    capturedId = ctx.deepLink.params.id;
    if (next) await next();
  });

  const ctx = {
    text: '/start ref_autumn_campaign_2026',
    params: {},
  };

  await router.middleware()(ctx, async () => {
    nextCalled = true;
  });

  assert.equal(capturedId, 'autumn_campaign_2026', 'Parameter with underscores must be captured');
  assert.equal(nextCalled, true, 'next() must be called when handler passes downstream');
});

test('SPEC-13 & SPEC-14: bot.compile() pre-compiles pipeline and README has 10.4 badge', () => {
  const bot = createBot();
  bot.use(async (ctx, next) => next());
  bot.compile();
  assert.equal(bot._isCompiled, true, 'bot._isCompiled must be true after compile()');

  const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  assert.ok(readme.includes('Telegram%20Bot%20API-10.4%20ready'), 'README must have 10.4 Bot API badge');
});
