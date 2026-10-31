import test from 'node:test';
import assert from 'node:assert/strict';
import { cleaner, createCleaner } from '../src/cleaner.js';
import { GramlessRouter } from '../src/router.js';

test('cleaner: tracks and deletes temporary messages', async () => {
  const router = new GramlessRouter();
  const deletedMessages = [];

  const mockApi = {
    async sendMessage(params) {
      return { message_id: 100 + Math.floor(Math.random() * 100), ...params };
    },
    async deleteMessage(params) {
      deletedMessages.push(params.message_id);
      return true;
    },
  };

  router.use(cleaner());

  router.command('temp', async (ctx) => {
    // Reply with temporary loading message
    const msg1 = await ctx.replyTemp('Loading results...');
    const msg2 = await ctx.replyTemp('Formatting table...');
    assert.ok(msg1.message_id);
    assert.ok(msg2.message_id);

    // Later: purge all temporary messages
    const count = await ctx.cleanTracked();
    assert.equal(count, 2);
  });

  await router.handle({ chat: { id: 7 }, text: '/temp' }, {}, mockApi);
  assert.equal(deletedMessages.length, 2);
});

test('cleaner: autoCleanOnCommand purges tracked messages on subsequent commands', async () => {
  const router = new GramlessRouter();
  const deletedMessages = [];
  let nextMsgId = 200;

  const mockApi = {
    async sendMessage(params) {
      nextMsgId++;
      return { message_id: nextMsgId, ...params };
    },
    async deleteMessage(params) {
      deletedMessages.push(params.message_id);
      return true;
    },
  };

  const messageCleaner = createCleaner();
  router.use(messageCleaner.middleware({ autoCleanOnCommand: true }));

  router.command('step1', async (ctx) => {
    await ctx.replyTemp('Step 1 info');
  });

  router.command('step2', async (ctx) => {
    await ctx.reply('Step 2 final');
  });

  const chat = { chat: { id: 9 }, from: { id: 9 } };

  // 1. First command leaves a temp message
  await router.handle({ ...chat, text: '/step1' }, {}, mockApi);
  assert.equal(deletedMessages.length, 0);

  // 2. Second command automatically purges prior temp messages
  await router.handle({ ...chat, text: '/step2' }, {}, mockApi);
  assert.equal(deletedMessages.length, 1);
  assert.equal(deletedMessages[0], 201);
});
