import test from 'node:test';
import assert from 'node:assert/strict';
import { createEndpoint, v } from '../src/endpoint.js';

test('Endpoint: successful call with authenticated user and valid payload', async () => {
  const schema = v.object({
    orderId: v.string({ minLength: 3 }),
    amount: v.number({ min: 1 }),
    notes: v.optional(v.string()),
  });

  const getOrder = createEndpoint(
    { schema, requireAuth: true },
    async (ctx) => {
      return {
        processedBy: ctx.user.username,
        orderId: ctx.input.orderId,
        amount: ctx.input.amount,
        status: 'PAID',
      };
    }
  );

  const fakeCtx = {
    initData: {
      user: { id: 100, first_name: 'Dev', username: 'dev_user' },
    },
  };

  const payload = {
    orderId: 'ORD-999',
    amount: 49.99,
  };

  const response = await getOrder(payload, fakeCtx);

  assert.equal(response.ok, true);
  assert.equal(response.data.orderId, 'ORD-999');
  assert.equal(response.data.processedBy, 'dev_user');
  assert.equal(response.data.status, 'PAID');
});

test('Endpoint: rejects unauthenticated caller when requireAuth is true', async () => {
  const protectedEndpoint = createEndpoint(
    { requireAuth: true },
    async () => ({ secret: 'top_secret' })
  );

  // Missing initData.user
  const response = await protectedEndpoint({}, { initData: {} });

  assert.equal(response.ok, false);
  assert.equal(response.error, 'UNAUTHORIZED');
});

test('Endpoint: schema validation failures return detailed field issues', async () => {
  const schema = v.object({
    email: v.string({ pattern: /^[\w.-]+@[\w.-]+\.\w+$/ }),
    age: v.number({ min: 18, max: 120 }),
  });

  const registerEndpoint = createEndpoint(
    { schema, requireAuth: false },
    async (ctx) => ctx.input
  );

  const invalidPayload = {
    email: 'not-an-email',
    age: 15,
  };

  const response = await registerEndpoint(invalidPayload, {});

  assert.equal(response.ok, false);
  assert.equal(response.error, 'VALIDATION_ERROR');
  assert.equal(response.issues.length, 2);
  assert.equal(response.issues[0].field, 'email');
  assert.equal(response.issues[1].field, 'age');
});
