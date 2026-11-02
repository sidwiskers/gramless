import { createBot, session } from 'gramless';
import { TgCloudSessionStore } from 'gramless/session';
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { sessions } from '../schema.js';

export const bot = createBot();

// Transactional SQLite Session
bot.use(session({
  store: new TgCloudSessionStore({ db, table: sessions, eq }),
  initial: () => ({ counter: 0 }),
}));

bot.command('start', async (ctx) => {
  await ctx.chatAction('typing');

  await ctx.reply(`Welcome <b>${ctx.from?.first_name || 'User'}</b>!\n\nCurrent counter: <code>${ctx.session.counter}</code>`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: '+1 Increment', data: 'action:inc' }],
      [{ text: 'Reset', data: 'action:reset' }],
    ],
  });
});

bot.action('action:inc', async (ctx) => {
  ctx.session.counter += 1;
  await ctx.answer({ text: `Counter: ${ctx.session.counter}` });
  await ctx.edit(`Counter updated: <code>${ctx.session.counter}</code>`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: '+1 Increment', data: 'action:inc' }],
      [{ text: 'Reset', data: 'action:reset' }],
    ],
  });
});

bot.action('action:reset', async (ctx) => {
  ctx.session.counter = 0;
  await ctx.answer({ text: 'Reset complete' });
  await ctx.edit(`Counter reset: <code>0</code>`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: '+1 Increment', data: 'action:inc' }],
    ],
  });
});
