import test from 'node:test';
import assert from 'node:assert/strict';
import { GramlessRouter } from '../src/router.js';
import { GramlessContext } from '../src/context.js';
import { Filter } from '../src/filters.js';
import { fmt } from '../src/format.js';
import { createLab } from '../src/testkit/index.js';
import { ApiError, isQueryTooOldError } from '../src/errors.js';

test('Bot API 10.4 Context: widget and TON properties extraction', () => {
  const widgetQueryUpdate = {
    update_id: 101,
    widget_query: {
      id: 'wq_1001',
      from: { id: 777, first_name: 'Alex', username: 'alex_tg' },
      chat: { id: 777, type: 'private' },
      message_id: 42,
      chat_instance: 'inst_abc',
      type: { type: 'data' },
      data: 'action:vote:candidate_a',
      widget_id: 'wid_voting',
    },
  };

  const ctx1 = new GramlessContext(widgetQueryUpdate.widget_query, { update: widgetQueryUpdate });
  assert.equal(ctx1.userId, 777);
  assert.equal(ctx1.chatId, 777);
  assert.equal(ctx1.messageId, 42);
  assert.equal(ctx1.data, 'action:vote:candidate_a');
  assert.ok(ctx1.widgetQuery);
  assert.equal(ctx1.widgetQuery.id, 'wq_1001');
  assert.equal(ctx1.widgetQuery.widget_id, 'wid_voting');

  const sharedWidgetUpdate = {
    update_id: 102,
    shared_widget_query: {
      id: 'swq_2002',
      from: { id: 888, first_name: 'Daria' },
      type: { type: 'data' },
      data: 'counter:increment',
      widget_id: 'wid_shared_leaderboard',
    },
  };

  const ctx2 = new GramlessContext(sharedWidgetUpdate.shared_widget_query, { update: sharedWidgetUpdate });
  assert.equal(ctx2.userId, 888);
  assert.equal(ctx2.data, 'counter:increment');
  assert.ok(ctx2.sharedWidgetQuery);
  assert.equal(ctx2.sharedWidgetQuery.id, 'swq_2002');
  assert.equal(ctx2.sharedWidgetQuery.widget_id, 'wid_shared_leaderboard');

  const tonUpdate = {
    update_id: 103,
    message: {
      message_id: 55,
      from: { id: 999, first_name: 'Satoshi' },
      chat: { id: 999, type: 'private' },
      ton_wallet_transfer: {
        transfer_id: 'ton_tx_001',
        amount: '1000000000',
        wallet_address: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
      },
      paid_messages_waived: {
        waived_count: 5,
      },
    },
  };

  const ctx3 = new GramlessContext(tonUpdate.message, { update: tonUpdate });
  assert.ok(ctx3.tonWalletTransfer);
  assert.equal(ctx3.tonWalletTransfer.transfer_id, 'ton_tx_001');
  assert.ok(ctx3.paidMessagesWaived);
  assert.equal(ctx3.paidMessagesWaived.waived_count, 5);
});

test('Bot API 10.4: ctx.sendWidget validates size and invokes api correctly', async () => {
  const calls = [];
  const mockApi = {
    async sendWidget(params) {
      calls.push({ method: 'sendWidget', params });
      return { message_id: 99 };
    },
  };

  const rawMessage = {
    message_id: 1,
    from: { id: 100, first_name: 'Dev' },
    chat: { id: 100, type: 'private' },
  };

  const ctx = new GramlessContext(rawMessage, { update: { message: rawMessage }, api: mockApi });

  // 1. Rejects empty html
  await assert.rejects(
    async () => ctx.sendWidget(''),
    /must be between 1 and 32,768 bytes/
  );

  // 2. Rejects html > 32768 bytes
  const largeHtml = '<div>' + 'a'.repeat(33000) + '</div>';
  await assert.rejects(
    async () => ctx.sendWidget(largeHtml),
    /must be between 1 and 32,768 bytes/
  );

  // 3. Sends normal valid html
  const validHtml = '<div><h3>Vote 2026</h3><button>Candidate 1</button></div>';
  const res = await ctx.sendWidget(validHtml, {
    widget_id: 'poll_widget_1',
    cache_time: 300,
  });

  assert.equal(res.message_id, 99);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.chat_id, 100);
  assert.equal(calls[0].params.html, validHtml);
  assert.equal(calls[0].params.widget_id, 'poll_widget_1');
  assert.equal(calls[0].params.cache_time, 300);
});

