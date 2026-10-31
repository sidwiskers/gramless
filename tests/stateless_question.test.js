import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStatelessQuestion,
  wrapQuestionText,
  extractQuestionTag,
} from '../src/stateless_question.js';
import { GramlessRouter } from '../src/router.js';

test('statelessQuestion: wrap and extract invisible zero-width unicode tags', () => {
  const tag = 'ask_wallet';
  const text = 'Please enter your TON wallet address:';
  const wrapped = wrapQuestionText(tag, text);

  assert.ok(wrapped.includes(text));
  assert.equal(extractQuestionTag(wrapped), tag);
  assert.equal(extractQuestionTag('Normal message without tag'), null);
});

test('statelessQuestion: intercepts user reply to tagged question', async () => {
  const router = new GramlessRouter();
  let receivedAnswer = null;

  const emailQuestion = createStatelessQuestion('ask_email', async (ctx) => {
    receivedAnswer = ctx.text;
    assert.equal(ctx.questionTag, 'ask_email');
  });

  router.use(emailQuestion.middleware());

  // Command that asks the question
  let askedPayload = null;
  const mockApi = {
    async sendMessage(params) {
      askedPayload = params;
      return { message_id: 50, ...params };
    },
  };

  router.command('prompt', async (ctx) => {
    await emailQuestion.reply(ctx, 'What is your email?');
  });

  // 1. User requests prompt
  await router.handle({ chat: { id: 1 }, text: '/prompt' }, {}, mockApi);
  assert.ok(askedPayload.reply_markup.force_reply);
  assert.equal(extractQuestionTag(askedPayload.text), 'ask_email');

  // 2. User replies to the question message
  const userReply = {
    chat: { id: 1 },
    message_id: 51,
    text: 'alice@example.com',
    reply_to_message: {
      message_id: 50,
      text: askedPayload.text, // Contains invisible tag
    },
  };

  await router.handle(userReply, {}, mockApi);
  assert.equal(receivedAnswer, 'alice@example.com');
});
