/**
 * Gramless Context Engine (Comprehensive Bot API Surface)
 * 
 * Provides an allocation-minimized, ergonomic facade around incoming Telegram
 * updates, unwrapped payloads, keyboard builders, and the complete Telegram Bot API.
 */

import { ApiError } from './errors.js';

// --- Keyboard & Reply Markup Builders ---

/**
 * Normalizes inline keyboard buttons into Telegram InlineKeyboardMarkup schema.
 * Supports string shortcuts, { text, data }, { text, url }, { text, webApp }.
 * 
 * @param {any} buttons
 * @returns {{ inline_keyboard: Array<Array<Record<string, any>>> } | undefined}
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
        const item = { ...btn };
        if (btn.data !== undefined) {
          item.callback_data = String(btn.data);
          delete item.data;
        } else if (btn.callback_data !== undefined) {
          item.callback_data = String(btn.callback_data);
        }
        if (btn.webApp || btn.web_app) {
          const url = typeof (btn.webApp || btn.web_app) === 'string'
            ? (btn.webApp || btn.web_app)
            : (btn.webApp || btn.web_app).url;
          item.web_app = { url };
          delete item.webApp;
        }
        if (!item.callback_data && !item.url && !item.web_app && !item.switch_inline_query && !item.switch_inline_query_current_chat && !item.switch_inline_query_chosen_chat && !item.copy_text) {
          item.callback_data = item.text;
        }
        return item;
      });
    });
    return { inline_keyboard };
  }
  return undefined;
}

/**
 * Normalizes custom reply keyboard buttons into Telegram ReplyKeyboardMarkup schema.
 * 
 * @param {any} buttons
 * @param {Object} [options={}]
 * @param {boolean} [options.resize=true]
 * @param {boolean} [options.oneTime=false]
 * @param {boolean} [options.persistent=false]
 * @param {string} [options.placeholder]
 * @param {boolean} [options.selective=false]
 * @returns {{ keyboard: Array<Array<Record<string, any>>>, resize_keyboard?: boolean, one_time_keyboard?: boolean, is_persistent?: boolean, input_field_placeholder?: string, selective?: boolean } | undefined}
 */
export function buildReplyKeyboard(buttons, options = {}) {
  if (!buttons) return undefined;
  if (buttons.keyboard) return buttons;

  if (Array.isArray(buttons)) {
    const keyboard = buttons.map(row => {
      if (!Array.isArray(row)) row = [row];
      return row.map(btn => {
        if (typeof btn === 'string') {
          return { text: btn };
        }
        const item = { text: btn.text };
        if (btn.requestContact || btn.request_contact) item.request_contact = true;
        if (btn.requestLocation || btn.request_location) item.request_location = true;
        if (btn.requestUsers || btn.request_users) item.request_users = btn.requestUsers || btn.request_users;
        if (btn.requestChat || btn.request_chat) item.request_chat = btn.requestChat || btn.request_chat;
        return item;
      });
    });

    const markup = { keyboard };
    if (options.resize !== false) markup.resize_keyboard = true;
    if (options.oneTime) markup.one_time_keyboard = true;
    if (options.persistent) markup.is_persistent = true;
    if (options.placeholder) markup.input_field_placeholder = options.placeholder;
    if (options.selective) markup.selective = true;
    return markup;
  }
  return undefined;
}

/**
 * Returns a Telegram ReplyKeyboardRemove markup object.
 * @param {Object} [options={}]
 * @param {boolean} [options.selective=false]
 * @returns {{ remove_keyboard: true, selective?: boolean }}
 */
export function removeKeyboard(options = {}) {
  const markup = { remove_keyboard: true };
  if (options.selective) markup.selective = true;
  return markup;
}

/**
 * Returns a Telegram ForceReply markup object.
 * @param {Object} [options={}]
 * @param {string} [options.placeholder]
 * @param {boolean} [options.selective=false]
 * @returns {{ force_reply: true, input_field_placeholder?: string, selective?: boolean }}
 */
export function forceReply(options = {}) {
  const markup = { force_reply: true };
  if (options.placeholder) markup.input_field_placeholder = options.placeholder;
  if (options.selective) markup.selective = true;
  return markup;
}

