import test from 'node:test';
import assert from 'node:assert/strict';
import { GramlessContext } from '../src/context.js';
import { MockBotApi } from '../src/testkit/mock_api.js';

test('GramlessContext: comprehensive media sending methods', async () => {
  const api = new MockBotApi();
  const ctx = new GramlessContext({
    chat: { id: 100 },
    from: { id: 200, first_name: 'Tester' },
    message_id: 50,
  }, {}, api);

  // Animation
  await ctx.sendAnimation('anim_123', { caption: 'Funny' });
  assert.equal(api.last.method, 'sendAnimation');
  assert.equal(api.last.params.animation, 'anim_123');

  // Audio & Video & Voice & Video Note
  await ctx.sendAudio('audio_123');
  assert.equal(api.last.method, 'sendAudio');

  await ctx.sendVideo('video_123');
  assert.equal(api.last.method, 'sendVideo');

  await ctx.sendVoice('voice_123');
  assert.equal(api.last.method, 'sendVoice');

  await ctx.sendVideoNote('note_123');
  assert.equal(api.last.method, 'sendVideoNote');

  // Media Group
  await ctx.sendMediaGroup([{ type: 'photo', media: 'p1' }, { type: 'photo', media: 'p2' }]);
  assert.equal(api.last.method, 'sendMediaGroup');
  assert.equal(api.last.params.media.length, 2);

  // Sticker
  await ctx.sendSticker('sticker_123');
  assert.equal(api.last.method, 'sendSticker');

  // Location & Venue & Contact
  await ctx.sendLocation(37.7749, -122.4194);
  assert.equal(api.last.method, 'sendLocation');
  assert.equal(api.last.params.latitude, 37.7749);

  await ctx.sendVenue(37.7749, -122.4194, 'HQ', '100 Market St');
  assert.equal(api.last.method, 'sendVenue');
  assert.equal(api.last.params.title, 'HQ');

  await ctx.sendContact('+1234567890', 'Alice');
  assert.equal(api.last.method, 'sendContact');
  assert.equal(api.last.params.phone_number, '+1234567890');
});

test('GramlessContext: engagement, moderation, and chat administration methods', async () => {
  const api = new MockBotApi();
  const ctx = new GramlessContext({
    chat: { id: -100555 },
    from: { id: 999 },
    message_id: 77,
  }, {}, api);

  // Poll & Stop Poll
  await ctx.sendPoll('What is your favorite color?', ['Red', 'Blue', 'Green'], { is_anonymous: false });
  assert.equal(api.last.method, 'sendPoll');
  assert.equal(api.last.params.question, 'What is your favorite color?');
  assert.deepEqual(api.last.params.options, [{ text: 'Red' }, { text: 'Blue' }, { text: 'Green' }]);

  await ctx.stopPoll();
  assert.equal(api.last.method, 'stopPoll');
  assert.equal(api.last.params.message_id, 77);

  // Dice
  await ctx.sendDice('🎯');
  assert.equal(api.last.method, 'sendDice');
  assert.equal(api.last.params.emoji, '🎯');

  // Reaction
  await ctx.react('🔥', true);
  assert.equal(api.last.method, 'setMessageReaction');
  assert.equal(api.last.params.reaction[0].emoji, '🔥');
  assert.equal(api.last.params.is_big, true);

  // Forward & Copy
  await ctx.forward(888);
  assert.equal(api.last.method, 'forwardMessage');
  assert.equal(api.last.params.chat_id, 888);
  assert.equal(api.last.params.from_chat_id, -100555);

  await ctx.copy(888);
  assert.equal(api.last.method, 'copyMessage');

  // Pin & Unpin
  await ctx.pin();
  assert.equal(api.last.method, 'pinChatMessage');
  assert.equal(api.last.params.message_id, 77);

  await ctx.unpin();
  assert.equal(api.last.method, 'unpinChatMessage');

  await ctx.unpinAll();
  assert.equal(api.last.method, 'unpinAllChatMessages');

  // Moderation
  await ctx.banSender(true);
  assert.equal(api.last.method, 'banChatMember');
  assert.equal(api.last.params.user_id, 999);
  assert.equal(api.last.params.revoke_messages, true);

  await ctx.unbanMember(999);
  assert.equal(api.last.method, 'unbanChatMember');

  await ctx.restrictMember(999, { can_send_messages: false });
  assert.equal(api.last.method, 'restrictChatMember');
  assert.equal(api.last.params.permissions.can_send_messages, false);

  // Chat Metadata & Commands
  await ctx.setChatTitle('New Title');
  assert.equal(api.last.method, 'setChatTitle');
  assert.equal(api.last.params.title, 'New Title');

  await ctx.createInviteLink({ member_limit: 10 });
  assert.equal(api.last.method, 'createChatInviteLink');
  assert.equal(api.last.params.member_limit, 10);

  await ctx.setMyCommands([{ command: 'help', description: 'Get help' }]);
  assert.equal(api.last.method, 'setMyCommands');
});
