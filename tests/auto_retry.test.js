import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWithRetry, autoRetry } from '../src/auto_retry.js';
import { GramlessRouter } from '../src/router.js';

test('autoRetry: resolves immediately when call succeeds', async () => {
  let callCount = 0;
  const result = await executeWithRetry(async () => {
    callCount++;
    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(callCount, 1);
});

test('autoRetry: retries on 429 flood wait and succeeds', async () => {
  let attempts = 0;
  const retriesRecorded = [];

  const fakeApiCall = async () => {
    attempts++;
    if (attempts === 1) {
      const err = new Error('Too Many Requests');
      err.code = 429;
      err.retryAfter = 0.05; // 50ms in seconds
      throw err;
    }
    return { message_id: 99 };
  };

  const result = await executeWithRetry(fakeApiCall, {
    maxRetries: 2,
    maxDelay: 5000,
    onRetry: (info) => retriesRecorded.push(info),
  });

  assert.equal(result.message_id, 99);
  assert.equal(attempts, 2);
  assert.equal(retriesRecorded.length, 1);
  assert.equal(retriesRecorded[0].attempt, 1);
  assert.equal(retriesRecorded[0].retryAfter, 0.05);
});

test('autoRetry: throws non-429 errors without retrying', async () => {
  let attempts = 0;
  const nonFloodCall = async () => {
    attempts++;
    const err = new Error('Bad Request: chat not found');
    err.code = 400;
    throw err;
  };

  await assert.rejects(async () => {
    await executeWithRetry(nonFloodCall, { maxRetries: 3 });
  }, /Bad Request: chat not found/);

  assert.equal(attempts, 1); // No retries for 400
});

test('autoRetry: middleware automatically intercepts ctx.call', async () => {
  const router = new GramlessRouter();
  let calls = 0;

  const mockApi = {
    async sendMessage() {
      calls++;
      if (calls === 1) {
        const err = new Error('Flood control');
        err.code = 429;
        err.retryAfter = 0.02; // 20ms
        throw err;
      }
      return { message_id: 101 };
    },
  };

  router.use(autoRetry({ maxRetries: 2, maxDelay: 1000 }));

  router.command('send', async (ctx) => {
    const res = await ctx.reply('Test message');
    assert.equal(res.message_id, 101);
  });

  await router.handle({ chat: { id: 1 }, text: '/send' }, {}, mockApi);
  assert.equal(calls, 2);
});
