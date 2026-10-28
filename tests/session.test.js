import test from 'node:test';
import assert from 'node:assert/strict';
import { session, MemorySessionStore, TgCloudSessionStore, SessionKey } from '../src/session.js';
import { GramlessRouter } from '../src/router.js';

test('Session: persists state across sequential handler calls', async () => {
  const store = new MemorySessionStore();
  const router = new GramlessRouter();

  router.use(session({
    store,
    getKey: SessionKey.byUser,
    initial: () => ({ count: 0 }),
  }));

  router.command('increment', async (ctx) => {
    ctx.session.count += 1;
  });

  const msg = { chat: { id: 100 }, from: { id: 100 }, text: '/increment' };

  // First call
  await router.handle(msg);
  const stored1 = await store.get('user:100');
  assert.equal(stored1.count, 1);

  // Second call
  await router.handle(msg);
  const stored2 = await store.get('user:100');
  assert.equal(stored2.count, 2);
});

test('Session: transactional rollback on handler error/panic', async () => {
  const store = new MemorySessionStore();
  await store.set('user:200', { balance: 100 });

  const router = new GramlessRouter();
  router.use(session({
    store,
    getKey: SessionKey.byUser,
  }));

  router.command('withdraw', async (ctx) => {
    // 1. Mutate state in memory
    ctx.session.balance -= 50;

    // 2. Outbound action throws (e.g. network failure or panic)
    throw new Error('Telegram Bot API timeout during transfer');
  });

  const msg = { chat: { id: 200 }, from: { id: 200 }, text: '/withdraw' };

  await assert.rejects(
    async () => router.handle(msg),
    { message: 'Telegram Bot API timeout during transfer' }
  );

  // CRITICAL INVARIANT: The stored state MUST remain 100, not 50!
  const storedAfterCrash = await store.get('user:200');
  assert.equal(storedAfterCrash.balance, 100, 'Session state must roll back on handler error');
});

test('Session: deleting session (ctx.session = null)', async () => {
  const store = new MemorySessionStore();
  await store.set('user:300', { temporaryToken: 'abc-123' });

  const router = new GramlessRouter();
  router.use(session({
    store,
    getKey: SessionKey.byUser,
  }));

  router.command('logout', async (ctx) => {
    ctx.session = null;
  });

  await router.handle({ chat: { id: 300 }, from: { id: 300 }, text: '/logout' });

  const afterLogout = await store.get('user:300');
  assert.equal(afterLogout, null);
});

test('Session: TgCloud SQLite adapter simulation', async () => {
  const fakeRows = new Map();
  const mockTable = { id: 'col_id', data: 'col_data' };

  const mockDb = {
    select() {
      return {
        from() {
          return {
            where(condition) {
              return {
                async get() {
                  return fakeRows.get(condition.key) || null;
                },
              };
            },
          };
        },
      };
    },
    insert(table) {
      return {
        values(val) {
          return {
            onConflictDoUpdate({ target, set }) {
              return {
                async run() {
                  fakeRows.set(val.id, { id: val.id, data: set.data });
                },
              };
            },
          };
        },
      };
    },
    delete(table) {
      return {
        where(condition) {
          return {
            async run() {
              fakeRows.delete(condition.key);
            },
          };
        },
      };
    },
  };

  const mockEq = (col, val) => ({ col, key: val });

  const tgStore = new TgCloudSessionStore({
    db: mockDb,
    table: mockTable,
    eq: mockEq,
  });

  await tgStore.set('chat_user:1:2', { step: 'order_review' });
  const fetched = await tgStore.get('chat_user:1:2');
  assert.deepEqual(fetched, { step: 'order_review' });

  await tgStore.delete('chat_user:1:2');
  const afterDel = await tgStore.get('chat_user:1:2');
  assert.equal(afterDel, null);
});
