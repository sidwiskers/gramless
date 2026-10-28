# Context API Reference

Full method specification for `GramlessContext`.

---

## Properties

| Property | Type | Description |
| :--- | :--- | :--- |
| `ctx.chatId` | `number \| string \| null` | Resolved identifier of the current chat |
| `ctx.userId` | `number \| null` | Resolved identifier of the user who triggered the update |
| `ctx.chatType` | `string \| null` | `'private'`, `'group'`, `'supergroup'`, or `'channel'` |
| `ctx.text` | `string \| null` | Incoming message text or empty string |
| `ctx.caption` | `string \| null` | Media caption or empty string |
| `ctx.callbackData` | `string \| null` | Inline button callback payload |
| `ctx.state` | `Record<string, any>` | Ephemeral update state for custom middlewares |
| `ctx.session` | `any` | Transactional persistent session data |

---

## Outbound Methods

### Message & Media
- `ctx.reply(text, options)`: Sends message to current chat. Supports `buttons: [...]` shorthand.
- `ctx.edit(text, options)`: Edits current message text.
- `ctx.editCaption(caption, options)`: Edits current message caption.
- `ctx.editKeyboard(keyboard)`: Edits current message reply markup.
- `ctx.sendPhoto(photo, options)`: Sends photo with optional caption.
- `ctx.sendVideo(video, options)`: Sends video.
- `ctx.sendVoice(voice, options)`: Sends voice note.
- `ctx.sendDocument(doc, options)`: Sends file document.
- `ctx.sendAnimation(animation, options)`: Sends animation/GIF.

### Interactivity & Reactions
- `ctx.react(emoji)`: Adds a native emoji reaction to the message.
- `ctx.chatAction(action)`: Broadcasts action (e.g. `'typing'`, `'upload_photo'`).
- `ctx.answer(text, options)`: Dismisses callback query loading indicator.
- `ctx.alert(text)`: Displays an alert modal for callback query.

### Moderation & Administration
- `ctx.banMember(userId, options)`: Bans a user from the chat.
- `ctx.unbanMember(userId)`: Unbans a user.
- `ctx.banSender(revokeMessages)`: Bans author of current message and optionally deletes their messages.
- `ctx.restrictMember(userId, options)`: Restricts chat member permissions.
- `ctx.delete()`: Deletes current message.
- `ctx.pin(options)` / `ctx.unpin()`: Pins or unpins current message.

### Day-Zero Raw Call
- `ctx.call(method, params)`: Calls any Telegram Bot API method directly.
