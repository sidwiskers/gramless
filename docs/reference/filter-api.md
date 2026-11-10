# Filter API Reference

API specifications for functional filters exported from `gramless/filters` or root `Filter`.

---

## Combinators

### `Filter.all(...predicates)`
Returns a predicate that passes if and only if **all** provided sub-predicates evaluate to `true`. Short-circuits on first `false`.

### `Filter.any(...predicates)`
Returns a predicate that passes if **any** provided sub-predicate evaluates to `true`. Short-circuits on first `true`.

### `Filter.not(predicate)`
Returns a predicate that negates the result of the provided predicate.

---

## Content Filters

- `Filter.hasText` (`Filter.text`): Passes if update contains non-empty text.
- `Filter.hasPhoto` (`Filter.photo`): Passes if update contains photo attachments.
- `Filter.hasVideo` (`Filter.video`): Passes if update contains video attachments.
- `Filter.hasVoice` (`Filter.voice`): Passes if update contains voice notes.
- `Filter.hasAudio` (`Filter.audio`): Passes if update contains audio files.
- `Filter.hasDocument` (`Filter.document`): Passes if update contains document files.
- `Filter.hasSticker` (`Filter.sticker`): Passes if update contains stickers.
- `Filter.hasAnimation` (`Filter.animation`): Passes if update contains animations/GIFs.
- `Filter.hasLocation` (`Filter.location`): Passes if update contains location coordinates.
- `Filter.hasContact` (`Filter.contact`): Passes if update contains contacts.
- `Filter.hasPoll` (`Filter.poll`): Passes if update contains a poll.
- `Filter.hasDice` (`Filter.dice`): Passes if update contains animated dice.

---

## Bot API 10.4 Filters

- `Filter.hasWidget` (`Filter.widget`): Passes if the message contains an attached HTML widget.
- `Filter.isWidgetQuery` (`Filter.widgetQuery`): Passes if update is an incoming query from an HTML widget.
- `Filter.isSharedWidgetQuery` (`Filter.sharedWidgetQuery`): Passes if update is an incoming query from a shared HTML widget.
- `Filter.hasTonTransfer` (`Filter.tonTransfer`): Passes if update is a TON blockchain transfer service message.
- `Filter.hasPaidMessagesWaived` (`Filter.paidMessagesWaived`): Passes if update is a paid messages waived service notification.

---

## Chat Type Filters

- `Filter.private`: Passes if message is from a 1-on-1 private chat.
- `Filter.group`: Passes if chat type is `'group'` or `'supergroup'`.
- `Filter.channel`: Passes if chat type is `'channel'`.

---

## Parameterized Filters

- `Filter.textPrefix(prefix)`: Matches messages starting with a specific prefix string.
- `Filter.textMatches(regex)`: Matches messages satisfying a regular expression.
- `Filter.fromUsers(...userIds)`: Matches updates from specified user IDs.
- `Filter.inChats(...chatIds)`: Matches updates originating in specified chat IDs.
