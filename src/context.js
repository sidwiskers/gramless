/**
 * Gramless Context Engine
 * 
 * Provides an ergonomic, allocation-minimized facade around incoming Telegram
 * updates, unwrapped payloads, and Bot API methods.
 */

import { ApiError } from './errors.js';

/**
 * Normalizes keyboard options into standard Telegram ReplyMarkup format.
 * @param {any} buttons
 * @returns {Record<string, unknown>|undefined}
 */
export function buildInlineKeyboard(buttons) {
  if (!buttons) return undefined;
  if (buttons.inline_keyboard) return buttons;

  if (Array.isArray(buttons)) {
    const inline_keyboard = buttons.map(row => {
      if (!Array.isArray(row)) row = [row];
      return row.map(btn => {
        if (typeof btn === 'string') {
          return { text: btn, callback_data: btn };
        }
        const item = { text: btn.text };
        if (btn.data) item.callback_data = btn.data;
        else if (btn.callback_data) item.callback_data = btn.callback_data;
        else if (btn.url) item.url = btn.url;
        else if (btn.webApp || btn.web_app) {
          const url = typeof (btn.webApp || btn.web_app) === 'string'
            ? (btn.webApp || btn.web_app)
            : (btn.webApp || btn.web_app).url;
          item.web_app = { url };
        } else {
          item.callback_data = btn.text;
        }
        return item;
      });
    });
    return { inline_keyboard };
  }
  return undefined;
}

export class GramlessContext {
  /**
   * @param {Record<string, any>} input Unwrapped Telegram object (Message, CallbackQuery, etc.)
   * @param {Record<string, any>} ctx Platform execution context containing ctx.update
   * @param {Record<string, any>} [api] Bot API client or proxy
   */
  constructor(input, ctx = {}, api = null) {
    this.raw = input || {};
    this.ctx = ctx;
    this.update = ctx.update || {};
    this.api = api;

    // Fast-access caches
    this.match = null;
    this.params = {};
    this.state = {};
    this.session = null;
  }

  // --- Identifiers & Extraction ---

  /**
   * The primary message associated with this update.
   * @returns {Record<string, any>|null}
   */
  get message() {
    if (this.raw.chat && (this.raw.text !== undefined || this.raw.caption !== undefined || this.raw.photo)) {
      return this.raw;
    }
    if (this.raw.message) return this.raw.message;
    return this.update.message || this.update.edited_message || this.update.channel_post || null;
  }

  /**
   * The chat ID of the current interaction.
   * @returns {number|string|null}
   */
  get chatId() {
    return this.message?.chat?.id || this.raw.from?.id || null;
  }

  /**
   * The message ID if available.
   * @returns {number|null}
   */
  get messageId() {
    return this.message?.message_id || null;
  }

  /**
   * The user who triggered the interaction.
   * @returns {Record<string, any>|null}
   */
  get from() {
    return this.raw.from || this.message?.from || null;
  }

  /**
   * The sender's user ID.
   * @returns {number|null}
   */
  get userId() {
    return this.from?.id || null;
  }

  /**
   * Text of the message or caption.
   * @returns {string}
   */
  get text() {
    return this.raw.text || this.raw.caption || this.message?.text || this.message?.caption || '';
  }

  /**
   * Callback data string if this is a callback_query update.
   * @returns {string|null}
   */
  get data() {
    return this.raw.data ?? null;
  }

  /**
   * Whether the chat is a private 1-on-1 dialogue.
   * @returns {boolean}
   */
  get isPrivate() {
    return this.message?.chat?.type === 'private';
  }

  /**
   * Whether the chat is a group or supergroup.
   * @returns {boolean}
   */
  get isGroup() {
    const type = this.message?.chat?.type;
    return type === 'group' || type === 'supergroup';
  }

  // --- Outbound Actions & Facades ---

  /**
   * Ensures the API client is present or throws a clear error.
   * @private
   */
  _requireApi() {
    if (!this.api) {
      throw new ApiError('unknown', 'API client proxy is not configured on Context', 500);
    }
    return this.api;
  }

  /**
   * Day-zero raw escape hatch: Call any Telegram Bot API method directly.
   * @param {string} method
   * @param {Record<string, any>} [params={}]
   * @returns {Promise<any>}
   */
  async call(method, params = {}) {
    const api = this._requireApi();
    if (typeof api[method] === 'function') {
      return api[method](params);
    }
    if (typeof api.call === 'function') {
      return api.call(method, params);
    }
    throw new ApiError(method, `Method ${method} is not available on API client`, 404);
  }

