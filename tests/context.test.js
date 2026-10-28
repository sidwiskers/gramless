import test from 'node:test';
import assert from 'node:assert/strict';
import { GramlessContext, buildInlineKeyboard } from '../src/context.js';
import { ApiError, ValidationError, sanitizeString } from '../src/errors.js';

test('GramlessContext: basic property extraction', () => {
  const rawMessage = {
    message_id: 42,
    from: { id: 1001, first_name: 'Alice', username: 'alice' },
    chat: { id: -100200300, type: 'supergroup', title: 'Dev Group' },
    text: '/start test_payload',
  };

  const ctx = new GramlessContext(rawMessage, { update: { update_id: 1, message: rawMessage } });

  assert.equal(ctx.chatId, -100200300);
  assert.equal(ctx.userId, 1001);
  assert.equal(ctx.messageId, 42);
  assert.equal(ctx.text, '/start test_payload');
  assert.equal(ctx.isGroup, true);
  assert.equal(ctx.isPrivate, false);
});

test('GramlessContext: callback query extraction', () => {
  const rawQuery = {
    id: 'query_999',
    from: { id: 2002, first_name: 'Bob' },
    data: 'order:456:confirm',
    message: {
      message_id: 88,
      chat: { id: 2002, type: 'private' },
      text: 'Order summary',
    },
  };

  const ctx = new GramlessContext(rawQuery, { update: { update_id: 2, callback_query: rawQuery } });

  assert.equal(ctx.chatId, 2002);
  assert.equal(ctx.userId, 2002);
  assert.equal(ctx.messageId, 88);
  assert.equal(ctx.data, 'order:456:confirm');
  assert.equal(ctx.isPrivate, true);
  assert.equal(ctx.isGroup, false);
});

test('buildInlineKeyboard: transforms shorthand array into standard Telegram schema', () => {
  const buttons = [
    ['Option 1', 'Option 2'],
    [{ text: 'Visit Website', url: 'https://example.com' }],
    [{ text: 'Open App', webApp: 'https://mini-app.tg' }],
    [{ text: 'Delete', data: 'action_delete' }],
  ];

  const markup = buildInlineKeyboard(buttons);

  assert.deepEqual(markup, {
    inline_keyboard: [
      [
        { text: 'Option 1', callback_data: 'Option 1' },
        { text: 'Option 2', callback_data: 'Option 2' },
      ],
      [{ text: 'Visit Website', url: 'https://example.com' }],
      [{ text: 'Open App', web_app: { url: 'https://mini-app.tg' } }],
      [{ text: 'Delete', callback_data: 'action_delete' }],
    ],
  });
});

test('GramlessContext: outbound actions proxy to mock API', async () => {
  const calls = [];
  const mockApi = {
    async sendMessage(params) {
      calls.push({ method: 'sendMessage', params });
      return { message_id: 100, ...params };
    },
    async editMessageText(params) {
      calls.push({ method: 'editMessageText', params });
      return { message_id: params.message_id, ...params };
    },
    async answerCallbackQuery(params) {
      calls.push({ method: 'answerCallbackQuery', params });
      return true;
    },
  };

  const raw = {
    id: 'cb_123',
    from: { id: 555 },
    data: 'vote:up',
    message: { message_id: 77, chat: { id: 999 } },
  };

  const ctx = new GramlessContext(raw, {}, mockApi);

  // 1. Reply
  await ctx.reply('Hello World', {
    buttons: [['Confirm', 'Cancel']],
  });

  assert.equal(calls[0].method, 'sendMessage');
  assert.equal(calls[0].params.chat_id, 999);
  assert.equal(calls[0].params.text, 'Hello World');
  assert.ok(calls[0].params.reply_markup.inline_keyboard);

  // 2. Edit
  await ctx.edit('Updated content');
  assert.equal(calls[1].method, 'editMessageText');
  assert.equal(calls[1].params.chat_id, 999);
  assert.equal(calls[1].params.message_id, 77);
  assert.equal(calls[1].params.text, 'Updated content');

  // 3. Answer
  await ctx.alert('Attention required');
  assert.equal(calls[2].method, 'answerCallbackQuery');
  assert.equal(calls[2].params.callback_query_id, 'cb_123');
  assert.equal(calls[2].params.show_alert, true);
});

test('Errors: token sanitization in error messages', () => {
  const secretToken = 'bot123456:ABCdefGHIjklMNOpqrSTUvwxYZ_1234567';
  const raw = `Failed to connect to https://api.telegram.org/${secretToken}/sendMessage`;
  const sanitized = sanitizeString(raw);

  assert.ok(!sanitized.includes('123456:ABC'));
  assert.ok(sanitized.includes('bot[REDACTED]'));

  const err = new ApiError('sendMessage', `Token leaked: ${secretToken}`);
  assert.ok(!err.message.includes('123456:ABC'));
});

test('Bot API 10.3: buildInlineKeyboard preserves disabled and custom button attributes', () => {
  const buttons = [
    [{ text: 'Disabled Action', data: 'act:dis', disabled: true }],
    [{ text: 'Copy Code', copy_text: { text: 'API_KEY_123' } }],
  ];

  const markup = buildInlineKeyboard(buttons);

  assert.deepEqual(markup, {
    inline_keyboard: [
      [{ text: 'Disabled Action', callback_data: 'act:dis', disabled: true }],
      [{ text: 'Copy Code', copy_text: { text: 'API_KEY_123' } }],
    ],
  });
});

test('Bot API 10.3: rich messages and ephemeral message context methods', async () => {
  const calls = [];
  const mockApi = {
    async sendRichMessage(params) {
      calls.push({ method: 'sendRichMessage', params });
      return { message_id: 201, ...params };
    },
    async editEphemeralMessageText(params) {
      calls.push({ method: 'editEphemeralMessageText', params });
      return true;
    },
    async deleteEphemeralMessage(params) {
      calls.push({ method: 'deleteEphemeralMessage', params });
      return true;
    },
  };

  const raw = {
    message_id: 10,
    chat: { id: 888 },
    from: { id: 777 },
  };

  const ctx = new GramlessContext(raw, {}, mockApi);

  // 1. sendRichMessage
  await ctx.sendRichMessage({ blocks: [{ type: 'paragraph', text: 'Rich greeting' }] });
  assert.equal(calls[0].method, 'sendRichMessage');
  assert.equal(calls[0].params.chat_id, 888);
  assert.deepEqual(calls[0].params.rich_message, { blocks: [{ type: 'paragraph', text: 'Rich greeting' }] });

  // 2. editEphemeralMessageText
  await ctx.editEphemeralMessageText('Updated ephemeral text');
  assert.equal(calls[1].method, 'editEphemeralMessageText');
  assert.equal(calls[1].params.chat_id, 888);
  assert.equal(calls[1].params.text, 'Updated ephemeral text');

  // 3. deleteEphemeralMessage
  await ctx.deleteEphemeralMessage(999);
  assert.equal(calls[2].method, 'deleteEphemeralMessage');
  assert.equal(calls[2].params.chat_id, 888);
  assert.equal(calls[2].params.ephemeral_message_id, 999);
});

