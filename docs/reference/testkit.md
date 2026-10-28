# Gramless Lab (Testkit Reference)

API specification for deterministic, offline testing via `gramless/testkit`.

---

## `createLab(bot)`
Creates a virtual in-process Telegram environment.

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
- `await actor.text(text)`: Simulates sending standard message text.
- `await actor.click(callbackData)`: Simulates clicking an inline keyboard button.

---

## Matchers

- `Sent(pattern, options)`: Asserts that a message matching string or regex pattern was sent.
- `Edited(pattern)`: Asserts that an existing message was edited with matching text.
- `Answered([pattern])`: Asserts that `answerCallbackQuery` was called, optionally matching text.

```javascript
const res = await alice.command('/menu');
res.want(Sent('Main Menu:'));

const clickRes = await alice.click('btn_help');
clickRes.want(Answered());
clickRes.want(Edited('Help contents'));
```
