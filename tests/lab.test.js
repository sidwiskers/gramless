import test from 'node:test';
import assert from 'node:assert/strict';
import { GramlessRouter } from '../src/router.js';
import { createLab, Sent, Edited, Answered } from '../src/testkit/index.js';

test('Gramless Lab: full conversational test with command and inline button click', async () => {
  const bot = new GramlessRouter();

  bot.command('start', async (ctx) => {
    await ctx.reply(`Welcome ${ctx.from.first_name}! Choose an option:`, {
      buttons: [
        [{ text: 'My Profile', data: 'profile_view' }],
        [{ text: 'Help', data: 'help_view' }],
      ],
    });
  });

  bot.action('profile_view', async (ctx) => {
    await ctx.answer();
    await ctx.edit(`User Profile:\nID: ${ctx.userId}\nName: ${ctx.from.first_name}`);
  });

  const lab = createLab(bot);
  const alice = lab.user(42, 'Alice');

  // 1. Alice sends /start
  const step1 = await alice.command('/start');
  step1.wantSent('Welcome Alice!');

  // 2. Alice clicks the 'My Profile' button
  const step2 = await alice.click('profile_view');
  step2.wantAnswered();
  step2.wantEdited('User Profile:\nID: 42\nName: Alice');
});

test('Gramless Lab: functional matchers (Sent, Edited, Answered)', async () => {
  const bot = new GramlessRouter();

  bot.command('ping', async (ctx) => {
    await ctx.reply('pong');
  });

  bot.action('refresh', async (ctx) => {
    await ctx.answer('Refreshed');
    await ctx.edit('Latest data: OK');
  });

  const lab = createLab(bot);
  const user = lab.user(101, 'Bob');

  const pingResult = await user.command('/ping');
  pingResult.want(Sent('pong'));

  const clickResult = await user.click('refresh');
  clickResult.want(Answered('Refreshed'));
  clickResult.want(Edited('Latest data: OK'));
});
