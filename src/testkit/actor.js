/**
 * Gramless Lab: Virtual User & Chat Actor
 * 
 * Provides a fluent interface for simulating user commands, messages,
 * and inline button clicks against Gramless routers.
 */

import assert from 'node:assert/strict';

export class ActorExpectation {
  /**
   * @param {Array<any>} calls The calls recorded during this interaction
   */
  constructor(calls) {
    this.calls = calls;
  }

  /**
   * Asserts that a message matching the criteria was sent.
   * @param {string|RegExp} pattern
   * @param {Object} [options]
   */
  wantSent(pattern, options = {}) {
    const sent = this.calls.filter(c => c.method === 'sendMessage');
    assert.ok(sent.length > 0, 'Expected sendMessage to be called, but zero messages were sent');

    const matching = sent.find(call => {
      const text = call.params.text || '';
      const textMatches = pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
      if (!textMatches) return false;

      if (options.buttons) {
        // Assert keyboard is present
        const kb = call.params.reply_markup?.inline_keyboard;
        if (!kb) return false;
      }
      return true;
    });

    assert.ok(
      matching,
      `Expected sent message matching "${pattern}", but sent messages were: ${sent.map(s => `"${s.params.text}"`).join(', ')}`
    );
    return this;
  }

  /**
   * Asserts that a message was edited with the specified text.
   * @param {string|RegExp} pattern
   */
  wantEdited(pattern) {
    const edited = this.calls.filter(c => c.method === 'editMessageText');
    assert.ok(edited.length > 0, 'Expected editMessageText to be called, but zero edits occurred');

    const matching = edited.find(call => {
      const text = call.params.text || '';
      return pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
    });

    assert.ok(
      matching,
      `Expected edited message matching "${pattern}", but edits were: ${edited.map(s => `"${s.params.text}"`).join(', ')}`
    );
    return this;
  }

  /**
   * Asserts that a callback query was acknowledged or alerted.
   * @param {string|null} [pattern]
   */
  wantAnswered(pattern = null) {
    const answered = this.calls.filter(c => c.method === 'answerCallbackQuery');
    assert.ok(answered.length > 0, 'Expected answerCallbackQuery to be called');

    if (pattern) {
      const matching = answered.find(call => (call.params.text || '').includes(pattern));
      assert.ok(matching, `Expected callback answer containing "${pattern}"`);
    }
    return this;
  }

  /**
   * Chainable generic assertion matcher.
   * @param {Function} matcherFn (calls) => void
   */
  want(matcherFn) {
    matcherFn(this.calls);
    return this;
  }
}

export class LabActor {
  /**
   * @param {Object} lab
   * @param {Object} profile
   */
  constructor(lab, profile = {}) {
    this.lab = lab;
    this.id = profile.id || 10001;
    this.firstName = profile.firstName || 'TestUser';
    this.username = profile.username || 'test_user';
    this.chatId = profile.chatId || this.id;
    this.chatType = profile.chatType || 'private';
    this.updateCounter = 1;
  }

  /**
   * Simulates sending a text message or command.
   * @param {string} text
   * @returns {Promise<ActorExpectation>}
   */
  async command(text) {
    return this.message(text);
  }

  /**
   * Simulates sending a message.
   * @param {string} text
   * @returns {Promise<ActorExpectation>}
   */
  async message(text) {
    const startCallIndex = this.lab.api.calls.length;

    const rawMessage = {
      message_id: this.updateCounter++,
      from: {
        id: this.id,
        is_bot: false,
        first_name: this.firstName,
        username: this.username,
      },
      chat: {
        id: this.chatId,
        type: this.chatType,
        first_name: this.firstName,
      },
      date: Math.floor(Date.now() / 1000),
      text,
    };

    const update = {
      update_id: this.updateCounter++,
      message: rawMessage,
    };

    await this.lab.router.handle(rawMessage, { update }, this.lab.api);

    const callsSince = this.lab.api.calls.slice(startCallIndex);
    return new ActorExpectation(callsSince);
  }

  /**
   * Simulates clicking an inline keyboard button.
   * @param {string} data The callback_data payload
   * @param {number} [messageId=99]
   * @returns {Promise<ActorExpectation>}
   */
  async click(data, messageId = 99) {
    const startCallIndex = this.lab.api.calls.length;

    const rawQuery = {
      id: `query_${this.updateCounter++}`,
      from: {
        id: this.id,
        is_bot: false,
        first_name: this.firstName,
        username: this.username,
      },
      message: {
        message_id: messageId,
        chat: { id: this.chatId, type: this.chatType },
        text: 'Original message text',
      },
      data,
    };

    const update = {
      update_id: this.updateCounter++,
      callback_query: rawQuery,
    };

    await this.lab.router.handle(rawQuery, { update }, this.lab.api);

    const callsSince = this.lab.api.calls.slice(startCallIndex);
    return new ActorExpectation(callsSince);
  }
}
