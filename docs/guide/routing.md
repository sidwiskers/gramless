# Routing & Middleware

Gramless features a compiled, constant-time router designed for zero array allocations on the hot execution path.

---

## Command Routing ($O(1)$)

Commands are registered on the bot instance and resolved via a pre-compiled `Map`:

```javascript
bot.command('start', async (ctx) => {
  await ctx.reply('Bot started!');
});

// Accessing command arguments
bot.command('kick', async (ctx) => {
  // e.g. /kick @spammer 10m
  console.log('Payload:', ctx.payload); // "@spammer 10m"
  console.log('Args:', ctx.args);       // ["@spammer", "10m"]
});
```

### Multiline & Group Chat Parsing
- Automatically handles multiline arguments (`/cmd\nline1\tline2`).
- Filters out commands directed at other bots in group chats (e.g. `/start@other_bot` is ignored if `username` is configured).

---

## Callback Query Routing

Inline keyboard button presses can be matched using exact strings, prefixes, or regular expressions:

```javascript
// 1. Exact string matching (O(1) Map lookup):
bot.action('settings:view', async (ctx) => {
  await ctx.answer();
});

// 2. Prefix matching (ordered by descending prefix length):
bot.action('user:page:', async (ctx) => {
  const page = ctx.callbackData.replace('user:page:', '');
  await ctx.answer();
});

// 3. Regular Expression matching:
bot.action(/^order:(\d+):cancel$/, async (ctx) => {
  const orderId = ctx.match[1];
  await ctx.answer(`Order #${orderId} cancelled`);
});
```

---

## HTML Widget Query Routing (Bot API 10.4)

Queries sent from interactive HTML widgets are routed via `bot.widgetQuery(trigger, ...)` or shorthand `bot.widget(trigger, ...)`:

```javascript
// 1. Exact data match:
bot.widget('poll:vote:option_a', async (ctx) => {
  await ctx.answerWidgetQuery('{"status": "recorded"}');
  await ctx.editMessageWidgetData({ data: 'poll_state:voted' });
});

// 2. Length-sorted prefix match:
bot.widgetQuery('cart:', async (ctx) => {
  await ctx.answerWidgetQuery('{"cart_updated": true}');
});

// 3. Regular Expression match:
bot.widgetQuery(/^candidate:(\w+)$/, async (ctx) => {
  const candidate = ctx.match[1];
  await ctx.answerWidgetQuery(`{"selected": "${candidate}"}`);
});

// 4. Shared widget updates:
bot.on('shared_widget_query', async (ctx) => {
  await ctx.answerWidgetQuery('{"shared": true}');
});
```

---

## Middleware Pipeline

Gramless supports Onion-model middleware. Middlewares are compiled at registration time into a single executable closure chain:

```javascript
// Global logging middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`Update processed in ${Date.now() - start}ms`);
});

// Authentication middleware
bot.use(async (ctx, next) => {
  if (ctx.userId === BANNED_USER_ID) return;
  return next();
});
```
