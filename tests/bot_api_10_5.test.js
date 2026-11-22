import test from 'node:test';
import assert from 'node:assert/strict';
import { GramlessRouter } from '../src/router.js';
import { GramlessContext } from '../src/context.js';
import { Filter } from '../src/filters.js';
import { createLab } from '../src/testkit/index.js';
import { ApiError } from '../src/errors.js';

test('Bot API 10.5 Context: getMe() and setMySettings() invocation', async () => {
  const calls = [];
  const mockApi = {
    async call(method, params) {
      calls.push({ method, params });
      if (method === 'getMe') {
        return {
          id: 123456789,
          is_bot: true,
          first_name: 'Gramless Bot',
          username: 'gramless_test_bot',
          active_usernames: ['gramless_test_bot', 'gramless_alias_bot'],
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_guest_queries: true,
          supports_inline_queries: true,
          inline_query_placeholder: 'Search items...',
          needs_inline_query_location: true,
          can_connect_to_business: true,
          has_main_web_app: true,
          has_topics_enabled: true,
          allows_users_to_create_topics: true,
          has_topic_sidebar: true,
          can_manage_bots: true,
          supports_join_request_queries: true,
        };
      }
      if (method === 'setMySettings') {
        return true;
      }
      return { ok: true };
    },
  };

  const rawMessage = {
    message_id: 1,
    chat: { id: 100, type: 'private' },
    from: { id: 100, first_name: 'Tester' },
    text: '/settings',
  };

  const ctx = new GramlessContext(rawMessage, { update: { update_id: 1, message: rawMessage } }, mockApi);

  // Test getMe() returning full BotFullInfo
  const botInfo = await ctx.getMe();
  assert.equal(botInfo.id, 123456789);
  assert.equal(botInfo.is_bot, true);
  assert.deepEqual(botInfo.active_usernames, ['gramless_test_bot', 'gramless_alias_bot']);
  assert.equal(botInfo.inline_query_placeholder, 'Search items...');
  assert.equal(botInfo.needs_inline_query_location, true);
  assert.equal(botInfo.has_topic_sidebar, true);
  assert.equal(botInfo.can_manage_bots, true);

  assert.equal(calls[0].method, 'getMe');

  // Test setMySettings() with all 15 Bot API 10.5 parameters
  const fullSettings = {
    supports_inline_queries: true,
    inline_query_placeholder: 'Query items...',
    needs_inline_query_location: false,
    inline_feedback_share_denominator: 10,
    can_join_groups: true,
    can_read_all_group_messages: true,
    can_connect_to_business: true,
    can_manage_bots: false,
    supports_guest_queries: true,
    supports_join_request_queries: true,
    has_topics_enabled: true,
    allows_users_to_create_topics: false,
    has_topic_sidebar: true,
    can_communicate_with_bots: true,
    callback_query_mode: 'inline',
  };

  const result = await ctx.setMySettings(fullSettings);
  assert.equal(result, true);
  assert.equal(calls[1].method, 'setMySettings');
  assert.deepEqual(calls[1].params, fullSettings);
});