  /**
   * Sends a text message to the current chat.
   * @param {string} text
   * @param {Record<string, any>} [options={}]
   */
  async reply(text, options = {}) {
    const chatId = options.chat_id || this.chatId;
    if (!chatId) throw new ApiError('sendMessage', 'No chat_id available in current context', 400);

    const payload = {
      chat_id: chatId,
      text,
      ...options,
    };

    if (options.buttons) {
      payload.reply_markup = buildInlineKeyboard(options.buttons);
      delete payload.buttons;
    }

    return this.call('sendMessage', payload);
  }

  /**
   * Sends an HTML-formatted message.
   * @param {string} html
   * @param {Record<string, any>} [options={}]
   */
  async replyWithHtml(html, options = {}) {
    return this.reply(html, { parse_mode: 'HTML', ...options });
  }

  /**
   * Sends a MarkdownV2-formatted message.
   * @param {string} markdown
   * @param {Record<string, any>} [options={}]
   */
  async replyWithMarkdown(markdown, options = {}) {
    return this.reply(markdown, { parse_mode: 'MarkdownV2', ...options });
  }

  /**
   * Sends a photo to the current chat.
   * @param {string|any} photo
   * @param {Record<string, any>} [options={}]
   */
  async sendPhoto(photo, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = { chat_id: chatId, photo, ...options };
    if (options.buttons) {
      payload.reply_markup = buildInlineKeyboard(options.buttons);
      delete payload.buttons;
    }
    return this.call('sendPhoto', payload);
  }

  /**
   * Sends a document / file.
   * @param {string|any} document
   * @param {Record<string, any>} [options={}]
   */
  async sendDocument(document, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = { chat_id: chatId, document, ...options };
    if (options.buttons) {
      payload.reply_markup = buildInlineKeyboard(options.buttons);
      delete payload.buttons;
    }
    return this.call('sendDocument', payload);
  }

  /**
   * Sends a chat action (typing, upload_photo, etc.)
   * @param {string} [action='typing']
   */
  async chatAction(action = 'typing') {
    const chatId = this.chatId;
    if (!chatId) return null;
    return this.call('sendChatAction', { chat_id: chatId, action });
  }

  /**
   * Edits the current message's text (useful in callback query handlers).
   * @param {string} text
   * @param {Record<string, any>} [options={}]
   */
  async edit(text, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const messageId = options.message_id || this.messageId;

    if (!chatId || !messageId) {
      throw new ApiError('editMessageText', 'Missing chat_id or message_id for edit', 400);
    }

    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    };

    if (options.buttons) {
      payload.reply_markup = buildInlineKeyboard(options.buttons);
      delete payload.buttons;
    }

    return this.call('editMessageText', payload);
  }

  /**
   * Edits only the inline keyboard markup of the current message.
   * @param {any} buttons
   */
  async editKeyboard(buttons) {
    const chatId = this.chatId;
    const messageId = this.messageId;
    return this.call('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: buildInlineKeyboard(buttons) || buttons,
    });
  }

  /**
   * Deletes the current message.
   */
  async delete() {
    const chatId = this.chatId;
    const messageId = this.messageId;
    if (!chatId || !messageId) {
      throw new ApiError('deleteMessage', 'Cannot delete message without chat_id and message_id', 400);
    }
    return this.call('deleteMessage', { chat_id: chatId, message_id: messageId });
  }

  /**
   * Answers a callback query (acknowledges button press and dismisses loading spinner).
   * @param {string} [text='']
   * @param {Record<string, any>} [options={}]
   */
  async answer(text = '', options = {}) {
    const queryId = this.raw.id;
    if (!queryId) return null;
    return this.call('answerCallbackQuery', {
      callback_query_id: queryId,
      text,
      ...options,
    });
  }

  /**
   * Shows a popup modal alert in response to a callback query.
   * @param {string} text
   */
  async alert(text) {
    return this.answer(text, { show_alert: true });
  }

  /**
   * Sends an ephemeral message (only visible to target recipient or privately delivered).
   * @param {string} text
   * @param {Record<string, any>} [options={}]
   */
  async ephemeral(text, options = {}) {
    // If callback query from group, we answer with an alert by default
    // or send private message to user directly if chatId differs from userId
    if (this.raw.id && !options.sendPrivateMessage) {
      return this.alert(text);
    }
    return this.reply(text, { chat_id: this.userId, ...options });
  }
}
