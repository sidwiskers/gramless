# Recipe 03: Multi-Step Conversation Wizards (FSM)

This recipe demonstrates building conversational forms and multi-turn onboarding flows using **Gramless FSM** (`createFSM`).

---

## The Challenge of Multi-Turn Flows in Serverless

In a serverless runtime, each message from a user arrives in an isolated execution sandbox. Without an explicit Finite State Machine:
- You end up writing brittle `if (state === 'WAITING_FOR_AGE')` spaghetti across your message handlers.
- Handling validation errors requires manually maintaining step counters.
- Supporting `/cancel` or `/back` requires complex cleanup routines.

### The Gramless FSM Solution
Gramless provides a declarative, lightweight FSM engine that integrates with your session store:
- **`wizard.step(name, handler, [guard])`**: Declares a step with an optional asynchronous validation guard. If the guard returns `false`, execution halts and the user remains on the step.
- **`ctx.fsm.goto(nextStep)`**: Transitions the user to the next scene.
- **`ctx.fsm.back()`**: Automatically reverts to the previous step using the internal history stack.
- **`ctx.fsm.complete()`**: Finalizes the flow and wipes ephemeral wizard data.
- **`cancelCommand: '/cancel'`**: Global cancellation hook that cleans up conversation state from anywhere in the flow.

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

## Rules That Bite

- **Session Middleware Must Precede FSM:** `bot.use(session(...))` must be registered **before** `bot.use(wizard.middleware())`, as the FSM stores scene state and transition history directly inside `ctx.session.__fsm`.
- **Always Await Guard Predicates:** Guards can be asynchronous (e.g. querying a database to verify an invite code). Ensure you return a boolean `true` or `false`.
