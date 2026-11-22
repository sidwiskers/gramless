import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot, Filter, renderMiniAppHtml, getTelegramThemeCss } from '../src/index.js';
import { createLab } from '../src/testkit/index.js';
import { createClient, GramlessClient, GramlessClientError } from '../src/client.js';

test('GramlessContext: webAppData and webAppPayload extraction', async () => {
  const bot = createBot();

  let capturedRaw = null;
  let capturedParsed = null;

  bot.webApp(async (ctx) => {
    capturedRaw = ctx.webAppData;
    capturedParsed = ctx.webAppPayload;
    await ctx.reply(`Received: ${capturedParsed.score} points`);
  });

  const lab = createLab(bot);
  const user = lab.actor({ id: 101, first_name: 'Alex' });

  const expectation = await user.sendWebAppData({ action: 'game_over', score: 950 });
  expectation.wantSent('Received: 950 points');

  assert.ok(capturedRaw);
  assert.equal(capturedRaw.button_text, 'Open Mini App');
  assert.deepEqual(capturedParsed, { action: 'game_over', score: 950 });
});

test('bot.webApp routing: exact string, JSON action match, and regex', async () => {
  const bot = createBot();
  const events = [];

  bot.webApp('confirm_checkout', async (ctx) => {
    events.push(`exact:${ctx.webAppData.data}`);
    await ctx.reply('Checkout confirmed');
  });

  bot.webApp('settings_save', async (ctx) => {
    events.push(`json_action:${ctx.webAppPayload.theme}`);
    await ctx.reply('Settings saved');
  });

  bot.webApp(/^order:(\d+)$/, async (ctx) => {
    events.push(`regex:${ctx.match[1]}`);
    await ctx.reply(`Order ${ctx.match[1]} received`);
  });

  const lab = createLab(bot);
  const user = lab.actor({ id: 102, first_name: 'Sam' });

  // 1. Exact string match
  await user.sendWebAppData('confirm_checkout');
  assert.equal(events[0], 'exact:confirm_checkout');

  // 2. JSON action matching
  await user.sendWebAppData({ action: 'settings_save', theme: 'dark' });
  assert.equal(events[1], 'json_action:dark');

  // 3. Regex matching
  await user.sendWebAppData('order:4582');
  assert.equal(events[2], 'regex:4582');
});

test('Filter.hasWebAppData and Filter.webAppData matchers', async () => {
  const bot = createBot();
  let filterMatched = false;

  bot.on(Filter.webAppData, async (ctx) => {
    filterMatched = true;
    await ctx.reply('Filter matched web_app_data');
  });

  const lab = createLab(bot);
  const user = lab.actor({ id: 103, first_name: 'Elena' });

  await user.sendWebAppData('some_data');
  assert.equal(filterMatched, true);
});

test('GramlessContext: answerWebAppQuery and savePreparedInlineMessage', async () => {
  const bot = createBot();

  let answerCall = null;
  let saveCall = null;

  bot.command('test_tapp', async (ctx) => {
    answerCall = await ctx.answerWebAppQuery('query_xyz123', {
      type: 'article',
      id: 'res_1',
      title: 'Success Card',
      input_message_content: { message_text: 'Done from Mini App' },
    });

    saveCall = await ctx.savePreparedInlineMessage({
      type: 'article',
      id: 'prep_1',
      title: 'Prepared Card',
      input_message_content: { message_text: 'Share this card' },
    }, { allowUserChats: true, allowGroupChats: false });

    await ctx.reply('TMA API called');
  });

  const lab = createLab(bot);
  const user = lab.actor({ id: 104, first_name: 'David' });

  await user.command('/test_tapp');

  const answerReq = lab.api.calls.find(c => c.method === 'answerWebAppQuery');
  assert.ok(answerReq);
  assert.equal(answerReq.params.web_app_query_id, 'query_xyz123');
  assert.equal(answerReq.params.result.title, 'Success Card');

  const saveReq = lab.api.calls.find(c => c.method === 'savePreparedInlineMessage');
  assert.ok(saveReq);
  assert.equal(saveReq.params.user_id, 104);
  assert.equal(saveReq.params.allow_user_chats, true);
  assert.equal(saveReq.params.allow_group_chats, false);
});

