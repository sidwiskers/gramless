# Gramless Lab (Testkit Reference)

API specification for deterministic, offline testing via `gramless/testkit`.

---

## `createLab(bot)`
Creates a virtual in-process Telegram testing harness.

```javascript
import { createLab } from 'gramless/testkit';
import { bot } from './bot.js';

const lab = createLab(bot);
```

---

## `lab.user(id, [firstName])`
Creates a virtual user actor.

### Actor Simulation Methods
- `await actor.command(commandText)`: Simulates sending a command (e.g. `'/start'`).
- `await actor.message(text, [options])`: Simulates sending standard message text.
- `await actor.click(callbackData)`: Simulates clicking an inline keyboard button.
- `await actor.inline(query, [offset])`: Simulates an inline search query.
- `await actor.queryWidget(data, [options])`: Simulates an incoming query from an HTML widget (Bot API 10.4).
- `await actor.querySharedWidget(widgetId, data, [options])`: Simulates an incoming query from a shared HTML widget (Bot API 10.4).

---

## Fluent Matchers

Actor action results return a chainable `ActorExpectation`:

- `res.wantSent(pattern, [options])`: Asserts that a message matching string or regex pattern was sent.
- `res.wantEdited(pattern)`: Asserts that an existing message was edited with matching text.
- `res.wantAnswered([pattern])`: Asserts that `answerCallbackQuery` was called.
- `res.wantWidgetSent([pattern])`: Asserts that an HTML widget message was sent (`sendWidget` or `sendSharedWidget`).
- `res.wantWidgetQueryAnswered([dataPattern])`: Asserts that `answerWidgetQuery` was called with matching data.
- `res.wantInlineAnswered([expectedCount])`: Asserts that `answerInlineQuery` was called.
- `res.want(matcherFn)`: Custom assertion matcher function `(calls) => void`.

```javascript
const res = await alice.command('/menu');
res.wantSent('Main Menu:');

const widgetRes = await alice.queryWidget('action:vote:a');
widgetRes.wantWidgetQueryAnswered('voted');
```
