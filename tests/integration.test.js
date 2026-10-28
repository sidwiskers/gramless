import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot, session, createFSM } from '../src/index.js';
import { createLab } from '../src/testkit/index.js';

test('End-to-End Integration: Complete Bot with Router, Session, FSM, and Lab', async () => {
  const bot = createBot();
  const lab = createLab(bot);

  // 1. Install Session
  bot.use(session({ store: lab.store }));

  // 2. Setup FSM Wizard for Feedback
  const feedbackFlow = createFSM();
  feedbackFlow.step('ask_rating', async (ctx) => {
    const rating = parseInt(ctx.text.trim(), 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      await ctx.reply('Please provide a number between 1 and 5:');
      return;
    }
    ctx.fsm.data.rating = rating;
    await ctx.reply('Thanks! Any comments?');
    ctx.fsm.goto('ask_comment');
  });

  feedbackFlow.step('ask_comment', async (ctx) => {
    ctx.fsm.data.comment = ctx.text.trim();
    await ctx.reply(`Feedback received! Rating: ${ctx.fsm.data.rating}★, Comment: "${ctx.fsm.data.comment}"`);
    ctx.fsm.complete();
  });

  bot.use(feedbackFlow.middleware());

  // 3. Register Commands & Actions
  bot.command('start', async (ctx) => {
    await ctx.reply('Welcome! Use /feedback to rate us or tap below:', {
      buttons: [[{ text: 'Help', data: 'action_help' }]],
    });
  });

  bot.command('feedback', async (ctx) => {
    await ctx.reply('How would you rate your experience? (1-5):');
    ctx.fsm.goto('ask_rating');
  });

  bot.action('action_help', async (ctx) => {
    await ctx.answer();
    await ctx.reply('Help menu: Just type /feedback to get started.');
  });

  // 4. Test Scenario with Lab Actor
  const user = lab.user(777, 'Charlie');

  // Step A: /start
  const r1 = await user.command('/start');
  r1.wantSent('Welcome! Use /feedback to rate us');

  // Step B: Inline button click
  const r2 = await user.click('action_help');
  r2.wantAnswered();
  r2.wantSent('Help menu: Just type /feedback');

  // Step C: Start FSM flow
  const r3 = await user.command('/feedback');
  r3.wantSent('How would you rate your experience? (1-5):');

  // Step D: Invalid rating
  const r4 = await user.message('10');
  r4.wantSent('Please provide a number between 1 and 5:');

  // Step E: Valid rating
  const r5 = await user.message('5');
  r5.wantSent('Thanks! Any comments?');

  // Step F: Comment -> Complete
  const r6 = await user.message('Gramless is lightning fast!');
  r6.wantSent('Feedback received! Rating: 5★, Comment: "Gramless is lightning fast!"');

  // Step G: Verify FSM cleaned up
  const finalState = await lab.store.get('chat_user:777:777');
  assert.equal(finalState._fsm, undefined);
});