/**
 * Automatically resolves and normalizes any keyboard or reply markup option.
 * @param {Object} options
 * @returns {Record<string, any>}
 */
function normalizeMarkupOptions(options = {}) {
  const payload = { ...options };

  if (payload.buttons) {
    payload.reply_markup = buildInlineKeyboard(payload.buttons);
    delete payload.buttons;
  } else if (payload.keyboard) {
    payload.reply_markup = buildReplyKeyboard(payload.keyboard, options);
    delete payload.keyboard;
  } else if (payload.removeKeyboard) {
    payload.reply_markup = removeKeyboard(options);
    delete payload.removeKeyboard;
  } else if (payload.forceReply) {
    payload.reply_markup = forceReply(options);
    delete payload.forceReply;
  }

  return payload;
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
    this.api = api || ctx.api || null;

    // Execution clock & deadline budget
    this.startedAt = ctx.startedAt || Date.now();
    this.executionTimeoutMs = ctx.executionTimeoutMs ?? (ctx.deadline ? ctx.deadline - this.startedAt : 9500);

    // Database injection support
    this.db = ctx.db || api?.db || null;

    // Fast-access caches
    this.match = null;
    this.params = {};
    this.state = {};
    this.session = null;
    this.command = null;
    this.payload = '';
    this.args = [];
  }

  /**
   * Elapsed execution time in milliseconds since the start of this update.
   * @returns {number}
   */
  get elapsedMs() {
    return Date.now() - this.startedAt;
  }

  /**
   * Approximate wall-clock deadline timestamp (ms) for this isolate execution.
   * @returns {number}
   */
  get deadline() {
    return this.startedAt + this.executionTimeoutMs;
  }

  /**
   * Remaining execution time in milliseconds before reaching the isolate budget.
   * @returns {number}
   */
  remainingMs() {
    return Math.max(0, this.executionTimeoutMs - (Date.now() - this.startedAt));
  }

  /**
   * Whether the execution budget has been completely exhausted.
   * @returns {boolean}
   */
  get isTimedOut() {
    return this.remainingMs() <= 0;
  }

  /**
   * Checks whether the isolate has at least `estimatedMs` left before the ceiling.
   * Useful for aborting loops or checkpointing state before platform termination.
   * @param {number} estimatedMs
   * @returns {boolean}
   */
  hasTimeFor(estimatedMs) {
    return this.remainingMs() > estimatedMs;
  }

  // --- Identifiers & Extraction ---

  get message() {
    if (this.raw.chat && !this.raw.new_chat_member) {
      return this.raw;
    }
    if (this.raw.message) return this.raw.message;
    return this.update.message || this.update.edited_message || this.update.channel_post || null;
  }

  get chatId() {
    return (
      this.message?.chat?.id ||
      this.raw.chat?.id ||
      this.raw.from?.id ||
      this.widgetQuery?.chat?.id ||
      this.from?.id ||
      null
    );
  }

  get messageId() {
    return this.message?.message_id || this.widgetQuery?.message_id || null;
  }

  get from() {
    return (
      this.raw.from ||
      this.message?.from ||
      this.widgetQuery?.from ||
      this.sharedWidgetQuery?.from ||
      null
    );
  }

  get userId() {
    return this.from?.id || null;
  }

  get text() {
    return this.raw.text || this.raw.caption || this.message?.text || this.message?.caption || '';
  }

  get data() {
    return (
      this.raw.data ??
      (this.update?.callback_query?.data ??
        this.widgetQuery?.data ??
        this.sharedWidgetQuery?.data ??
        null)
    );
  }

  get inlineQuery() {
    return this.raw.query !== undefined ? this.raw : (this.update.inline_query || null);
  }

  get poll() {
    return this.raw.poll || this.message?.poll || this.update.poll || null;
  }

  get pollAnswer() {
    return this.raw.poll_id !== undefined ? this.raw : (this.update.poll_answer || null);
  }

  get widgetQuery() {
    return (
      this.raw.widget_query ||
      this.update.widget_query ||
      (this.raw.type && this.raw.widget_query_id ? this.raw : null)
    );
  }

  get sharedWidgetQuery() {
    return this.raw.shared_widget_query || this.update.shared_widget_query || null;
  }

  get widget() {
    return this.raw.widget || this.message?.widget || null;
  }

  get tonWalletTransfer() {
    return this.raw.ton_wallet_transfer || this.message?.ton_wallet_transfer || null;
  }

  get paidMessagesWaived() {
    return this.raw.paid_messages_waived || this.message?.paid_messages_waived || null;
  }

  get oldChatMember() {
    return this.raw.old_chat_member || this.update.chat_member?.old_chat_member || this.update.my_chat_member?.old_chat_member || null;
  }

  get newChatMember() {
    return this.raw.new_chat_member || this.update.chat_member?.new_chat_member || this.update.my_chat_member?.new_chat_member || null;
  }

  get isPrivate() {
    return this.message?.chat?.type === 'private';
  }

  get isGroup() {
    const type = this.message?.chat?.type;
    return type === 'group' || type === 'supergroup';
  }

  get isChannel() {
    return this.message?.chat?.type === 'channel';
  }

  // --- API Validation & Escape Hatch ---

  _requireApi() {
    if (!this.api) {
      throw new ApiError('unknown', 'API client proxy is not configured on Context', 500);
    }
    return this.api;
  }

  /**
   * Day-zero raw escape hatch: Call any current or future Telegram Bot API method directly.
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

  // --- Sending Messages & Media ---

  async reply(text, options = {}) {
    const isEphemeralCallbackReply = Boolean(
      options.ephemeral_message_parameters?.callback_query_id ||
      (options.ephemeral && (this.raw.id || this.update?.callback_query?.id))
    );
    const chatId = options.chat_id || (isEphemeralCallbackReply ? undefined : this.chatId);
    if (!chatId && !isEphemeralCallbackReply) {
      throw new ApiError('sendMessage', 'No chat_id available in current context', 400);
    }

    const opts = { ...options };
    if (chatId) opts.chat_id = chatId;
    opts.text = text;

    // Ergonomic reply quoting (Bot API 7.0+ & 10.4 quote_rich_texts)
    if (opts.quote || opts.replyToCurrent || opts.quoteRichTexts || opts.quote_rich_texts) {
      opts.reply_parameters = {
        ...(opts.reply_parameters || {}),
        ...(this.messageId ? { message_id: this.messageId } : {}),
      };
      if (typeof opts.quote === 'string') {
        opts.reply_parameters.quote = opts.quote;
      }
      if (opts.quoteRichTexts || opts.quote_rich_texts) {
        opts.reply_parameters.quote_rich_texts = Boolean(opts.quoteRichTexts || opts.quote_rich_texts);
      }
      delete opts.quote;
      delete opts.replyToCurrent;
      delete opts.quoteRichTexts;
      delete opts.quote_rich_texts;
    }

    // Ergonomic Ephemeral message parameters (Bot API 10.3 & 10.4)
    if (opts.ephemeral) {
      const cbQueryId = this.raw.id || this.update?.callback_query?.id;
      opts.ephemeral_message_parameters = {
        ...(cbQueryId ? { callback_query_id: cbQueryId } : {}),
        ...(typeof opts.ephemeral === 'object' ? opts.ephemeral : {}),
      };
      delete opts.ephemeral;
    }

    const payload = normalizeMarkupOptions(opts);
    return this.call('sendMessage', payload);
  }

  /**
   * Sends an ephemeral reply visible only to the current user (Bot API 10.4).
   * Automatically targets the active callback query if called within button interactions.
   * 
   * @param {string} text
   * @param {Record<string, any>} [options={}]
   * @returns {Promise<any>}
   */
  async replyEphemeral(text, options = {}) {
    return this.reply(text, { ephemeral: true, ...options });
  }

  async replyWithHtml(html, options = {}) {
    return this.reply(html, { parse_mode: 'HTML', ...options });
  }

  async replyWithMarkdown(markdown, options = {}) {
    return this.reply(markdown, { parse_mode: 'MarkdownV2', ...options });
  }

  async sendPhoto(photo, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, photo, ...options });
    return this.call('sendPhoto', payload);
  }

  async sendDocument(document, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, document, ...options });
    return this.call('sendDocument', payload);
  }

  async sendVideo(video, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, video, ...options });
    return this.call('sendVideo', payload);
  }

  async sendAnimation(animation, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, animation, ...options });
    return this.call('sendAnimation', payload);
  }

  async sendAudio(audio, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, audio, ...options });
    return this.call('sendAudio', payload);
  }

  async sendVoice(voice, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, voice, ...options });
    return this.call('sendVoice', payload);
  }

  async sendVideoNote(videoNote, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, video_note: videoNote, ...options });
    return this.call('sendVideoNote', payload);
  }

  async sendMediaGroup(media, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('sendMediaGroup', { chat_id: chatId, media, ...options });
  }

  async sendSticker(sticker, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, sticker, ...options });
    return this.call('sendSticker', payload);
  }

  async sendLocation(latitude, longitude, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, latitude, longitude, ...options });
    return this.call('sendLocation', payload);
  }

  async sendVenue(latitude, longitude, title, address, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, latitude, longitude, title, address, ...options });
    return this.call('sendVenue', payload);
  }

  async sendContact(phoneNumber, firstName, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({
      chat_id: chatId,
      phone_number: phoneNumber,
      first_name: firstName,
      ...options,
    });
    return this.call('sendContact', payload);
  }

  // --- Interactive & Engagement Methods ---

  async sendPoll(question, pollOptions, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const formattedOptions = pollOptions.map(opt => typeof opt === 'string' ? { text: opt } : opt);
    const payload = normalizeMarkupOptions({
      chat_id: chatId,
      question,
      options: formattedOptions,
      ...options,
    });
    return this.call('sendPoll', payload);
  }

  async stopPoll(messageId = null, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const msgId = messageId || options.message_id || this.messageId;
    return this.call('stopPoll', { chat_id: chatId, message_id: msgId, ...options });
  }

  async sendDice(emoji = '🎲', options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({ chat_id: chatId, emoji, ...options });
    return this.call('sendDice', payload);
  }

  async react(emoji, isBig = false) {
    const chatId = this.chatId;
    const messageId = this.messageId;
    if (!chatId || !messageId) return null;
    const reaction = typeof emoji === 'string'
      ? [{ type: 'emoji', emoji }]
      : (Array.isArray(emoji) ? emoji : [emoji]);
    return this.call('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction,
      is_big: isBig,
    });
  }

  async chatAction(action = 'typing') {
    const chatId = this.chatId;
    if (!chatId) return null;
    return this.call('sendChatAction', { chat_id: chatId, action });
  }

  // --- Message Management & Editing ---

  async edit(text, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const messageId = options.message_id || this.messageId;

    if (!chatId || !messageId) {
      throw new ApiError('editMessageText', 'Missing chat_id or message_id for edit', 400);
    }

    const payload = normalizeMarkupOptions({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    });
    return this.call('editMessageText', payload);
  }

  async editCaption(caption, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const messageId = options.message_id || this.messageId;
    const payload = normalizeMarkupOptions({
      chat_id: chatId,
      message_id: messageId,
      caption,
      ...options,
    });
    return this.call('editMessageCaption', payload);
  }

  async editMedia(media, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const messageId = options.message_id || this.messageId;
    const payload = normalizeMarkupOptions({
      chat_id: chatId,
      message_id: messageId,
      media,
      ...options,
    });
    return this.call('editMessageMedia', payload);
  }

  async editKeyboard(buttons) {
    const chatId = this.chatId;
    const messageId = this.messageId;
    return this.call('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: buildInlineKeyboard(buttons) || buttons,
    });
  }

  async delete(messageId = null) {
    const chatId = this.chatId;
    const msgId = messageId || this.messageId;
    if (!chatId || !msgId) {
      throw new ApiError('deleteMessage', 'Cannot delete message without chat_id and message_id', 400);
    }
    return this.call('deleteMessage', { chat_id: chatId, message_id: msgId });
  }

  async deleteMessages(messageIds = []) {
    const chatId = this.chatId;
    if (!chatId) throw new ApiError('deleteMessages', 'Missing chat_id', 400);
    return this.call('deleteMessages', { chat_id: chatId, message_ids: messageIds });
  }

  async forward(toChatId, options = {}) {
    const fromChatId = this.chatId;
    const messageId = this.messageId;
    if (!fromChatId || !messageId) throw new ApiError('forwardMessage', 'Missing source message context', 400);
    return this.call('forwardMessage', {
      chat_id: toChatId,
      from_chat_id: fromChatId,
      message_id: messageId,
      ...options,
    });
  }

  async copy(toChatId, options = {}) {
    const fromChatId = this.chatId;
    const messageId = this.messageId;
    if (!fromChatId || !messageId) throw new ApiError('copyMessage', 'Missing source message context', 400);
    const payload = normalizeMarkupOptions({
      chat_id: toChatId,
      from_chat_id: fromChatId,
      message_id: messageId,
      ...options,
    });
    return this.call('copyMessage', payload);
  }

  async pin(options = {}) {
    const chatId = options.chat_id || this.chatId;
    const messageId = options.message_id || this.messageId;
    return this.call('pinChatMessage', { chat_id: chatId, message_id: messageId, ...options });
  }

  async unpin(messageId = null, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const msgId = messageId || options.message_id || this.messageId;
    return this.call('unpinChatMessage', { chat_id: chatId, message_id: msgId, ...options });
  }

  async unpinAll(options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('unpinAllChatMessages', { chat_id: chatId, ...options });
  }

  // --- Callback Query Responses ---

  async answer(text = '', options = {}) {
    const queryId = this.raw.id || this.update?.callback_query?.id;
    if (!queryId) return null;
    let textStr = text;
    let opts = options;
    if (typeof text === 'object' && text !== null) {
      opts = text;
      textStr = opts.text || '';
    }
    try {
      return await this.call('answerCallbackQuery', {
        callback_query_id: queryId,
        text: textStr,
        ...opts,
      });
    } catch (err) {
      if (err?.code === 400 || (err?.description && err.description.includes('query is too old'))) {
        return null;
      }
      throw err;
    }
  }

  async alert(text) {
    return this.answer(text, { show_alert: true });
  }

  async ephemeral(text, options = {}) {
    if ((this.raw.id || this.update?.callback_query?.id) && !options.sendPrivateMessage) {
      return this.alert(text);
    }
    return this.reply(text, { chat_id: this.userId, ...options });
  }

  // --- Chat Administration & Moderation ---

  async banSender(revokeMessages = true) {
    const chatId = this.chatId;
    const senderId = this.userId;
    if (!chatId || !senderId) throw new ApiError('banChatMember', 'Cannot ban without chat and sender', 400);
    return this.banMember(senderId, { revoke_messages: revokeMessages });
  }

  async banMember(userId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('banChatMember', { chat_id: chatId, user_id: userId, ...options });
  }

  async unbanMember(userId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('unbanChatMember', { chat_id: chatId, user_id: userId, ...options });
  }

  async restrictMember(userId, permissions = {}, options = {}) {
    const chatId = options.chat_id || permissions.chat_id || this.chatId;
    const perms = permissions.permissions || permissions;
    const untilDate = options.until_date || permissions.until_date;
    const opts = { ...options };
    if (untilDate) opts.until_date = untilDate;
    return this.call('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions: perms,
      ...opts,
    });
  }

  async getChatMember(userId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('getChatMember', { chat_id: chatId, user_id: userId, ...options });
  }

  async getChatAdministrators(options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('getChatAdministrators', { chat_id: chatId, ...options });
  }

  async promoteMember(userId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('promoteChatMember', { chat_id: chatId, user_id: userId, ...options });
  }

  async setChatTitle(title) {
    const chatId = this.chatId;
    return this.call('setChatTitle', { chat_id: chatId, title });
  }

  async setChatDescription(description) {
    const chatId = this.chatId;
    return this.call('setChatDescription', { chat_id: chatId, description });
  }

  async createInviteLink(options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('createChatInviteLink', { chat_id: chatId, ...options });
  }

  async exportInviteLink() {
    const chatId = this.chatId;
    return this.call('exportChatInviteLink', { chat_id: chatId });
  }

  async setMyCommands(commands, options = {}) {
    return this.call('setMyCommands', { commands, ...options });
  }

  async getMyCommands(options = {}) {
    return this.call('getMyCommands', options);
  }

  // --- Inline Queries ---

  async answerInlineQuery(results, options = {}) {
    const queryId = this.inlineQuery?.id || this.raw.id;
    if (!queryId) throw new ApiError('answerInlineQuery', 'No inline_query_id available', 400);
    return this.call('answerInlineQuery', {
      inline_query_id: queryId,
      results,
      ...options,
    });
  }

  // --- Payments ---

  async answerShippingQuery(ok, options = {}) {
    const queryId = this.raw.id || this.update.shipping_query?.id;
    return this.call('answerShippingQuery', { shipping_query_id: queryId, ok, ...options });
  }

  async answerPreCheckoutQuery(ok, errorMessage = '') {
    const queryId = this.raw.id || this.update.pre_checkout_query?.id;
    const payload = { pre_checkout_query_id: queryId, ok };
    if (!ok && errorMessage) payload.error_message = errorMessage;
    return this.call('answerPreCheckoutQuery', payload);
  }

  async sendInvoice(params) {
    const chatId = params.chat_id || this.chatId;
    return this.call('sendInvoice', { chat_id: chatId, ...params });
  }

  async createInvoiceLink(params) {
    return this.call('createInvoiceLink', params);
  }

  // --- Forum Topics ---

  async createForumTopic(name, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('createForumTopic', { chat_id: chatId, name, ...options });
  }

  async editForumTopic(messageThreadId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('editForumTopic', { chat_id: chatId, message_thread_id: messageThreadId, ...options });
  }

  async closeForumTopic(messageThreadId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('closeForumTopic', { chat_id: chatId, message_thread_id: messageThreadId, ...options });
  }

  async reopenForumTopic(messageThreadId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('reopenForumTopic', { chat_id: chatId, message_thread_id: messageThreadId, ...options });
  }

  async deleteForumTopic(messageThreadId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('deleteForumTopic', { chat_id: chatId, message_thread_id: messageThreadId, ...options });
  }

  // --- Files & Users ---

  async getFile(fileId) {
    return this.call('getFile', { file_id: fileId });
  }

  async getUserProfilePhotos(userId = null, options = {}) {
    const targetUserId = userId || this.userId;
    return this.call('getUserProfilePhotos', { user_id: targetUserId, ...options });
  }

  // --- Bot API 10.x: Rich Messages, Ephemeral Messages & Drafts ---

  async sendRichMessage(richMessage, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({
      chat_id: chatId,
      rich_message: richMessage,
      ...options,
    });
    return this.call('sendRichMessage', payload);
  }

  async sendRichMessageDraft(richMessage, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('sendRichMessageDraft', {
      chat_id: chatId,
      rich_message: richMessage,
      ...options,
    });
  }

  async sendMessageDraft(draft, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('sendMessageDraft', {
      chat_id: chatId,
      draft,
      ...options,
    });
  }

  async sendLivePhoto(photo, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({
      chat_id: chatId,
      live_photo: photo,
      ...options,
    });
    return this.call('sendLivePhoto', payload);
  }

  async editEphemeralMessageText(text, options = {}) {
    const chatId = options.chat_id || this.chatId;
    const payload = normalizeMarkupOptions({
      chat_id: chatId,
      text,
      ...options,
    });
    return this.call('editEphemeralMessageText', payload);
  }

  async deleteEphemeralMessage(ephemeralMessageId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    return this.call('deleteEphemeralMessage', {
      chat_id: chatId,
      ephemeral_message_id: ephemeralMessageId,
      ...options,
    });
  }

  async answerGuestQuery(guestQueryId = null, options = {}) {
    const queryId = guestQueryId || this.raw.guest_query_id;
    return this.call('answerGuestQuery', {
      guest_query_id: queryId,
      ...options,
    });
  }

  // --- Bot API 10.4: HTML Widgets, Gifts & TON Wallet ---

  /**
   * Sends an HTML widget message (Bot API 10.4).
   * @param {string} html HTML code of the widget (1-32768 bytes)
   * @param {Record<string, any>} [options={}]
   * @returns {Promise<any>}
   */
  async sendWidget(html, options = {}) {
    const chatId = options.chat_id || this.chatId;
    if (!chatId) throw new ApiError('sendWidget', 'No chat_id available in current context', 400);
    if (!html || typeof html !== 'string') {
      throw new ApiError('sendWidget', 'Widget html must be between 1 and 32,768 bytes', 400);
    }
    const byteLen = typeof Buffer !== 'undefined' ? Buffer.byteLength(html, 'utf8') : new TextEncoder().encode(html).length;
    if (byteLen < 1 || byteLen > 32768) {
      throw new ApiError('sendWidget', `Widget html must be between 1 and 32,768 bytes (got ${byteLen} bytes)`, 400);
    }
    const payload = normalizeMarkupOptions({ chat_id: chatId, html, ...options });
    return this.call('sendWidget', payload);
  }

  /**
   * Sends again a shared widget created by the bot (Bot API 10.4).
   * @param {string} widgetId Unique identifier of the shared widget
   * @param {Record<string, any>} [options={}]
   * @returns {Promise<any>}
   */
  async sendSharedWidget(widgetId, options = {}) {
    const chatId = options.chat_id || this.chatId;
    if (!chatId) throw new ApiError('sendSharedWidget', 'No chat_id available in current context', 400);
    const payload = normalizeMarkupOptions({ chat_id: chatId, widget_id: widgetId, ...options });
    return this.call('sendSharedWidget', payload);
  }

  /**
   * Answers a query from an HTML widget (Bot API 10.4).
   * @param {string|Record<string, any>} [data=''] Data to return to the widget (0-1024 bytes) or options
   * @param {Record<string, any>} [options={}]
   * @returns {Promise<boolean>}
   */
  async answerWidgetQuery(data = '', options = {}) {
    let dataStr = data;
    let opts = options;
    if (typeof data === 'object' && data !== null) {
      opts = data;
      dataStr = opts.data || '';
    }
    const queryId = opts.widget_query_id || this.widgetQuery?.id || this.sharedWidgetQuery?.id || this.raw.id;
    if (!queryId) throw new ApiError('answerWidgetQuery', 'No widget_query_id available in current context', 400);
    const payload = { widget_query_id: queryId, ...opts };
    if (dataStr) payload.data = dataStr;
    try {
      return await this.call('answerWidgetQuery', payload);
    } catch (err) {
      if (err?.code === 400 && err?.description && err.description.includes('query is too old')) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Edits data of a widget in a message (Bot API 10.4).
   * @param {Record<string, any>} [options={}]
   * @returns {Promise<boolean>}
   */
  async editMessageWidgetData(options = {}) {
    const payload = { ...options };
    if (!payload.inline_message_id && !payload.chat_id && !payload.message_id) {
      if (this.chatId) payload.chat_id = this.chatId;
      if (this.messageId) payload.message_id = this.messageId;
    }
    return this.call('editMessageWidgetData', payload);
  }

  /**
   * Alias for editMessageWidgetData (Bot API 10.4).
   * @param {Record<string, any>} [options={}]
   * @returns {Promise<boolean>}
   */
  async editWidgetData(options = {}) {
    return this.editMessageWidgetData(options);
  }

  /**
   * Edits public data of a shared widget created by the bot (Bot API 10.4).
   * @param {string} widgetId Unique identifier of the shared widget
   * @param {string} publicData New public data (0-1024 bytes; empty string to remove)
   * @param {Record<string, any>} [options={}]
   * @returns {Promise<boolean>}
   */
  async editSharedWidgetData(widgetId, publicData, options = {}) {
    return this.call('editSharedWidgetData', {
      widget_id: widgetId,
      public_data: publicData,
      ...options,
    });
  }

  /**
   * Gets information about a unique gift by its name (Bot API 10.4).
   * @param {string} name Unique name of the gift
   * @returns {Promise<any>}
   */
  async getUniqueGift(name) {
    return this.call('getUniqueGift', { name });
  }

  /**
   * Deletes a regular gift owned by a managed business account without receiving Stars (Bot API 10.4).
   * @param {string} businessConnectionId
   * @param {string} ownedGiftId
   * @returns {Promise<boolean>}
   */
  async deleteBusinessAccountGift(businessConnectionId, ownedGiftId) {
    return this.call('deleteBusinessAccountGift', {
      business_connection_id: businessConnectionId,
      owned_gift_id: ownedGiftId,
    });
  }

  /**
   * Gets the list of backdrops for chat share themes (Bot API 10.4).
   * @returns {Promise<any>}
   */
  async getChatShareThemeBackdrops() {
    return this.call('getChatShareThemeBackdrops', {});
  }
}

