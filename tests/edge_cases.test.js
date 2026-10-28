import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot, session, MemorySessionStore, createFSM } from '../src/index.js';
import { createLab, MockBotApi } from '../src/testkit/index.js';
import { GramlessContext } from '../src/context.js';

test('Edge Case: Multiline and tabbed command parsing with args array', async () => {
  const bot = createBot();
  let receivedArgs = null;
  let receivedPayload = null;

  bot.command('calc', async (ctx) => {
    receivedPayload = ctx.payload;
    receivedArgs = ctx.args;
  });

  // Multiline command: /calc\n10 20\n30
  await bot.handle({
    chat: { id: 1 },
    from: { id: 1 },
    text: '/calc\n10 20\n30',
  });

  assert.equal(receivedPayload, '10 20\n30');
  assert.deepEqual(receivedArgs, ['10', '20', '30']);
});

test('Edge Case: Bot username filtering in group chats', async () => {
  const bot = createBot({ username: 'my_awesome_bot' });
  let hitCount = 0;

  bot.command('ping', async () => {
    hitCount++;
  });

  // 1. Plain command in group -> hits
  await bot.handle({ chat: { id: -100 }, from: { id: 1 }, text: '/ping' });
  assert.equal(hitCount, 1);

  // 2. Command with matching username -> hits
  await bot.handle({ chat: { id: -100 }, from: { id: 1 }, text: '/ping@my_awesome_bot' });
  assert.equal(hitCount, 2);

  // 3. Command directed at another bot -> IGNORED
  await bot.handle({ chat: { id: -100 }, from: { id: 1 }, text: '/ping@another_rival_bot' });
  assert.equal(hitCount, 2);
});

test('Edge Case: Concurrency serialization via KeyedMutex (zero lost updates)', async () => {
  const store = new MemorySessionStore();
  const bot = createBot();

  bot.use(session({
    store,
    getKey: (ctx) => `user:${ctx.userId}`,
    initial: () => ({ counter: 0 }),
  }));

  // Slow handler simulating async I/O
  bot.command('inc', async (ctx) => {
    const current = ctx.session.counter;
    // Simulate non-trivial async latency (database or Telegram API call)
    await new Promise(r => setTimeout(r, 10));
    ctx.session.counter = current + 1;
  });

  const msg = { chat: { id: 42 }, from: { id: 42 }, text: '/inc' };

  // Dispatch 5 concurrent updates simultaneously for the SAME user!
  await Promise.all([
    bot.handle(msg),
    bot.handle(msg),
    bot.handle(msg),
    bot.handle(msg),
    bot.handle(msg),
  ]);

  const finalState = await store.get('user:42');
  // Without KeyedMutex serialization, race conditions would result in counter = 1 or 2.
  // With KeyedMutex, all 5 updates execute sequentially: counter MUST be 5!
  assert.equal(finalState.counter, 5, 'Session mutations must be serialized without lost updates');
});

test('Edge Case: Inline query handling and Lab actor simulation', async () => {
  const bot = createBot();

  bot.on('inline_query', async (ctx) => {
    const q = ctx.inlineQuery.query;
    await ctx.answerInlineQuery([
      {
        type: 'article',
        id: '1',
        title: `Search: ${q}`,
        input_message_content: { message_text: `Result for: ${q}` },
      },
    ]);
  });

  const lab = createLab(bot);
  const user = lab.user(10, 'Eve');

  const result = await user.inlineQuery('serverless');
  result.wantInlineAnswered(1);
});

test('Edge Case: FSM back() navigation history', async () => {
  const store = new MemorySessionStore();
  const bot = createBot();

  bot.use(session({ store }));
  const wizard = createFSM();

  wizard.step('step_1', async (ctx) => {
    ctx.fsm.goto('step_2');
  });

  wizard.step('step_2', async (ctx) => {
    ctx.fsm.goto('step_3');
  });

  wizard.step('step_3', async (ctx) => {
    // Navigate back to step_2
    const success = ctx.fsm.back();
    assert.equal(success, true);
  });

  bot.use(wizard.middleware());

  bot.command('start_wizard', async (ctx) => {
    ctx.fsm.goto('step_1');
  });

  const user = { chat: { id: 99 }, from: { id: 99 } };

  // 1. Enter flow at step_1
  await bot.handle({ ...user, text: '/start_wizard' });
  let s = await store.get('chat_user:99:99');
  assert.equal(s._fsm.step, 'step_1');

  // 2. Process step_1 -> transitions to step_2
  await bot.handle({ ...user, text: 'proceed' });
  s = await store.get('chat_user:99:99');
  assert.equal(s._fsm.step, 'step_2');

  // 3. Process step_2 -> transitions to step_3
  await bot.handle({ ...user, text: 'proceed' });
  s = await store.get('chat_user:99:99');
  assert.equal(s._fsm.step, 'step_3');

  // 4. Process step_3 -> calls back(), reverts to step_2!
  await bot.handle({ ...user, text: 'go_back' });
  s = await store.get('chat_user:99:99');
  assert.equal(s._fsm.step, 'step_2');
});

test('Edge Case: Reply quote option constructs reply_parameters', async () => {
  const api = new MockBotApi();
  const ctx = new GramlessContext({
    chat: { id: 123 },
    message_id: 456,
  }, {}, api);

  await ctx.reply('Quoting previous message', { quote: true });

  assert.equal(api.last.method, 'sendMessage');
  assert.deepEqual(api.last.params.reply_parameters, { message_id: 456 });
});
