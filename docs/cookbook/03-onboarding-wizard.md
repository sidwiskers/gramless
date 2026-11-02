# Recipe 03: Multi-Step Conversation Wizards (FSM)

This recipe demonstrates building conversational forms and multi-turn onboarding flows using **Gramless FSM** (`createFSM`).

---

## Multi-Turn Conversations in Serverless Runtimes

In a serverless architecture, each incoming update arrives in an independent execution context. Managing multi-step interactions requires maintaining conversational state between requests:
- Tracking user progression across multiple messages.
- Validating intermediate input before moving to the next step.
- Handling branching, cancellation (`/cancel`), or step rewinding (`/back`).

### Finite State Machine Implementation
Gramless includes an integrated FSM engine (`createFSM`) that coordinates directly with your session store:
- **`wizard.step(name, handler, [guard])`**: Defines a conversation step with an optional validation guard. If the guard returns `false`, execution stops and the user remains on the current step.
- **`ctx.fsm.goto(nextStep)`**: Transitions the conversation to a designated step.
- **`ctx.fsm.back()`**: Returns to the previous step using an internal transition stack.
- **`ctx.fsm.complete()`**: Completes the conversation and clears wizard state.
- **`cancelCommand: '/cancel'`**: Global cancellation command that resets conversation state.

---

## Directory Structure

```text
03-onboarding-wizard/
├── tgcloud/
│   ├── handlers/
│   │   └── message.js          # export default bot.handler();
│   └── lib/
│       └── bot.js              # FSM scenes and routes
├── package.json
└── tgcloud.jsonc
```

---

## Code Walkthrough

```javascript
import { createBot, session, createFSM } from 'gramless';

export const bot = createBot();
bot.use(session());

const wizard = createFSM({
  cancelCommand: '/cancel',
  onCancel: async (ctx) => {
    await ctx.reply('Wizard cancelled.');
  },
});

// Step 1: Input text with string length guard
wizard.step('ask_name', async (ctx) => {
  ctx.fsm.data.name = ctx.text.trim();
  await ctx.reply(`Hello ${ctx.fsm.data.name}. What is your age?`);
  ctx.fsm.goto('ask_age');
}, async (ctx) => {
  if (!ctx.text || ctx.text.trim().length < 2) {
    await ctx.reply('Please provide a valid name (at least 2 characters):');
    return false; // Rejects update, keeps user on 'ask_name'
  }
  return true;
});

// Attach FSM middleware to bot
bot.use(wizard.middleware());
```

---

## Key Considerations

- **Session Middleware Must Precede FSM:** `bot.use(session(...))` must be registered **before** `bot.use(wizard.middleware())`, as the FSM stores scene state and transition history directly inside `ctx.session.__fsm`.
- **Always Await Guard Predicates:** Guards can be asynchronous (e.g. querying a database to verify an invite code). Ensure you return a boolean `true` or `false`.
