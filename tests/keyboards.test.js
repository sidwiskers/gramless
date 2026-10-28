import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInlineKeyboard,
  buildReplyKeyboard,
  removeKeyboard,
  forceReply,
  GramlessContext,
} from '../src/context.js';

test('buildReplyKeyboard: transforms buttons and options into Telegram ReplyKeyboardMarkup', () => {
  const buttons = [
    ['Option 1', 'Option 2'],
    [{ text: 'Send Phone', requestContact: true }],
    [{ text: 'Send Location', requestLocation: true }],
  ];

  const markup = buildReplyKeyboard(buttons, {
    resize: true,
    oneTime: true,
    placeholder: 'Choose an option...',
  });

  assert.deepEqual(markup, {
    keyboard: [
      [{ text: 'Option 1' }, { text: 'Option 2' }],
      [{ text: 'Send Phone', request_contact: true }],
      [{ text: 'Send Location', request_location: true }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
    input_field_placeholder: 'Choose an option...',
  });
});

test('removeKeyboard & forceReply: generates exact markup schemas', () => {
  const rm = removeKeyboard({ selective: true });
  assert.deepEqual(rm, { remove_keyboard: true, selective: true });

  const fr = forceReply({ placeholder: 'Your name', selective: false });
  assert.deepEqual(fr, { force_reply: true, input_field_placeholder: 'Your name' });
});

test('GramlessContext: automatically normalizes keyboard and reply markup options', async () => {
  const calls = [];
  const mockApi = {
    async sendMessage(params) {
      calls.push(params);
      return { message_id: 1, ...params };
    },
  };

  const ctx = new GramlessContext({ chat: { id: 123 }, from: { id: 123 } }, {}, mockApi);

  // 1. Reply keyboard shorthand
  await ctx.reply('Choose:', {
    keyboard: [['A', 'B']],
    resize: true,
  });
  assert.deepEqual(calls[0].reply_markup, {
    keyboard: [[{ text: 'A' }, { text: 'B' }]],
    resize_keyboard: true,
  });

  // 2. Remove keyboard shorthand
  await ctx.reply('Keyboard removed', { removeKeyboard: true });
  assert.deepEqual(calls[1].reply_markup, { remove_keyboard: true });

  // 3. Force reply shorthand
  await ctx.reply('Please reply:', { forceReply: true, placeholder: 'Enter answer' });
  assert.deepEqual(calls[2].reply_markup, { force_reply: true, input_field_placeholder: 'Enter answer' });
});
