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
        const item = { text: btn.text };
        if (btn.data !== undefined) item.callback_data = String(btn.data);
        else if (btn.callback_data !== undefined) item.callback_data = String(btn.callback_data);
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
    this.api = api;

    // Fast-access caches
    this.match = null;
    this.params = {};
    this.state = {};
    this.session = null;
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
    return this.message?.chat?.id || this.raw.from?.id || null;
  }

  get messageId() {
    return this.message?.message_id || null;
  }

  get from() {
    return this.raw.from || this.message?.from || null;
  }

  get userId() {
    return this.from?.id || null;
  }

  get text() {
    return this.raw.text || this.raw.caption || this.message?.text || this.message?.caption || '';
  }

  get data() {
    return this.raw.data ?? null;
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
    const chatId = options.chat_id || this.chatId;
    if (!chatId) throw new ApiError('sendMessage', 'No chat_id available in current context', 400);
    const payload = normalizeMarkupOptions({ chat_id: chatId, text, ...options });
    return this.call('sendMessage', payload);
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
    const queryId = this.raw.id;
    if (!queryId) return null;
    return this.call('answerCallbackQuery', {
      callback_query_id: queryId,
      text,
      ...options,
    });
  }

  async alert(text) {
    return this.answer(text, { show_alert: true });
  }

  async ephemeral(text, options = {}) {
    if (this.raw.id && !options.sendPrivateMessage) {
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
    const chatId = options.chat_id || this.chatId;
    return this.call('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions,
      ...options,
    });
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
}
