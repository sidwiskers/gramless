import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, Menu } from '../src/menu.js';
import { GramlessRouter } from '../src/router.js';

test('menu: paginate generates accurate slicing and navigation controls', async () => {
  const items = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape'];
  let sentPayload = null;

  const fakeCtx = {
    data: null,
    async reply(text, opts) {
      sentPayload = { text, ...opts };
    },
  };

  // Page 1 (Page size 3 -> Total pages 3)
  const res1 = await paginate(fakeCtx, {
    items,
    pageSize: 3,
    page: 1,
    formatItem: (item, idx) => `${idx + 1}. ${item}`,
    callbackPrefix: 'fruit:p:',
  });

  assert.equal(res1.page, 1);
  assert.equal(res1.totalPages, 3);
  assert.equal(res1.totalCount, 7);
  assert.ok(res1.text.includes('1. Apple'));
  assert.ok(res1.text.includes('3. Cherry'));
  assert.ok(!res1.text.includes('4. Date'));

  // Verify navigation buttons
  // Row should be [ · (noop), 1/3 (noop), Next (fruit:p:2) ]
  const navRow = res1.buttons[0];
  assert.equal(navRow[0].data, 'fruit:p:noop'); // Prev is disabled
  assert.equal(navRow[1].text, '1/3');
  assert.equal(navRow[2].data, 'fruit:p:2'); // Next goes to page 2

  // Page 2
  const res2 = await paginate(fakeCtx, {
    items,
    pageSize: 3,
    page: 2,
    formatItem: (item, idx) => `${idx + 1}. ${item}`,
    callbackPrefix: 'fruit:p:',
  });

  assert.equal(res2.page, 2);
  const navRow2 = res2.buttons[0];
  assert.equal(navRow2[0].data, 'fruit:p:1'); // Prev goes to page 1
  assert.equal(navRow2[1].text, '2/3');
  assert.equal(navRow2[2].data, 'fruit:p:3'); // Next goes to page 3
});

test('menu: Menu builder creates structured buttons and registers handlers', async () => {
  const router = new GramlessRouter();
  const menu = new Menu('settings');
  let clickedAction = null;

  menu
    .text('Notifications', async () => {
      clickedAction = 'notifications';
    })
    .text('Privacy', async () => {
      clickedAction = 'privacy';
    })
    .row()
    .url('Docs', 'https://example.com/docs');

  menu.register(router);

  const buttons = menu.build();
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].length, 2);
  assert.equal(buttons[0][0].text, 'Notifications');
  assert.equal(buttons[0][1].text, 'Privacy');
  assert.equal(buttons[1][0].text, 'Docs');

  // Simulate user pressing 'Notifications' button
  let answered = false;
  const callbackQuery = {
    data: buttons[0][0].data,
    from: { id: 1 },
    chat: { id: 1 },
    id: 'query_1',
  };

  const mockApi = {
    async answerCallbackQuery() {
      answered = true;
      return true;
    },
  };

  await router.handle(callbackQuery, {}, mockApi);
  assert.equal(clickedAction, 'notifications');
  assert.equal(answered, true);
});
