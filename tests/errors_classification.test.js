import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  isBlockedError,
  isNotModifiedError,
  isPermissionError,
  isNotFoundError,
} from '../src/errors.js';

describe('Telegram ApiError Classification & Diagnostics', () => {
  it('classifies bot blocked by user', () => {
    const err = new ApiError('sendMessage', 'Forbidden: bot was blocked by the user', 403);
    assert.equal(err.category, 'BLOCKED_BY_USER');
    assert.equal(err.isBlockedByUser, true);
    assert.equal(isBlockedError(err), true);
  });

  it('classifies user deactivated account', () => {
    const err = new ApiError('sendMessage', 'Forbidden: user is deactivated', 403);
    assert.equal(err.category, 'USER_DEACTIVATED');
    assert.equal(err.isUserDeactivated, true);
    assert.equal(isBlockedError(err), true);
  });

  it('classifies chat not found', () => {
    const err = new ApiError('sendMessage', 'Bad Request: chat not found', 400);
    assert.equal(err.category, 'CHAT_NOT_FOUND');
    assert.equal(err.isChatNotFound, true);
    assert.equal(isNotFoundError(err), true);
  });

  it('classifies bot kicked / banned from group', () => {
    const err = new ApiError('sendMessage', 'Forbidden: bot was kicked from the supergroup chat', 403);
    assert.equal(err.category, 'KICKED_FROM_CHAT');
    assert.equal(err.isKickedFromChat, true);
    assert.equal(isPermissionError(err), true);
  });

  it('classifies bot not a member of chat', () => {
    const err = new ApiError('sendMessage', 'Forbidden: bot is not a member of the channel chat', 403);
    assert.equal(err.category, 'NOT_MEMBER');
    assert.equal(err.isNotMember, true);
    assert.equal(isPermissionError(err), true);
  });

  it('classifies lack of admin permissions or message restrictions in group', () => {
    const err1 = new ApiError('sendMessage', 'Bad Request: not enough rights to send text messages to the chat', 400);
    assert.equal(err1.category, 'PERMISSION_DENIED');
    assert.equal(err1.isPermissionDenied, true);
    assert.equal(isPermissionError(err1), true);

    const err2 = new ApiError('pinChatMessage', 'Bad Request: CHAT_ADMIN_REQUIRED', 400);
    assert.equal(err2.category, 'PERMISSION_DENIED');
    assert.equal(err2.isPermissionDenied, true);
  });

  it('classifies message not modified', () => {
    const err = new ApiError(
      'editMessageText',
      'Bad Request: message is not modified: specified new message content and reply markup are exactly the same',
      400
    );
    assert.equal(err.category, 'MESSAGE_NOT_MODIFIED');
    assert.equal(err.isNotModified, true);
    assert.equal(isNotModifiedError(err), true);
  });

  it('classifies message to edit or delete not found', () => {
    const err = new ApiError('deleteMessage', 'Bad Request: message to delete not found', 400);
    assert.equal(err.category, 'MESSAGE_NOT_FOUND');
    assert.equal(err.isMessageNotFound, true);
    assert.equal(isNotFoundError(err), true);
  });

  it('classifies reply message not found', () => {
    const err = new ApiError('sendMessage', 'Bad Request: reply message not found', 400);
    assert.equal(err.category, 'REPLY_NOT_FOUND');
    assert.equal(err.isReplyNotFound, true);
    assert.equal(isNotFoundError(err), true);
  });

  it('classifies expired callback query', () => {
    const err = new ApiError(
      'answerCallbackQuery',
      'Bad Request: query is too old and response timeout expired or query ID is invalid',
      400
    );
    assert.equal(err.category, 'QUERY_TOO_OLD');
    assert.equal(err.isQueryTooOld, true);
  });

  it('classifies rate limiting / flood wait', () => {
    const err = new ApiError('sendMessage', 'Too Many Requests: retry after 9', 429, { retry_after: 9 });
    assert.equal(err.category, 'RATE_LIMITED');
    assert.equal(err.isRateLimited, true);
    assert.equal(err.retryAfter, 9);
  });

  it('classifies closed or deleted forum topic thread', () => {
    const err = new ApiError('sendMessage', 'Bad Request: message thread not found (TOPIC_CLOSED)', 400);
    assert.equal(err.category, 'TOPIC_CLOSED');
    assert.equal(err.isTopicClosed, true);
  });

  it('classifies media file restrictions', () => {
    const err = new ApiError('sendPhoto', 'Bad Request: wrong file identifier/HTTP URL specified', 400);
    assert.equal(err.category, 'MEDIA_RESTRICTED');
    assert.equal(err.isMediaRestricted, true);
  });
});