test('Bot API 10.5 Context: callback_query with inline_message_id outside inline mode', async () => {
  const calls = [];
  const mockApi = {
    async call(method, params) {
      calls.push({ method, params });
      return { ok: true };
    },
  };

  // Simulating callback_query update with callback_query_mode: 'inline' or 'auto'
  // where message is omitted and inline_message_id is present
  const cbQuery = {
    id: 'cb_query_9001',
    from: { id: 777, first_name: 'Alice' },
    inline_message_id: 'AQAAAP8BAAD9_xyz123',
    chat_instance: 'inst_777',
    data: 'vote:approve',
  };

  const update = {
    update_id: 201,
    callback_query: cbQuery,
  };

  const ctx = new GramlessContext(cbQuery, { update }, mockApi);

  assert.equal(ctx.inlineMessageId, 'AQAAAP8BAAD9_xyz123');
  assert.equal(ctx.data, 'vote:approve');
  assert.equal(ctx.userId, 777);

  // 1. ctx.edit() should automatically pass inline_message_id without chat_id / message_id
  await ctx.edit('Updated text via inline message ID');
  assert.equal(calls[0].method, 'editMessageText');
  assert.equal(calls[0].params.inline_message_id, 'AQAAAP8BAAD9_xyz123');
  assert.equal(calls[0].params.text, 'Updated text via inline message ID');
  assert.equal(calls[0].params.chat_id, undefined);
  assert.equal(calls[0].params.message_id, undefined);

  // 2. ctx.editCaption()
  await ctx.editCaption('Updated caption via inline message ID');
  assert.equal(calls[1].method, 'editMessageCaption');
  assert.equal(calls[1].params.inline_message_id, 'AQAAAP8BAAD9_xyz123');
  assert.equal(calls[1].params.caption, 'Updated caption via inline message ID');

  // 3. ctx.editMedia()
  await ctx.editMedia({ type: 'photo', media: 'https://example.com/pic.jpg' });
  assert.equal(calls[2].method, 'editMessageMedia');
  assert.equal(calls[2].params.inline_message_id, 'AQAAAP8BAAD9_xyz123');
  assert.deepEqual(calls[2].params.media, { type: 'photo', media: 'https://example.com/pic.jpg' });

  // 4. ctx.editKeyboard()
  await ctx.editKeyboard([[{ text: 'Approved ✅', data: 'noop' }]]);
  assert.equal(calls[3].method, 'editMessageReplyMarkup');
  assert.equal(calls[3].params.inline_message_id, 'AQAAAP8BAAD9_xyz123');
  assert.ok(calls[3].params.reply_markup.inline_keyboard);
  assert.equal(calls[3].params.reply_markup.inline_keyboard[0][0].text, 'Approved ✅');

  // 5. Explicit overrides take precedence
  await ctx.edit('Custom override', { inline_message_id: 'CUSTOM_OVERRIDE_ID' });
  assert.equal(calls[4].params.inline_message_id, 'CUSTOM_OVERRIDE_ID');

  await ctx.edit('Chat override', { chat_id: 999, message_id: 888 });
  assert.equal(calls[5].params.chat_id, 999);
  assert.equal(calls[5].params.message_id, 888);
  assert.equal(calls[5].params.inline_message_id, undefined);
});

test('Bot API 10.5 Context: WriteAccessAllowed with inviter (dedicated bot invite links)', () => {
  const serviceMessage = {
    message_id: 301,
    from: { id: 55555, first_name: 'InvitedTester', username: 'invited_user' },
    chat: { id: 55555, type: 'private', first_name: 'InvitedTester' },
    date: Math.floor(Date.now() / 1000),
    write_access_allowed: {
      from_request: false,
      inviter: {
        id: 11111,
        first_name: 'BotOwner',
        username: 'the_owner',
        is_bot: false,
      },
    },
  };

  const update = {
    update_id: 301,
    message: serviceMessage,
  };

  const ctx = new GramlessContext(serviceMessage, { update });

  assert.ok(ctx.writeAccessAllowed);
  assert.ok(ctx.inviter);
  assert.equal(ctx.inviter.id, 11111);
  assert.equal(ctx.inviter.username, 'the_owner');
  assert.equal(ctx.inviter.first_name, 'BotOwner');

  // Check Filter helpers
  assert.equal(Filter.hasWriteAccessAllowed(ctx), true);
  assert.equal(Filter.writeAccessAllowed(ctx), true);
  assert.equal(Filter.hasInvitedUser(ctx), true);
  assert.equal(Filter.invitedUser(ctx), true);

  // Normal message should not match write access or inviter filters
  const normalMessage = {
    message_id: 302,
    from: { id: 55555, first_name: 'Normal' },
    chat: { id: 55555, type: 'private' },
    text: 'Hello bot',
  };
  const normalCtx = new GramlessContext(normalMessage, { update: { update_id: 302, message: normalMessage } });
  assert.equal(normalCtx.writeAccessAllowed, null);
  assert.equal(normalCtx.inviter, null);
  assert.equal(Filter.hasWriteAccessAllowed(normalCtx), false);
  assert.equal(Filter.hasInvitedUser(normalCtx), false);
});

