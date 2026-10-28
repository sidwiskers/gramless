/**
 * Gramless Lab: Mock Bot API Client
 * 
 * In-memory recording mock of the Telegram Serverless `sdk.api` interface.
 */

export class MockBotApi {
  constructor() {
    /** @type {Array<{ method: string, params: Record<string, any>, timestamp: number }>} */
    this.calls = [];
    /** @type {Map<string, any>} Canned method returns */
    this.responses = new Map();
    this.nextMessageId = 1000;
  }

  /**
   * Registers a custom return value for a specific method.
   * @param {string} method
   * @param {any} result
   */
  on(method, result) {
    this.responses.set(method, result);
    return this;
  }

  /**
   * Clears recorded calls.
   */
  clear() {
    this.calls = [];
  }

  /**
   * Last recorded API call.
   */
  get last() {
    return this.calls.length > 0 ? this.calls[this.calls.length - 1] : null;
  }

  /**
   * Finds all calls to a specific method.
   * @param {string} method
   */
  filter(method) {
    return this.calls.filter(c => c.method === method);
  }

  // --- Core Simulated Telegram Bot API Methods ---

  async sendMessage(params) {
    this.calls.push({ method: 'sendMessage', params, timestamp: Date.now() });
    if (this.responses.has('sendMessage')) return this.responses.get('sendMessage');
    return {
      message_id: ++this.nextMessageId,
      chat: { id: params.chat_id },
      text: params.text,
      date: Math.floor(Date.now() / 1000),
      reply_markup: params.reply_markup,
    };
  }

  async editMessageText(params) {
    this.calls.push({ method: 'editMessageText', params, timestamp: Date.now() });
    if (this.responses.has('editMessageText')) return this.responses.get('editMessageText');
    return {
      message_id: params.message_id,
      chat: { id: params.chat_id },
      text: params.text,
      reply_markup: params.reply_markup,
    };
  }

  async editMessageReplyMarkup(params) {
    this.calls.push({ method: 'editMessageReplyMarkup', params, timestamp: Date.now() });
    return {
      message_id: params.message_id,
      chat: { id: params.chat_id },
      reply_markup: params.reply_markup,
    };
  }

  async answerCallbackQuery(params) {
    this.calls.push({ method: 'answerCallbackQuery', params, timestamp: Date.now() });
    return true;
  }

  async deleteMessage(params) {
    this.calls.push({ method: 'deleteMessage', params, timestamp: Date.now() });
    return true;
  }

  async sendPhoto(params) {
    this.calls.push({ method: 'sendPhoto', params, timestamp: Date.now() });
    return {
      message_id: ++this.nextMessageId,
      chat: { id: params.chat_id },
      photo: [{ file_id: 'simulated_photo_id' }],
      caption: params.caption,
    };
  }

  async sendDocument(params) {
    this.calls.push({ method: 'sendDocument', params, timestamp: Date.now() });
    return {
      message_id: ++this.nextMessageId,
      chat: { id: params.chat_id },
      document: { file_id: 'simulated_doc_id' },
    };
  }

  async sendChatAction(params) {
    this.calls.push({ method: 'sendChatAction', params, timestamp: Date.now() });
    return true;
  }

  /**
   * Generic call fallback for day-zero methods.
   */
  async call(method, params) {
    this.calls.push({ method, params, timestamp: Date.now() });
    if (this.responses.has(method)) return this.responses.get(method);
    return { ok: true, result: params };
  }
}
