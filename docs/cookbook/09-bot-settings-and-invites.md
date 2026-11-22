# Recipe 09: Bot Settings Automation & Dedicated Invite Links

Demonstrates how to use Telegram Bot API 10.5 features in Gramless to automate bot settings and handle multi-user invite onboarding in private chats.

---

## What This Recipe Demonstrates

1. **Programmatic Bot Settings (`ctx.setMySettings`)**:
   - Enables topic sidebars in private chats (`has_topic_sidebar: true`).
   - Enables forum topics in private chats (`has_topics_enabled: true`).
   - Configures `callback_query_mode: 'inline'` so button callback queries return `inline_message_id`.
   - Enables inline queries and sets custom query placeholders.
2. **Inspecting Bot Full Information (`ctx.getMe`)**:
   - Returns a `BotFullInfo` object containing `active_usernames`, `has_topic_sidebar`, and configuration status.
3. **Handling Dedicated Bot Invite Links (`write_access_allowed.inviter`)**:
   - Bot owners can invite up to 10 users at once via `https://t.me/botinvite/<bot_username>`.
   - The bot receives a service message with write access granted and extracts `ctx.inviter`.
   - Uses `Filter.invitedUser` to greet newly invited users immediately with personalized messages.
4. **Callback Query Editing outside Inline Mode**:
   - `ctx.edit()`, `ctx.editCaption()`, and `ctx.editKeyboard()` transparently route through `inline_message_id`.

---

## Project Structure

```text
09-bot-settings-and-invites/
├── package.json
├── tgcloud.jsonc
└── tgcloud/
    ├── handlers/
    │   ├── message.js
    │   └── callback_query.js
    └── lib/
        └── bot.js
```

---

## Code Walkthrough

### 1. Route Definitions (`tgcloud/lib/bot.js`)

```javascript
import { createBot, Filter } from 'gramless';

export const bot = createBot();

// 1. Programmatic Settings Setup (Bot API 10.5)
bot.command('setup', async (ctx) => {
  await ctx.chatAction('typing');

  await ctx.setMySettings({
    supports_inline_queries: true,
    inline_query_placeholder: 'Search topics or commands...',
    has_topics_enabled: true,
    has_topic_sidebar: true,
    can_communicate_with_bots: true,
    callback_query_mode: 'inline',
  });

  const me = await ctx.getMe();

  await ctx.reply(
    `<b>Settings Configured!</b>\n\n` +
    `• Username: @${me.username}\n` +
    `• Topic Sidebar: ${me.has_topic_sidebar ? 'Enabled' : 'Disabled'}\n` +
    `• Bot Communication: ${me.can_communicate_with_bots ? 'Enabled' : 'Disabled'}\n` +
    `• Active Usernames: ${me.active_usernames?.join(', ') || 'N/A'}`,
    {
      parse_mode: 'HTML',
      buttons: [
        [{ text: 'Interactive Callback', data: 'action:ping' }],
      ],
    }
  );
});

// 2. Onboard Invited Users via Dedicated Invite Links (Bot API 10.5)
bot.on(Filter.invitedUser, async (ctx) => {
  const inviter = ctx.inviter;
  const inviterName = inviter ? (inviter.username ? `@${inviter.username}` : inviter.first_name) : 'The Admin';

  await ctx.reply(
    `👋 Welcome to the team, <b>${ctx.from?.first_name || 'there'}</b>!\n\n` +
    `You were invited directly by <b>${inviterName}</b>. Use the topic sidebar to explore sections.`,
    {
      parse_mode: 'HTML',
    }
  );
});

// 3. Callback Action with inline_message_id support
bot.action('action:ping', async (ctx) => {
  await ctx.answer({ text: 'Acknowledged' });

  // Works automatically whether ctx contains message or inline_message_id
  await ctx.edit(
    `<b>Action Updated</b>\n\nCallback mode: <code>${ctx.inlineMessageId ? 'inline_message_id' : 'standard'}</code>`,
    {
      parse_mode: 'HTML',
      buttons: [
        [{ text: 'Refresh', data: 'action:ping' }],
      ],
    }
  );
});
```

### 2. Handler Re-exports (`tgcloud/handlers/message.js`)

```javascript
import { bot } from '../lib/bot.js';

export default bot.handler();
```

### 3. Handler Re-exports (`tgcloud/handlers/callback_query.js`)

```javascript
import { bot } from '../lib/bot.js';

export default bot.handler();
```

---

## Testing with Gramless Lab

You can easily simulate user invitations and callback clicks outside inline mode:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLab } from 'gramless/testkit';
import { bot } from './tgcloud/lib/bot.js';

test('onboards invited user via dedicated invite link', async () => {
  const lab = createLab(bot);
  const alice = lab.actor({ id: 1001, first_name: 'Alice' });

  // Simulate Alice joining through an invite by Bob
  const updates = await alice.joinViaInvite({ id: 999, first_name: 'Bob', username: 'bob_the_admin' });
  const reply = updates.find(u => u.method === 'sendMessage');

  assert.match(reply.params.text, /invited directly by <b>@bob_the_admin<\/b>/);
});
```
