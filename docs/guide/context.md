# Context & Bot API Facade

`GramlessContext` is the ergonomic interface passed to every route handler and middleware. It wraps the entire Telegram Bot API, automatically inferring identifiers like `chat_id` and `message_id`.

---

## High-Level Message Helpers

```javascript
// Send text with keyboard buttons
await ctx.reply('Hello!', {
  parse_mode: 'HTML',
  buttons: [
    [{ text: 'Visit Website', url: 'https://tgcloud.ai' }],
    [{ text: 'Action', data: 'action:do' }],
  ],
});

// Edit existing message or reply markup
await ctx.edit('Updated content');
await ctx.editCaption('New caption');
await ctx.editKeyboard([[{ text: 'Refreshed', data: 'noop' }]]);

// Pinning, forwarding, and deleting
await ctx.pin();
await ctx.unpin();
await ctx.delete();
await ctx.forward(targetChatId);
await ctx.copy(targetChatId);
```

---

## Media & Engagement Methods

```javascript
// Media
await ctx.sendPhoto(fileId, { caption: 'Landscape' });
await ctx.sendVideo(fileId);
await ctx.sendVoice(fileId);
await ctx.sendDocument(fileId);
await ctx.sendAnimation(gifId);

// Engagement
await ctx.chatAction('typing');
await ctx.sendPoll('Poll Question', ['Option A', 'Option B']);
await ctx.sendDice('🎯');
```

---

## Interactive HTML Widgets & Ephemeral Replies (Bot API 10.4)

```javascript
// 1. Send an interactive HTML widget (1-32,768 bytes, private chats):
await ctx.sendWidget('<div><h3>Vote 2026</h3><button>Candidate A</button></div>', {
  widget_id: 'voting_widget',
  cache_time: 300,
});

// 2. Re-send a shared widget:
await ctx.sendSharedWidget('shared_leaderboard_xyz');

// 3. Ephemeral callback reply without passing chat_id:
await ctx.replyEphemeral('This reply is only visible to you!');

// 4. Quoting rich messages:
await ctx.reply('Quoting rich block', {
  quote_rich_texts: true,
  quote: 'Target quote',
});
```

---

## Execution Budget & Transactional Checkpointing

```javascript
// Inspect time remaining before platform isolate termination:
console.log(`Remaining budget: ${ctx.remainingMs()}ms`);

if (ctx.hasTimeFor(1500)) {
  // Commit intermediate session state to SQLite immediately:
  await ctx.checkpoint();
}
```

---

## Direct API Access (`ctx.call`)

Any method supported by the Telegram Bot API can be called directly:

```javascript
await ctx.call('sendPaidMedia', {
  chat_id: ctx.chatId,
  star_count: 10,
  media: [...],
});
```
