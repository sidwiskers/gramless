import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/index.js';

describe('Universal Web Standards Fetch & Webhook Adapter (bot.fetch)', () => {
  it('rejects non-POST requests with 405 Method Not Allowed', async () => {
    const bot = createBot();
    const fetchHandler = bot.fetch();

    const req = new Request('https://example.com/webhook', { method: 'GET' });
    const res = await fetchHandler(req);

    assert.equal(res.status, 405);
    assert.equal(res.headers.get('Allow'), 'POST');
  });

  it('enforces timing-safe secret token verification', async () => {
    const bot = createBot();
    const fetchHandler = bot.fetch({ secretToken: 'super-secret-token-123' });

    // 1. Missing header
    const req1 = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 1 }),
    });
    const res1 = await fetchHandler(req1);
    assert.equal(res1.status, 401);

    // 2. Invalid header
    const req2 = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'wrong-token',
      },
      body: JSON.stringify({ update_id: 1 }),
    });
    const res2 = await fetchHandler(req2);
    assert.equal(res2.status, 401);

    // 3. Valid header
    const req3 = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'super-secret-token-123',
      },
      body: JSON.stringify({ update_id: 1, message: { text: '/start' } }),
    });
    const res3 = await fetchHandler(req3);
    assert.equal(res3.status, 200);
    assert.equal(await res3.text(), 'OK');
  });

  it('rejects invalid JSON payloads with 400 Bad Request', async () => {
    const bot = createBot();
    const fetchHandler = bot.fetch();

    const req = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json{',
    });
    const res = await fetchHandler(req);

    assert.equal(res.status, 400);
  });

  it('executes bot routes and returns 200 OK', async () => {
    const bot = createBot();
    let handled = false;

    bot.command('ping', async (ctx) => {
      handled = true;
    });

    const fetchHandler = bot.fetch();
    const req = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: 100,
        message: {
          message_id: 1,
          date: 1620000000,
          chat: { id: 999, type: 'private' },
          text: '/ping',
        },
      }),
    });

    const res = await fetchHandler(req);
    assert.equal(res.status, 200);
    assert.equal(handled, true);
  });

  it('accelerates responses using zero-roundtrip Webhook Reply', async () => {
    const bot = createBot();

    bot.command('hello', async (ctx) => {
      await ctx.reply('World!', { parse_mode: 'HTML' });
    });

    const fetchHandler = bot.fetch({ webhookReply: true });
    const req = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: 101,
        message: {
          message_id: 2,
          date: 1620000000,
          chat: { id: 456, type: 'private' },
          text: '/hello',
        },
      }),
    });

    const res = await fetchHandler(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'application/json');

    const body = await res.json();
    assert.equal(body.method, 'sendMessage');
    assert.equal(body.chat_id, 456);
    assert.equal(body.text, 'World!');
    assert.equal(body.parse_mode, 'HTML');
  });

  it('provides bot.webhook as an alias for bot.fetch', async () => {
    const bot = createBot();
    const webhookHandler = bot.webhook();
    assert.equal(typeof webhookHandler, 'function');

    const req = new Request('https://example.com/webhook', { method: 'GET' });
    const res = await webhookHandler(req);
    assert.equal(res.status, 405);
  });
});
