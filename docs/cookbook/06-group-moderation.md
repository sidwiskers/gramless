# Recipe 06: Group and Channel Moderation

This recipe demonstrates anti-spam link filtering and administrator moderation tools using **Gramless Composable Filters** (`Filter`).

---

## Architectural Problem: Filtering High-Volume Group Updates

In group chats, your bot receives hundreds of updates per minute.
- Standard frameworks often execute full regex chains or database queries for every single update, causing heavy CPU bottlenecks.
- Without declarative filters, moderation logic ends up deeply nested inside `if (msg.chat.type === 'group' || msg.chat.type === 'supergroup')` blocks.

### The Gramless Solution
- **Composable Filters:** Gramless provides functional filter combinators (`Filter.all`, `Filter.any`, `Filter.not`) that short-circuit immediately if early conditions fail.
- **Dedicated Bot API Wrappers:** Context exposes direct moderation wrappers (`ctx.banSender(true)`, `ctx.restrictMember()`, `ctx.delete()`, `ctx.unbanMember()`) that automatically infer the current `chat_id` and `message_id`.

---

## Directory Structure

```text
06-group-moderation/
├── tgcloud/
│   ├── handlers/
│   │   ├── message.js          # Spam detection & moderation commands
│   │   └── my_chat_member.js   # Bot rights status tracking
│   └── lib/
│       └── bot.js              # Composable filter routing
├── package.json
└── tgcloud.jsonc
```

---

## Code Walkthrough

### 1. Declarative Spam Filtering

```javascript
import { createBot, Filter } from 'gramless';

export const bot = createBot();

const hasSpamLink = (ctx) => {
  const text = ctx.text || ctx.caption || '';
  return /(?:https?:\/\/)?t\.me\/[a-zA-Z0-9_]{5,}/i.test(text);
};

// Composes: MUST be a group AND MUST contain a spam link
bot.on(Filter.all(Filter.group, hasSpamLink), async (ctx) => {
  // Delete the spam message immediately
  await ctx.delete();

  // Mute author for 1 hour
  const until = Math.floor(Date.now() / 1000) + 3600;
  await ctx.restrictMember(ctx.userId, {
    permissions: { can_send_messages: false },
    until_date: until,
  });
});
```

### 2. Administrator Moderation Commands

```javascript
bot.command('ban', async (ctx) => {
  const target = ctx.message?.reply_to_message?.from;
  if (!target) return ctx.reply('Reply to the message of the user to ban.');

  // Bans the user and revokes all their past messages from the chat
  await ctx.banMember(target.id, { revoke_messages: true });
  await ctx.reply(`Banned ${target.first_name}.`);
});
```

---

## Rules That Bite

- **Bot Must Have Admin Rights:** Moderation methods (`deleteMessage`, `banChatMember`, `restrictChatMember`) require appropriate administrator privileges in the group. If permissions are missing, Telegram returns a `400 Bad Request: NOT_ENOUGH_RIGHTS`.
- **Bot Updates on Group Status:** When users add the bot to a group or change its administrator rights, Telegram delivers a `my_chat_member` update, NOT a `message`. Handle it in `tgcloud/handlers/my_chat_member.js`.
