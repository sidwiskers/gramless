# Context API Reference

Full method and property specification for `GramlessContext`.

---

## Properties

| Property | Type | Description |
| :--- | :--- | :--- |
| `ctx.chatId` | `number \| string \| null` | Resolved identifier of the current chat |
| `ctx.userId` | `number \| null` | Resolved identifier of the user who triggered the update |
| `ctx.chatType` | `string \| null` | `'private'`, `'group'`, `'supergroup'`, or `'channel'` |
| `ctx.text` | `string \| null` | Incoming message text or empty string |
| `ctx.caption` | `string \| null` | Media caption or empty string |
| `ctx.data` | `string \| null` | Inline button callback payload or widget query data |
| `ctx.state` | `Record<string, any>` | Ephemeral update state for custom middlewares |
| `ctx.session` | `any` | Transactional persistent session data |
| `ctx.widgetQuery` | `WidgetQuery \| null` | Incoming widget interaction query (Bot API 10.4) |
| `ctx.sharedWidgetQuery` | `SharedWidgetQuery \| null` | Incoming shared widget query (Bot API 10.4) |
| `ctx.widget` | `Widget \| null` | HTML widget payload attached to a message |
| `ctx.tonWalletTransfer` | `TonWalletTransfer \| null` | TON blockchain transfer service message data |
| `ctx.paidMessagesWaived` | `PaidMessagesWaived \| null` | Waived paid messages count metadata |
| `ctx.elapsedMs` | `number` | Wall-clock milliseconds elapsed since update began |
| `ctx.deadline` | `number` | Unix timestamp of hard platform isolate execution deadline |

---

## Outbound Methods

### Message & Media
- `ctx.reply(text, options)`: Sends message to current chat. Supports `buttons: [...]` shorthand, `ephemeral: true`, and `quote_rich_texts: true`.
- `ctx.replyEphemeral(text, options)`: Sends an ephemeral message visible only to the active user; automatically omits `chat_id` and targets callback queries (Bot API 10.4).
- `ctx.replyWithHtml(html, options)`: Shorthand to send HTML formatted text.
- `ctx.replyWithMarkdown(markdown, options)`: Shorthand to send MarkdownV2 formatted text.
- `ctx.edit(text, options)`: Edits current message text.
- `ctx.editCaption(caption, options)`: Edits current message caption.
- `ctx.editKeyboard(keyboard)`: Edits current message reply markup.
- `ctx.sendPhoto(photo, options)`: Sends photo with optional caption.
- `ctx.sendVideo(video, options)`: Sends video.
- `ctx.sendVoice(voice, options)`: Sends voice note.
- `ctx.sendDocument(doc, options)`: Sends file document.
- `ctx.sendAnimation(animation, options)`: Sends animation/GIF.

### HTML Widgets (Bot API 10.4)
- `ctx.sendWidget(html, options)`: Sends private interactive HTML widget (1–32,768 bytes, auto-validated, protected from forwarding).
- `ctx.sendSharedWidget(widgetId, options)`: Re-sends a shared widget created by the bot.
- `ctx.answerWidgetQuery(data, options)`: Responds to an incoming query sent from an HTML widget.
- `ctx.editMessageWidgetData(options)`: Updates binary data of a widget attached to a message.
- `ctx.editSharedWidgetData(widgetId, publicData, options)`: Updates global public state data of a shared widget with caching.

### Unique Gifts & Themes (Bot API 10.4)
- `ctx.getUniqueGift(name)`: Retrieves unique gift model by name.
- `ctx.deleteBusinessAccountGift(businessConnectionId, ownedGiftId)`: Removes a gift from a connected business account.
- `ctx.getChatShareThemeBackdrops()`: Retrieves available theme backdrops for chat sharing.

### Interactivity & Reactions
- `ctx.react(emoji)`: Adds a native emoji reaction to the message.
- `ctx.chatAction(action)`: Broadcasts action (e.g. `'typing'`, `'upload_photo'`).
- `ctx.answer(text, options)`: Dismisses callback query loading indicator.
- `ctx.alert(text)`: Displays an alert modal toast for callback queries.

### Moderation & Administration
- `ctx.banMember(userId, options)`: Bans a user from the chat.
- `ctx.unbanMember(userId)`: Unbans a user.
- `ctx.banSender(revokeMessages)`: Bans author of current message and optionally deletes their messages.
- `ctx.restrictMember(userId, options)`: Restricts chat member permissions.
- `ctx.delete()`: Deletes current message.
- `ctx.pin(options)` / `ctx.unpin()`: Pins or unpins current message.

### Execution Clock & Checkpointing
- `ctx.remainingMs()`: Returns milliseconds remaining before hard isolate execution deadline.
- `ctx.hasTimeFor(bufferMs)`: Returns `true` if remaining budget exceeds `bufferMs`.
- `await ctx.checkpoint()`: Immediately commits intermediate session state to SQLite before isolate timeout.

### Direct Method Invocation
- `ctx.call(method, params)`: Calls any Telegram Bot API method directly.
