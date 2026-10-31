import test from 'node:test';
import assert from 'node:assert/strict';
import { createFSM } from '../src/fsm.js';
import { session, MemorySessionStore } from '../src/session.js';
import { GramlessRouter } from '../src/router.js';

test('FSM: multi-step onboarding wizard execution', async () => {
  const router = new GramlessRouter();
  const store = new MemorySessionStore();
  const responses = [];

  const mockApi = {
    async sendMessage(params) {
      responses.push(params.text);
      return { message_id: 1, ...params };
    },
  };

  router.use(session({ store }));

  const onboarding = createFSM();

  // Step 1: Handle Name input -> Ask Email
  onboarding.step('ask_name', async (ctx) => {
    const name = ctx.text.trim();
    ctx.fsm.data.name = name;
    await ctx.reply(`Nice to meet you, ${name}! What is your email?`);
    ctx.fsm.goto('ask_email');
  });

  // Step 2: Handle Email input (with guard validation) -> Complete
  onboarding.step(
    'ask_email',
    async (ctx) => {
      ctx.fsm.data.email = ctx.text.trim();
      await ctx.reply(`Profile saved! Name: ${ctx.fsm.data.name}, Email: ${ctx.fsm.data.email}`);
      ctx.fsm.complete();
    },
    async (ctx) => {
      const email = ctx.text.trim();
      if (!email.includes('@')) {
        await ctx.reply('Invalid email format. Please enter a valid email:');
        return false;
      }
      return true;
    }
  );

  router.use(onboarding.middleware());

  // Command to initiate flow
  router.command('signup', async (ctx) => {
    await ctx.reply('Welcome! What is your name?');
    ctx.fsm.goto('ask_name');
  });

  const user = { chat: { id: 77 }, from: { id: 77 } };

  // 1. User sends /signup
  await router.handle({ ...user, text: '/signup' }, {}, mockApi);
  assert.equal(responses[0], 'Welcome! What is your name?');

  // 2. User sends name
  await router.handle({ ...user, text: 'Alex' }, {}, mockApi);
  assert.equal(responses[1], 'Nice to meet you, Alex! What is your email?');

  // 3. User sends invalid email
  await router.handle({ ...user, text: 'invalid_email_string' }, {}, mockApi);
  assert.equal(responses[2], 'Invalid email format. Please enter a valid email:');

  // 4. User sends valid email
  await router.handle({ ...user, text: 'alex@example.com' }, {}, mockApi);
  assert.equal(responses[3], 'Profile saved! Name: Alex, Email: alex@example.com');

  // 5. Verify FSM is finished
  const finalSession = await store.get('chat_user:77:77');
  assert.equal(finalSession._fsm, undefined);
});

test('FSM: cancellation via /cancel command', async () => {
  const router = new GramlessRouter();
  const store = new MemorySessionStore();
  const responses = [];

  const mockApi = {
    async sendMessage(params) {
      responses.push(params.text);
      return { message_id: 1, ...params };
    },
  };

  router.use(session({ store }));
  const flow = createFSM();

  flow.step('step_1', async (ctx) => {
    ctx.fsm.goto('step_2');
  });

  router.use(flow.middleware());

  router.command('start_flow', async (ctx) => {
    ctx.fsm.goto('step_1');
  });

  const user = { chat: { id: 88 }, from: { id: 88 } };

  await router.handle({ ...user, text: '/start_flow' }, {}, mockApi);
  const sessionActive = await store.get('chat_user:88:88');
  assert.equal(sessionActive._fsm.step, 'step_1');

  // User cancels
  await router.handle({ ...user, text: '/cancel' }, {}, mockApi);
  assert.equal(responses[0], 'Operation cancelled.');

  const sessionCancelled = await store.get('chat_user:88:88');
  assert.equal(sessionCancelled._fsm, undefined);
});

test('FSM: non-text update handling (photo/media) without crashing cancelTrigger check', async () => {
  const router = new GramlessRouter();
  const store = new MemorySessionStore();
  let photoHandled = false;

  router.use(session({ store }));
  const flow = createFSM({ cancelCommand: '/abort' });

  flow.step('await_photo', async (ctx) => {
    if (ctx.raw.photo) {
      photoHandled = true;
      ctx.fsm.complete();
    }
  });

  router.use(flow.middleware());

  router.command('upload', async (ctx) => {
    ctx.fsm.goto('await_photo');
  });

  const user = { chat: { id: 99 }, from: { id: 99 } };

  // 1. Enter step
  await router.handle({ ...user, text: '/upload' });

  // 2. Send photo (text is undefined/null)
  await router.handle({ ...user, photo: [{ file_id: 'photo_123' }] });
  assert.equal(photoHandled, true);
});

test('FSM: cancellation via inline callback query button', async () => {
  const router = new GramlessRouter();
  const store = new MemorySessionStore();
  const responses = [];

  const mockApi = {
    async sendMessage(params) {
      responses.push(params.text);
      return { message_id: 1, ...params };
    },
  };

  router.use(session({ store }));
  const flow = createFSM();
  flow.onCancel('cancel_flow', async (ctx) => {
    responses.push('Flow aborted via button');
  });

  flow.step('active_step', async (ctx) => {
    // waiting
  });

  router.use(flow.middleware());

  router.command('start', async (ctx) => {
    ctx.fsm.goto('active_step');
  });

  const user = { chat: { id: 105 }, from: { id: 105 } };
  await router.handle({ ...user, text: '/start' }, {}, mockApi);

  // User presses Cancel inline button: callback query with data 'cancel_flow'
  await router.handle({ ...user, data: 'cancel_flow' }, {}, mockApi);

  assert.equal(responses[0], 'Flow aborted via button');
  const finalSession = await store.get('chat_user:105:105');
  assert.equal(finalSession._fsm, undefined);
});

