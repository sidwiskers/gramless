# Composable Functional Filters

Gramless provides pure functional filters (`Filter`) to route and guard handlers without reflection or bloated regex overhead.

---

## Logical Combinators

Compose complex conditions cleanly:

```javascript
import { Filter } from 'gramless';

// 1. Filter.all (Logical AND)
const adminGroupPhoto = Filter.all(
  Filter.group,
  Filter.fromUsers(123456, 789012),
  Filter.hasPhoto
);

bot.on(adminGroupPhoto, async (ctx) => {
  await ctx.reply('Admin photo received in group.');
});

// 2. Filter.any (Logical OR)
const voiceOrAudio = Filter.any(Filter.hasVoice, Filter.hasAudio);

// 3. Filter.not (Logical NOT)
const nonBotMessage = Filter.not(Filter.isBot);
```

---

## Standard Predicates

| Predicate | Condition |
| :--- | :--- |
| `Filter.private` | `ctx.chatType === 'private'` |
| `Filter.group` | `ctx.chatType === 'group' \|\| ctx.chatType === 'supergroup'` |
| `Filter.channel` | `ctx.chatType === 'channel'` |
| `Filter.hasText` | Update contains non-empty text |
| `Filter.hasPhoto` | Update contains photos |
| `Filter.hasVideo` | Update contains videos |
| `Filter.hasDocument` | Update contains documents |
| `Filter.hasVoice` | Update contains voice notes |
| `Filter.hasLocation` | Update contains GPS coordinates |
| `Filter.fromUsers(...ids)` | Author matches one of the specified user IDs |
| `Filter.regex(pattern)` | Message text matches regular expression |
