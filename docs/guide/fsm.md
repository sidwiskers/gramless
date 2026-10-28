# Conversation Wizards (FSM)

Build multi-turn conversational forms, wizards, and state machines using `createFSM`.

---

## Step Declarations & Guards

```javascript
import { createBot, session, createFSM } from 'gramless';

export const bot = createBot();
bot.use(session());

const wizard = createFSM({
  cancelCommand: '/cancel',
  onCancel: async (ctx) => {
    await ctx.reply('Registration aborted.');
  },
});

// Step 1: Collect Name
wizard.step('ask_name', async (ctx) => {
  ctx.fsm.data.name = ctx.text.trim();
  await ctx.reply(`Hello ${ctx.fsm.data.name}! What is your email?`);
  ctx.fsm.goto('ask_email');
});

// Step 2: Collect Email with asynchronous validation guard
wizard.step(
  'ask_email',
  async (ctx) => {
    ctx.fsm.data.email = ctx.text.trim();
    ctx.fsm.complete();
    await ctx.reply(`Profile saved! Email: ${ctx.fsm.data.email}`);
  },
  // Validation guard: Rejects invalid emails and retains user on current step
  async (ctx) => {
    if (!ctx.text || !ctx.text.includes('@')) {
      await ctx.reply('Invalid email address. Please try again:');
      return false;
    }
    return true;
  }
);

bot.use(wizard.middleware());
```

---

## Navigation Controls

- `ctx.fsm.goto('stepName')`: Advance to a target scene.
- `ctx.fsm.back()`: Return to the previous step via the internal history stack.
- `ctx.fsm.complete()`: Wipe wizard state and conclude the conversation.
- `/cancel`: Built-in global abort command.