test('Bot API 10.4: ctx.sendSharedWidget invokes api correctly', async () => {
  const calls = [];
  const mockApi = {
    async sendSharedWidget(params) {
      calls.push({ method: 'sendSharedWidget', params });
      return { message_id: 100 };
    },
  };

  const rawMessage = {
    message_id: 2,
    from: { id: 100, first_name: 'Dev' },
    chat: { id: 100, type: 'private' },
  };

  const ctx = new GramlessContext(rawMessage, { update: { message: rawMessage }, api: mockApi });
  await ctx.sendSharedWidget('shared_widget_abc', {
    cache_time: 600,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.chat_id, 100);
  assert.equal(calls[0].params.widget_id, 'shared_widget_abc');
  assert.equal(calls[0].params.cache_time, 600);
});

test('Bot API 10.4: ctx.answerWidgetQuery formats string or options payload', async () => {
  const calls = [];
  const mockApi = {
    async answerWidgetQuery(params) {
      calls.push({ method: 'answerWidgetQuery', params });
      return true;
    },
  };

  const widgetQueryUpdate = {
    update_id: 104,
    widget_query: {
      id: 'wq_555',
      from: { id: 100, first_name: 'Dev' },
      chat: { id: 100, type: 'private' },
      data: 'refresh',
    },
  };

  const ctx = new GramlessContext(widgetQueryUpdate.widget_query, {
    update: widgetQueryUpdate,
    api: mockApi,
  });

  // String shorthand
  await ctx.answerWidgetQuery('{"status":"ok","score":42}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.widget_query_id, 'wq_555');
  assert.equal(calls[0].params.data, '{"status":"ok","score":42}');

  // Options object
  await ctx.answerWidgetQuery({
    data: '{"status":"accepted"}',
    url: 'https://example.com/widget-details',
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params.widget_query_id, 'wq_555');
  assert.equal(calls[1].params.data, '{"status":"accepted"}');
  assert.equal(calls[1].params.url, 'https://example.com/widget-details');
});

test('Bot API 10.4: isQueryTooOld matches widget query expiration message', () => {
  const err1 = new ApiError('answerCallbackQuery', 'Bad Request: query is too old and response timeout expired or query ID is invalid', 400);
  assert.ok(err1.isQueryTooOld);
  assert.ok(isQueryTooOldError(err1));

  const err2 = new ApiError('answerWidgetQuery', 'Bad Request: widget query is too old and response timeout expired', 400);
  assert.ok(err2.isQueryTooOld);
  assert.ok(isQueryTooOldError(err2));

  const err3 = new ApiError('sendMessage', 'Bad Request: message not found', 400);
  assert.ok(!err3.isQueryTooOld);
  assert.ok(!isQueryTooOldError(err3));
});

test('Bot API 10.4: ctx.editMessageWidgetData and ctx.editSharedWidgetData', async () => {
  const calls = [];
  const mockApi = {
    async editMessageWidgetData(params) {
      calls.push({ method: 'editMessageWidgetData', params });
      return true;
    },
    async editSharedWidgetData(params) {
      calls.push({ method: 'editSharedWidgetData', params });
      return true;
    },
  };

  const widgetQueryUpdate = {
    update_id: 105,
    widget_query: {
      id: 'wq_999',
      from: { id: 100, first_name: 'Dev' },
      chat: { id: 100, type: 'private' },
      message_id: 70,
      data: 'init',
    },
  };

  const ctx = new GramlessContext(widgetQueryUpdate.widget_query, {
    update: widgetQueryUpdate,
    api: mockApi,
  });

  // Edit current widget data
  await ctx.editMessageWidgetData({ data: 'new_binary_state' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.chat_id, 100);
  assert.equal(calls[0].params.message_id, 70);
  assert.equal(calls[0].params.data, 'new_binary_state');

  // Edit shared widget data
  await ctx.editSharedWidgetData('shared_id_xyz', 'public_counter:10', { cache_time: 120 });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params.widget_id, 'shared_id_xyz');
  assert.equal(calls[1].params.public_data, 'public_counter:10');
  assert.equal(calls[1].params.cache_time, 120);
});

test('Bot API 10.4: Ephemeral callback replies with optional chat_id and quote_rich_texts', async () => {
  const calls = [];
  const mockApi = {
    async sendMessage(params) {
      calls.push({ method: 'sendMessage', params });
      return { message_id: 201 };
    },
  };

  const callbackUpdate = {
    update_id: 106,
    callback_query: {
      id: 'cb_query_42',
      from: { id: 333, first_name: 'Charlie' },
      data: 'btn_click',
    },
  };

  const ctx = new GramlessContext(callbackUpdate.callback_query, {
    update: callbackUpdate,
    api: mockApi,
  });

  // 1. ctx.reply with ephemeral: true in callback query context
  await ctx.reply('Secret ephemeral notice', { ephemeral: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.text, 'Secret ephemeral notice');
  assert.equal(calls[0].params.chat_id, undefined); // chat_id is omitted when callback_query_id is supplied!
  assert.deepEqual(calls[0].params.ephemeral_message_parameters, {
    callback_query_id: 'cb_query_42',
  });

  // 2. ctx.replyEphemeral helper
  await ctx.replyEphemeral('Second secret notice');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].params.text, 'Second secret notice');
  assert.deepEqual(calls[1].params.ephemeral_message_parameters, {
    callback_query_id: 'cb_query_42',
  });

  // 3. quote_rich_texts in reply options
  const msgUpdate = {
    update_id: 107,
    message: {
      message_id: 15,
      from: { id: 333, first_name: 'Charlie' },
      chat: { id: 333, type: 'private' },
      text: 'Original message',
    },
  };
  const ctxMsg = new GramlessContext(msgUpdate.message, { update: msgUpdate, api: mockApi });
  await ctxMsg.reply('Quoting you', { quote_rich_texts: true, quote: 'Original' });

  assert.equal(calls.length, 3);
  assert.equal(calls[2].params.reply_parameters.quote_rich_texts, true);
  assert.equal(calls[2].params.reply_parameters.quote, 'Original');
});

test('Bot API 10.4: Unique Gifts, Business Gifts, and Theme Backdrops', async () => {
  const calls = [];
  const mockApi = {
    async getUniqueGift(params) {
      calls.push({ method: 'getUniqueGift', params });
      return { id: 'ug_1', name: params.name };
    },
    async deleteBusinessAccountGift(params) {
      calls.push({ method: 'deleteBusinessAccountGift', params });
      return true;
    },
    async getChatShareThemeBackdrops(params) {
      calls.push({ method: 'getChatShareThemeBackdrops', params });
      return [{ id: 'backdrop_1', colors: ['#ffffff', '#000000'] }];
    },
  };

  const rawMessage = {
    message_id: 1,
    from: { id: 100, first_name: 'Admin' },
    chat: { id: 100, type: 'private' },
  };
  const ctx = new GramlessContext(rawMessage, { update: { message: rawMessage }, api: mockApi });

  const gift = await ctx.getUniqueGift('golden_dragon_9');
  assert.equal(gift.name, 'golden_dragon_9');
  assert.equal(calls[0].params.name, 'golden_dragon_9');

  const deleted = await ctx.deleteBusinessAccountGift('biz_conn_99', 'owned_gift_123');
  assert.equal(deleted, true);
  assert.equal(calls[1].params.business_connection_id, 'biz_conn_99');
  assert.equal(calls[1].params.owned_gift_id, 'owned_gift_123');

  const backdrops = await ctx.getChatShareThemeBackdrops();
  assert.equal(backdrops.length, 1);
  assert.equal(calls[2].method, 'getChatShareThemeBackdrops');
});

test('Bot API 10.4: Formatting fmt.tonAddress and fmt.bankCard', () => {
  const tonAddr = fmt.tonAddress('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N');
  assert.equal(
    tonAddr.toString(),
    '<a href="ton://transfer/EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N">EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N</a>'
  );

  const card = fmt.bankCard('1234 5678 9012 3456');
  assert.equal(
    card.toString(),
    '<code>1234 5678 9012 3456</code>'
  );
});

test('Bot API 10.4: Filters for widget, TON, and paid messages', () => {
  const widgetQueryCtx = new GramlessContext({ id: 'wq_1', data: 'btn' }, {
    update: { update_id: 1, widget_query: { id: 'wq_1', data: 'btn' } },
  });
  assert.equal(Filter.isWidgetQuery(widgetQueryCtx), true);
  assert.equal(Filter.widgetQuery(widgetQueryCtx), true);
  assert.equal(Filter.isSharedWidgetQuery(widgetQueryCtx), false);

  const msgWithWidgetCtx = new GramlessContext({
    message_id: 1,
    widget: { id: 'w1', html: '<div></div>' },
  }, {
    update: { update_id: 1, message: { message_id: 1, widget: { id: 'w1', html: '<div></div>' } } },
  });
  assert.equal(Filter.hasWidget(msgWithWidgetCtx), true);
  assert.equal(Filter.widget(msgWithWidgetCtx), true);

  const sharedWidgetCtx = new GramlessContext({ id: 'swq_1', widget_id: 'w_1' }, {
    update: { update_id: 2, shared_widget_query: { id: 'swq_1', widget_id: 'w_1' } },
  });
  assert.equal(Filter.isSharedWidgetQuery(sharedWidgetCtx), true);
  assert.equal(Filter.sharedWidgetQuery(sharedWidgetCtx), true);

  const tonCtx = new GramlessContext({
    message_id: 1,
    ton_wallet_transfer: { transfer_id: 'tx_1' },
    paid_messages_waived: { waived_count: 1 },
  }, {
    update: {
      update_id: 3,
      message: {
        message_id: 1,
        ton_wallet_transfer: { transfer_id: 'tx_1' },
        paid_messages_waived: { waived_count: 1 },
      },
    },
  });
  assert.equal(Filter.hasTonTransfer(tonCtx), true);
  assert.equal(Filter.tonTransfer(tonCtx), true);
  assert.equal(Filter.hasPaidMessagesWaived(tonCtx), true);
  assert.equal(Filter.paidMessagesWaived(tonCtx), true);
});

test('Bot API 10.4: GramlessRouter widget routing and Lab testkit integration', async () => {
  const bot = new GramlessRouter();

  bot.command('widget', async (ctx) => {
    await ctx.sendWidget('<div><h1>Poll</h1><button>Option A</button></div>', {
      widget_id: 'poll_2026',
    });
  });

  // Exact trigger routing
  bot.widget('vote:candidate_a', async (ctx) => {
    await ctx.answerWidgetQuery('{"voted": "candidate_a"}');
  });

  // Prefix routing
  bot.widgetQuery('settings:', async (ctx) => {
    await ctx.answerWidgetQuery('{"screen": "settings"}');
  });

  // Regex routing
  bot.widgetQuery(/^custom:([a-z]+)$/, async (ctx) => {
    await ctx.answerWidgetQuery(`{"custom": "${ctx.match[1]}"}`);
  });

  // Catch-all widget event
  bot.on('shared_widget_query', async (ctx) => {
    await ctx.answerWidgetQuery('{"shared": true}');
  });

  const lab = createLab(bot);
  const actor = lab.user(501, 'Elena');

  // 1. Elena asks for the widget
  const res1 = await actor.command('/widget');
  res1.wantWidgetSent('Poll');

  // 2. Elena interacts with widget sending exact trigger
  const res2 = await actor.queryWidget('vote:candidate_a');
  res2.wantWidgetQueryAnswered('candidate_a');

  // 3. Elena interacts with widget sending prefix trigger
  const res3 = await actor.queryWidget('settings:volume');
  res3.wantWidgetQueryAnswered('settings');

  // 4. Elena interacts with regex trigger
  const res4 = await actor.queryWidget('custom:foobar');
  res4.wantWidgetQueryAnswered('foobar');

  // 5. Elena interacts with shared widget
  const res5 = await actor.querySharedWidget('poll_2026', 'ping');
  res5.wantWidgetQueryAnswered('true');
});
