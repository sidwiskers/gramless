import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarsEngine } from '../src/payments.js';
import { GramlessRouter } from '../src/router.js';

test('payments: sendInvoice constructs valid Telegram Stars (XTR) payload', async () => {
  const stars = createStarsEngine();
  let calledMethod = null;
  let calledParams = null;

  const mockApi = {
    async call(method, params) {
      calledMethod = method;
      calledParams = params;
      return { message_id: 123 };
    },
  };

  const fakeCtx = {
    chatId: 42,
    call: (m, p) => mockApi.call(m, p),
  };

  await stars.sendInvoice(fakeCtx, {
    title: 'Telegram Premium Star Badge',
    description: 'Exclusive gold star profile badge',
    stars: 250,
    payload: 'order_badge_1',
    photoUrl: 'https://example.com/badge.png',
  });

  assert.equal(calledMethod, 'sendInvoice');
  assert.equal(calledParams.chat_id, 42);
  assert.equal(calledParams.currency, 'XTR');
  assert.deepEqual(calledParams.prices, [{ label: 'Telegram Premium Star Badge', amount: 250 }]);
  assert.equal(calledParams.payload, 'order_badge_1');
  assert.equal(calledParams.photo_url, 'https://example.com/badge.png');
});

test('payments: onPreCheckout accepts valid checkouts and declines with custom error', async () => {
  const router = new GramlessRouter();
  const stars = createStarsEngine();
  const answeredQueries = [];

  const mockApi = {
    async answerPreCheckoutQuery(params) {
      answeredQueries.push(params);
      return true;
    },
  };

  stars.onPreCheckout(async (ctx) => {
    const payload = ctx.raw.invoice_payload;
    if (payload === 'sold_out_item') {
      return 'Sorry, this item is out of stock!';
    }
    return true;
  });

  router.use(stars.middleware());

  // 1. Valid checkout
  await router.handle({
    id: 'query_valid',
    total_amount: 100,
    currency: 'XTR',
    invoice_payload: 'valid_item',
  }, {}, mockApi);

  assert.equal(answeredQueries[0].pre_checkout_query_id, 'query_valid');
  assert.equal(answeredQueries[0].ok, true);

  // 2. Invalid / out-of-stock checkout
  await router.handle({
    id: 'query_invalid',
    total_amount: 100,
    currency: 'XTR',
    invoice_payload: 'sold_out_item',
  }, {}, mockApi);

  assert.equal(answeredQueries[1].pre_checkout_query_id, 'query_invalid');
  assert.equal(answeredQueries[1].ok, false);
  assert.equal(answeredQueries[1].error_message, 'Sorry, this item is out of stock!');
});

test('payments: onSuccess handles completed star purchases', async () => {
  const router = new GramlessRouter();
  const stars = createStarsEngine();
  const fulfilledOrders = [];

  stars.onSuccess('vip_monthly', async (ctx, payment) => {
    fulfilledOrders.push({
      user: ctx.userId,
      stars: payment.total_amount,
      chargeId: payment.telegram_payment_charge_id,
    });
  });

  router.use(stars.middleware());

  const paymentUpdate = {
    chat: { id: 77 },
    from: { id: 77 },
    successful_payment: {
      currency: 'XTR',
      total_amount: 150,
      invoice_payload: 'vip_monthly',
      telegram_payment_charge_id: 'tg_charge_9999',
    },
  };

  await router.handle(paymentUpdate);

  assert.equal(fulfilledOrders.length, 1);
  assert.equal(fulfilledOrders[0].user, 77);
  assert.equal(fulfilledOrders[0].stars, 150);
  assert.equal(fulfilledOrders[0].chargeId, 'tg_charge_9999');
});
