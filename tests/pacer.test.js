import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChatPacer, wrapPacer, pacer } from '../src/pacer.js';

describe('gramless/pacer: Proactive Per-Chat Flood Control', () => {
  it('spaces successive calls to the same chat by minChatIntervalMs', async () => {
    // Use 50ms interval for fast deterministic unit testing
    const pacerEngine = new ChatPacer({ minChatIntervalMs: 50 });
    const timestamps = [];

    const mockApi = {
      call: async (method, params) => {
        timestamps.push(Date.now());
        return { ok: true, message_id: timestamps.length };
      },
    };

    const pacedApi = pacerEngine.wrapApi(mockApi);

    // Dispatch 3 calls to the same chat concurrently
    const [r1, r2, r3] = await Promise.all([
      pacedApi.call('sendMessage', { chat_id: 123, text: 'First' }),
      pacedApi.call('sendMessage', { chat_id: 123, text: 'Second' }),
      pacedApi.call('sendMessage', { chat_id: 123, text: 'Third' }),
    ]);

    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(r3.ok, true);
    assert.equal(timestamps.length, 3);

    // Delta between first and second must be >= 45ms
    const delta1 = timestamps[1] - timestamps[0];
    const delta2 = timestamps[2] - timestamps[1];

    assert.ok(delta1 >= 40, `Expected delta1 >= 40ms, got ${delta1}ms`);
    assert.ok(delta2 >= 40, `Expected delta2 >= 40ms, got ${delta2}ms`);
  });

  it('allows calls to different chats to execute without blocking each other', async () => {
    const pacerEngine = new ChatPacer({ minChatIntervalMs: 80 });
    const timestamps = {};

    const mockApi = {
      call: async (method, params) => {
        timestamps[params.chat_id] = Date.now();
        return { ok: true };
      },
    };

    const pacedApi = pacerEngine.wrapApi(mockApi);

    // Dispatch calls to two different chats simultaneously
    await Promise.all([
      pacedApi.call('sendMessage', { chat_id: 'chat_A', text: 'Hello A' }),
      pacedApi.call('sendMessage', { chat_id: 'chat_B', text: 'Hello B' }),
    ]);

    // Both should have executed immediately in parallel
    const diff = Math.abs(timestamps['chat_A'] - timestamps['chat_B']);
    assert.ok(diff < 40, `Expected chats A and B to run in parallel, diff was ${diff}ms`);
  });

  it('bypasses non-paced methods immediately', async () => {
    const pacerEngine = new ChatPacer({ minChatIntervalMs: 200 });
    let called = false;

    const mockApi = {
      call: async (method, params) => {
        called = true;
        return { ok: true, result: { id: 1, is_bot: true } };
      },
    };

    const pacedApi = pacerEngine.wrapApi(mockApi);
    const start = Date.now();
    await pacedApi.call('getMe', {});
    const elapsed = Date.now() - start;

    assert.equal(called, true);
    assert.ok(elapsed < 50, `getMe should execute without pacing delay, took ${elapsed}ms`);
  });

  it('cleans up queue entries from memory after draining', async () => {
    const pacerEngine = new ChatPacer({ minChatIntervalMs: 10 });
    const mockApi = {
      call: async () => ({ ok: true }),
    };

    const pacedApi = pacerEngine.wrapApi(mockApi);
    await pacedApi.call('sendMessage', { chat_id: 'temp_chat', text: 'Bye' });

    // Allow draining loop to finalize
    await new Promise((r) => setTimeout(r, 20));

    // Queue entry for temp_chat must be deleted
    assert.equal(pacerEngine.queues.has('temp_chat'), false);
  });

  it('middleware wraps ctx.api transparently', async () => {
    const middleware = pacer({ minChatIntervalMs: 20 });
    let apiCalled = false;

    const ctx = {
      api: {
        call: async () => {
          apiCalled = true;
          return { ok: true };
        },
      },
    };

    let nextCalled = false;
    await middleware(ctx, async () => {
      nextCalled = true;
      await ctx.api.call('sendMessage', { chat_id: 555, text: 'Hi' });
    });

    assert.equal(nextCalled, true);
    assert.equal(apiCalled, true);
  });
});
