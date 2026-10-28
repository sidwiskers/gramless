import { createBot, session, createFSM } from 'gramless';
import { db } from 'sdk';
import { eq } from 'sdk/db';
import { sessions } from '../schema.js';
import { TgCloudSessionStore } from 'gramless/session';

export const bot = createBot({
  onError: async (err, ctx) => {
    console.error('Unhandled bot error:', err);
    await ctx.reply('An unexpected error occurred. Please try again later.');
  },
});

// 1. Transactional SQLite Session
bot.use(session({
  store: new TgCloudSessionStore({ db, table: sessions, eq }),
  initial: () => ({ notes: [] }),
}));

// 2. Multi-Step Note Creation FSM
const noteWizard = createFSM();

noteWizard.step('await_title', async (ctx) => {
  const title = ctx.text.trim();
  ctx.fsm.data.title = title;
  await ctx.reply(`Title set: "<b>${title}</b>". Now enter the note content:`, {
    parse_mode: 'HTML',
  });
  ctx.fsm.goto('await_content');
});

noteWizard.step('await_content', async (ctx) => {
  const content = ctx.text.trim();
  const title = ctx.fsm.data.title;

  ctx.session.notes.push({
    id: Date.now(),
    title,
    content,
    createdAt: new Date().toISOString(),
  });

  ctx.fsm.complete();

  await ctx.reply(`Note "<b>${title}</b>" saved.`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: 'View All Notes', data: 'list_notes' }],
      [{ text: 'Open Mini App', webApp: 'https://app8844354067.tgcloud.ai/' }],
    ],
  });
});

bot.use(noteWizard.middleware());

// 3. Command Handlers
bot.command('start', async (ctx) => {
  await ctx.reply(`Welcome <b>${ctx.from.first_name}</b> to <b>Gramless</b>.`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: 'New Note', data: 'create_note' }],
      [{ text: 'My Notes', data: 'list_notes' }],
      [{ text: 'Launch Mini App', webApp: 'https://app8844354067.tgcloud.ai/' }],
    ],
  });
});

bot.command('newnote', async (ctx) => {
  await ctx.reply('Enter the title for your new note:');
  ctx.fsm.goto('await_title');
});

// 4. Callback Query Handlers
bot.action('create_note', async (ctx) => {
  await ctx.answer();
  await ctx.reply('Enter the title for your new note:');
  ctx.fsm.goto('await_title');
});

bot.action('list_notes', async (ctx) => {
  await ctx.answer();
  const notes = ctx.session.notes || [];

  if (notes.length === 0) {
    await ctx.reply('You have no saved notes yet. Use /newnote to create one.');
    return;
  }

  const listText = notes
    .map((n, i) => `${i + 1}. <b>${n.title}</b>\n${n.content}`)
    .join('\n\n');

  await ctx.reply(`<b>Your Notes:</b>\n\n${listText}`, { parse_mode: 'HTML' });
});