test('GramlessContext: setChatMenuButton and getChatMenuButton', async () => {
  const bot = createBot();

  bot.command('menu', async (ctx) => {
    await ctx.setChatMenuButton({
      type: 'web_app',
      text: 'Open Store',
      url: 'https://store.tgcloud.ai',
    });

    await ctx.getChatMenuButton();
    await ctx.reply('Menu button updated');
  });

  const lab = createLab(bot);
  const user = lab.actor({ id: 105, first_name: 'Olivia' });

  await user.command('/menu');

  const setReq = lab.api.calls.find(c => c.method === 'setChatMenuButton');
  assert.ok(setReq);
  assert.equal(setReq.params.chat_id, 105);
  assert.deepEqual(setReq.params.menu_button, {
    type: 'web_app',
    text: 'Open Store',
    web_app: { url: 'https://store.tgcloud.ai' },
  });

  const getReq = lab.api.calls.find(c => c.method === 'getChatMenuButton');
  assert.ok(getReq);
  assert.equal(getReq.params.chat_id, 105);
});

test('gramless/client: GramlessClient RPC caller and mock auth', async () => {
  const mockInitData = 'auth_date=1700000000&user=%7B%22id%22%3A999%2C%22first_name%22%3A%22Tester%22%2C%22username%22%3A%22tma_user%22%7D&hash=abcdef123456';
  
  let sentHeaders = null;
  let sentBody = null;

  const mockFetch = async (url, options) => {
    sentHeaders = options.headers;
    sentBody = JSON.parse(options.body);

    if (url.endsWith('/endpoints/submitScore')) {
      return {
        status: 200,
        json: async () => ({ ok: true, data: { rank: 1, topPercent: 5 } }),
      };
    }
    if (url.endsWith('/endpoints/failEndpoint')) {
      return {
        status: 400,
        json: async () => ({ ok: false, error: 'BAD_REQUEST', message: 'Score cannot be negative' }),
      };
    }
    return {
      status: 404,
      json: async () => ({ ok: false, error: 'NOT_FOUND' }),
    };
  };

  const client = createClient({
    initData: mockInitData,
    fetch: mockFetch,
    baseUrl: '/endpoints/',
  });

  assert.equal(client.user.id, 999);
  assert.equal(client.user.first_name, 'Tester');
  assert.equal(client.authDate, 1700000000);

  // 1. Successful RPC call
  const result = await client.call('submitScore', { score: 100 });
  assert.deepEqual(result, { rank: 1, topPercent: 5 });
  assert.equal(sentHeaders['X-Telegram-Init-Data'], mockInitData);
  assert.equal(sentBody.score, 100);
  assert.equal(sentBody._initData, mockInitData);

  // 2. Failed RPC call (throws GramlessClientError)
  await assert.rejects(
    async () => {
      await client.call('failEndpoint', { score: -10 });
    },
    (err) => {
      assert.ok(err instanceof GramlessClientError);
      assert.equal(err.code, 'BAD_REQUEST');
      assert.match(err.message, /Score cannot be negative/);
      return true;
    }
  );

  // 3. CloudStorage fallback
  await client.cloudStorage.setItem('theme', 'dark');
  const storedTheme = await client.cloudStorage.getItem('theme');
  assert.equal(storedTheme, 'dark');
});

test('gramless/webapp: renderMiniAppHtml generates compliant Telegram markup', () => {
  const html = renderMiniAppHtml({
    title: 'Leaderboard',
    body: '<div id="leaderboard">Top Players</div>',
    customScripts: 'console.log("Mini app mounted");',
  });

  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<title>Leaderboard<\/title>/);
  assert.match(html, /telegram-web-app\.js/);
  assert.match(html, /--tg-theme-bg-color/);
  assert.match(html, /Top Players/);
  assert.match(html, /Telegram\.WebApp\.ready\(\)/);

  const css = getTelegramThemeCss();
  assert.match(css, /--button-color:/);
  assert.match(css, /prefers-color-scheme: dark/);
});