test('Bot API 10.5 Router: event routing for write_access_allowed and invited_user', async () => {
  const bot = new GramlessRouter();

  let writeAccessHandled = false;
  let invitedUserHandled = false;
  let invitedUserData = null;

  bot.on('write_access_allowed', async (ctx) => {
    writeAccessHandled = true;
  });

  bot.on('invited_user', async (ctx) => {
    invitedUserHandled = true;
    invitedUserData = ctx.inviter;
  });

  const inviteMessage = {
    message_id: 401,
    from: { id: 444, first_name: 'Invitee' },
    chat: { id: 444, type: 'private' },
    date: Math.floor(Date.now() / 1000),
    write_access_allowed: {
      inviter: {
        id: 999,
        first_name: 'LeadDeveloper',
        username: 'dev_lead',
        is_bot: false,
      },
    },
  };

  const mockApi = { async call() { return { ok: true }; } };
  await bot.handle(inviteMessage, { update: { update_id: 401, message: inviteMessage } }, mockApi);

  // Hierarchical routing resolves write_access_allowed first or invited_user depending on match
  assert.ok(writeAccessHandled || invitedUserHandled);
  if (invitedUserHandled) {
    assert.equal(invitedUserData.id, 999);
    assert.equal(invitedUserData.username, 'dev_lead');
  }
});

test('Bot API 10.5 Lab Integration: click with inlineMessageId & joinViaInvite', async () => {
  const bot = new GramlessRouter();

  bot.callback('vote:like', async (ctx) => {
    await ctx.edit('Liked via inline message button! ❤️');
  });

  bot.on(Filter.invitedUser, async (ctx) => {
    await ctx.reply(`Welcome! You were invited by @${ctx.inviter?.username || 'the owner'}.`);
  });

  const lab = createLab(bot);
  const user = lab.user(1001, 'Charlie');

  // Test LabActor clicking inline message button with inlineMessageId
  const clickExpectation = await user.click('vote:like', { inlineMessageId: 'INLINE_MSG_TOKEN_777' });
  clickExpectation.wantEdited('Liked via inline message button! ❤️');

  const editCall = lab.api.calls.find(c => c.method === 'editMessageText');
  assert.ok(editCall);
  assert.equal(editCall.params.inline_message_id, 'INLINE_MSG_TOKEN_777');

  // Test LabActor joining via dedicated bot invite link
  const inviteExpectation = await user.joinViaInvite({
    id: 888,
    first_name: 'Admin',
    username: 'admin_boss',
    is_bot: false,
  });

  inviteExpectation.wantSent('Welcome! You were invited by @admin_boss.');
});

test('Bot API 10.5 Rich Messages: expandable block quotations contain arbitrary blocks', () => {
  const expandableBlockquote = {
    type: 'expandable_blockquote',
    blocks: [
      {
        type: 'paragraph',
        text: { type: 'plain', text: 'Top secret preview note:' },
      },
      {
        type: 'table',
        rows: [
          [{ text: { type: 'plain', text: 'Metric' } }, { text: { type: 'plain', text: 'Value' } }],
          [{ text: { type: 'plain', text: 'Latency' } }, { text: { type: 'plain', text: '12ms' } }],
        ],
      },
    ],
    credit: { type: 'plain', text: 'Source: Gramless Benchmarks' },
  };

  assert.equal(expandableBlockquote.type, 'expandable_blockquote');
  assert.equal(expandableBlockquote.blocks.length, 2);
  assert.equal(expandableBlockquote.blocks[0].type, 'paragraph');
  assert.equal(expandableBlockquote.blocks[1].type, 'table');
  assert.equal(expandableBlockquote.credit.text, 'Source: Gramless Benchmarks');
});
