# Context & Bot API Facade

`GramlessContext` is the ergonomic interface passed to every route handler and middleware. It wraps the entire Telegram Bot API, automatically inferring identifiers like `chat_id` and `message_id`.

---

## High-Level Message Helpers

```javascript
// Send text with keyboard buttons
await ctx.reply('Hello!', {
  parse_mode: 'HTML',
  buttons: [
    [{ text: 'Visit Website 🌐', url: 'https://tgcloud.ai' }],
    [{ text: 'Action ⚡', data: 'action:do' }],
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
await ctx.react('🔥');
await ctx.chatAction('typing');
await ctx.sendPoll('Poll Question', ['Option A', 'Option B']);
await ctx.sendDice('🎯');
```

---

## Day-Zero Escape Hatches

Gramless never limits you to pre-existing methods. If Telegram releases a new method today, call it immediately:

```javascript
// Raw method escape hatch:
await ctx.call('sendPaidMedia', {
  chat_id: ctx.chatId,
  star_count: 10,
  media: [...],
});
```
