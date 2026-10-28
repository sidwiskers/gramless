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

- `Filter.hasText`: Passes if update contains non-empty text.
- `Filter.hasPhoto`: Passes if update contains photo attachments.
- `Filter.hasVideo`: Passes if update contains video attachments.
- `Filter.hasVoice`: Passes if update contains voice notes.
- `Filter.hasAudio`: Passes if update contains audio files.
- `Filter.hasDocument`: Passes if update contains document files.
- `Filter.hasSticker`: Passes if update contains stickers.
- `Filter.hasAnimation`: Passes if update contains animations/GIFs.
- `Filter.hasLocation`: Passes if update contains location coordinates.

---

## Chat Type Filters

- `Filter.private`: Passes if message is from a 1-on-1 private chat.
- `Filter.group`: Passes if chat type is `'group'` or `'supergroup'`.
- `Filter.channel`: Passes if chat type is `'channel'`.
