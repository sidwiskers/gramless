import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createBot, webhookCallback } from '../src/index.js';

describe('Traditional Servers & Long Polling Support', () => {
  it('automatically initializes API client when token is provided', () => {
    const bot = createBot({ token: '123456:ABC-DEF' });
    assert.ok(bot.api);
    assert.equal(typeof bot.api.call, 'function');
  });

  describe('Long Polling (bot.start & bot.stop)', () => {
    it('throws RoutingError when starting without token or api', async () => {
      const bot = createBot();
      await assert.rejects(
        () => bot.start(),
        { message: /bot token or api client was not provided/ }
      );
    });

    it('polls getUpdates, increments offset, and executes registered routes', async () => {
      const calls = [];
      const handledUpdates = [];

      let pollCount = 0;
      let botRef = null;
      const mockApi = {
        call: async (method, params) => {
          calls.push({ method, params });
          if (method === 'getUpdates') {
            pollCount++;
            if (pollCount === 1) {
              return [
                { update_id: 101, message: { chat: { id: 1 }, text: '/ping' } },
                { update_id: 102, message: { chat: { id: 1 }, text: '/hello' } },
              ];
            }
            if (pollCount === 2) {
              return [
                { update_id: 103, message: { chat: { id: 1 }, text: '/ping' } },
              ];
            }
            if (botRef) botRef.stop();
            return [];
          }
          return { ok: true };
        },
      };

      const bot = createBot({ api: mockApi });
      botRef = bot;
      bot.command('ping', (ctx) => {
        handledUpdates.push(ctx.message.text);
      });

      let onStartCalled = false;
      await bot.start({
        timeout: 10,
        dropPendingUpdates: true,
        onStart: () => {
          onStartCalled = true;
        },
      });

      assert.equal(onStartCalled, true);
      assert.equal(calls[0].method, 'deleteWebhook');
      assert.deepEqual(calls[0].params, { drop_pending_updates: true });

      // Check offset increments:
      // First call offset: 0
      assert.equal(calls[1].params.offset, 0);
      // Second call offset: 103 (last update_id 102 + 1)
      assert.equal(calls[2].params.offset, 103);

      assert.deepEqual(handledUpdates, ['/ping', '/ping']);
    });

    it('stops gracefully when AbortSignal is triggered', async () => {
      let pollCount = 0;
      const controller = new AbortController();
      const mockApi = {
        call: async (method) => {
          if (method === 'getUpdates') {
            pollCount++;
            controller.abort();
            return [];
          }
          return { ok: true };
        },
      };

      const bot = createBot({ api: mockApi });
      await bot.start({ signal: controller.signal });

      assert.ok(pollCount >= 1);
    });
  });

  describe('Traditional Webhook Callback Adapter (bot.webhookCallback)', () => {
    it('rejects non-POST requests with 405 Method Not Allowed', async () => {
      const bot = createBot();
      const handler = bot.webhookCallback();

      let statusCode = 0;
      let responseBody = '';
      const req = { method: 'GET', headers: {} };
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        send(body) {
          responseBody = body;
        },
      };

      await handler(req, res);
      assert.equal(statusCode, 405);
      assert.equal(responseBody, 'Method Not Allowed');
    });

    it('verifies secret token and rejects unauthorized requests with 401', async () => {
      const bot = createBot();
      const handler = bot.webhookCallback({ secretToken: 'secret_123' });

      let statusCode = 0;
      let responseBody = '';
      const req = {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'wrong_token' },
      };
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        send(body) {
          responseBody = body;
        },
      };

      await handler(req, res);
      assert.equal(statusCode, 401);
      assert.equal(responseBody, 'Unauthorized: Invalid secret token');
    });

    it('processes pre-parsed Express/Fastify body (req.body)', async () => {
      const bot = createBot();
      let handledText = null;

      bot.command('test', (ctx) => {
        handledText = ctx.message.text;
      });

      const handler = webhookCallback(bot);

      let statusCode = 0;
      let responseBody = '';
      const req = {
        method: 'POST',
        headers: {},
        body: {
          update_id: 1,
          message: {
            message_id: 10,
            chat: { id: 123 },
            text: '/test',
          },
        },
      };
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        send(body) {
          responseBody = body;
        },
      };

      await handler(req, res);
      assert.equal(statusCode, 200);
      assert.equal(responseBody, 'OK');
      assert.equal(handledText, '/test');
    });

    it('processes unparsed streaming Node.js http request body', async () => {
      const bot = createBot();
      let handledText = null;

      bot.command('node', (ctx) => {
        handledText = ctx.message.text;
      });

      const handler = bot.webhookCallback();

      class MockReq extends EventEmitter {
        constructor() {
          super();
          this.method = 'POST';
          this.headers = {};
        }
      }

      const req = new MockReq();

      let statusCode = 0;
      let responseBody = '';
      const res = {
        writeHead(code) {
          statusCode = code;
          return this;
        },
        end(body) {
          responseBody = body;
        },
      };

      const handlerPromise = handler(req, res);

      const payload = JSON.stringify({
        update_id: 2,
        message: {
          message_id: 20,
          chat: { id: 456 },
          text: '/node',
        },
      });

      req.emit('data', Buffer.from(payload.slice(0, 20)));
      req.emit('data', Buffer.from(payload.slice(20)));
      req.emit('end');

      await handlerPromise;

      assert.equal(statusCode, 200);
      assert.equal(responseBody, 'OK');
      assert.equal(handledText, '/node');
    });

    it('returns 400 Bad Request on invalid streaming JSON body', async () => {
      const bot = createBot();
      const handler = bot.webhookCallback();

      class MockReq extends EventEmitter {
        constructor() {
          super();
          this.method = 'POST';
          this.headers = {};
        }
      }

      const req = new MockReq();

      let statusCode = 0;
      let responseBody = '';
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        send(body) {
          responseBody = body;
        },
      };

      const handlerPromise = handler(req, res);
      req.emit('data', Buffer.from('invalid-json{'));
      req.emit('end');

      await handlerPromise;

      assert.equal(statusCode, 400);
      assert.equal(responseBody, 'Bad Request: Invalid JSON body');
    });
  });
});
