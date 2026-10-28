import test from 'node:test';
import assert from 'node:assert/strict';
import { Filter } from '../src/filters.js';
import { GramlessRouter } from '../src/router.js';

test('Filters: chat type and content predicates', () => {
  const privateMsgCtx = {
    isPrivate: true,
    isGroup: false,
    isChannel: false,
    text: 'Hello world',
    raw: { photo: [{ file_id: 'abc' }] },
    message: { photo: [{ file_id: 'abc' }] },
    data: null,
  };

  assert.equal(Filter.private(privateMsgCtx), true);
  assert.equal(Filter.group(privateMsgCtx), false);
  assert.equal(Filter.hasText(privateMsgCtx), true);
  assert.equal(Filter.hasPhoto(privateMsgCtx), true);
  assert.equal(Filter.hasAudio(privateMsgCtx), false);
  assert.equal(Filter.isCallback(privateMsgCtx), false);
});

test('Filters: logical combinators (all, any, not)', async () => {
  const ctx = {
    isPrivate: true,
    isGroup: false,
    text: '/report 123',
    userId: 42,
    chatId: 42,
  };

  // 1. All
  const isPrivateReport = Filter.all(
    Filter.private,
    Filter.textPrefix('/report'),
    Filter.fromUsers(42, 99)
  );
  assert.equal(await isPrivateReport(ctx), true);

  // 2. Not
  const notGroup = Filter.not(Filter.group);
  assert.equal(await notGroup(ctx), true);

  // 3. Any
  const allowed = Filter.any(
    Filter.fromUsers(100), // false
    Filter.fromUsers(42)   // true
  );
  assert.equal(await allowed(ctx), true);
});

test('Filters: router.on(filter, handler) integration', async () => {
  const router = new GramlessRouter();
  const matched = [];

  // Register filter route: private text messages from user 500 starting with #tag
  const taggedPrivate = Filter.all(
    Filter.private,
    Filter.fromUsers(500),
    Filter.textMatches(/^#\w+/)
  );

  router.on(taggedPrivate, async (ctx) => {
    matched.push(ctx.text);
  });

  // 1. Should match
  await router.handle({
    chat: { id: 500, type: 'private' },
    from: { id: 500 },
    text: '#release Announcement',
  });

  // 2. Should NOT match (wrong user)
  await router.handle({
    chat: { id: 999, type: 'private' },
    from: { id: 999 },
    text: '#release Announcement',
  });

  // 3. Should NOT match (group chat)
  await router.handle({
    chat: { id: -100500, type: 'supergroup' },
    from: { id: 500 },
    text: '#release Announcement',
  });

  assert.deepEqual(matched, ['#release Announcement']);
});
