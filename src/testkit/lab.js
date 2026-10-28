/**
 * Gramless Lab: Deterministic In-Process Test Harness
 * 
 * Provides network-free, token-free simulation of Telegram Serverless
 * bots, handlers, and multi-turn conversations.
 */

import { MockBotApi } from './mock_api.js';
import { LabActor } from './actor.js';
import { MemorySessionStore } from '../session.js';

export class GramlessLab {
  /**
   * @param {import('../router.js').GramlessRouter} router
   */
  constructor(router) {
    this.router = router;
    this.api = new MockBotApi();
    this.store = new MemorySessionStore();

    // Attach mock API to router if not already configured
    if (!this.router.api) {
      this.router.api = this.api;
    }
  }

  /**
   * Creates a simulated virtual actor.
   * @param {Object} [profile={}]
   * @returns {LabActor}
   */
  actor(profile = {}) {
    return new LabActor(this, profile);
  }

  /**
   * Shorthand to create a private chat user actor.
   * @param {number} id
   * @param {string} [name='Alice']
   * @returns {LabActor}
   */
  user(id, name = 'Alice') {
    return this.actor({ id, firstName: name, username: name.toLowerCase(), chatType: 'private' });
  }

  /**
   * Shorthand to create a group chat member actor.
   * @param {number} userId
   * @param {number} groupId
   * @param {string} [name='Bob']
   * @returns {LabActor}
   */
  groupMember(userId, groupId, name = 'Bob') {
    return this.actor({ id: userId, chatId: groupId, firstName: name, chatType: 'supergroup' });
  }
}

/**
 * Creates and initializes a new Gramless Lab testing environment.
 * @param {import('../router.js').GramlessRouter} router
 * @returns {GramlessLab}
 */
export function createLab(router) {
  return new GramlessLab(router);
}

// Fluent Matcher Helpers
export const Sent = (pattern, options) => (calls) => {
  const sent = calls.filter(c => c.method === 'sendMessage');
  if (sent.length === 0) {
    throw new Error('Expected sendMessage to be called, but zero messages were sent');
  }
  const match = sent.find(call => {
    const text = call.params.text || '';
    return pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
  });
  if (!match) {
    throw new Error(`Expected sent message matching "${pattern}", but got: ${sent.map(s => `"${s.params.text}"`).join(', ')}`);
  }
};

export const Edited = (pattern) => (calls) => {
  const edited = calls.filter(c => c.method === 'editMessageText');
  if (edited.length === 0) {
    throw new Error('Expected editMessageText to be called, but zero edits occurred');
  }
  const match = edited.find(call => {
    const text = call.params.text || '';
    return pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
  });
  if (!match) {
    throw new Error(`Expected edited message matching "${pattern}", but got: ${edited.map(s => `"${s.params.text}"`).join(', ')}`);
  }
};

export const Answered = (pattern) => (calls) => {
  const answered = calls.filter(c => c.method === 'answerCallbackQuery');
  if (answered.length === 0) {
    throw new Error('Expected answerCallbackQuery to be called, but none occurred');
  }
  if (pattern) {
    const match = answered.find(call => (call.params.text || '').includes(pattern));
    if (!match) {
      throw new Error(`Expected callback answer matching "${pattern}"`);
    }
  }
};
