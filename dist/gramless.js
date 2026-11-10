/**
 * Gramless Standalone Single-File Bundle
 * 
 * Zero-dependency, single-file distribution engineered for pure V8 isolates (TGCloud).
 * Drop directly into tgcloud/lib/gramless.js and import:
 *   import { createBot, Filter, session } from './lib/gramless.js';
 * 
 * Version: 1.5.0
 * License: MIT
 */

// --- Module: isolate.js ---
/**
 * Gramless Isolate-Native Runtime Primitives
 * 
 * Provides safe timer, delay, and execution primitives engineered for pure V8 isolates
 * (such as Telegram Serverless / TGCloud) where global `setTimeout` and `clearTimeout`
 * are not provided by the host environment.
 */

/**
 * Checks if the current execution environment is a sandboxed V8 isolate
 * without standard timer globals.
 * 
 * @returns {boolean}
 */
export function isIsolateRuntime() {
  return typeof setTimeout === 'undefined';
}

/**
 * Non-crashing delay primitive.
 * - In Node.js / browser / modern workers: uses setTimeout.
 * - In pure V8 isolates: leverages Atomics.wait on SharedArrayBuffer or a micro-yield loop.
 * 
 * @param {number} ms Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  if (ms <= 0) return Promise.resolve();

  // 1. Standard host environment with timer globals
  if (typeof setTimeout === 'function') {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 2. Pure V8 isolate with SharedArrayBuffer & Atomics support
  if (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof Atomics !== 'undefined' &&
    typeof Atomics.wait === 'function'
  ) {
    try {
      const int32 = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(int32, 0, 0, Math.min(ms, 10000));
      return Promise.resolve();
    } catch {
      // Atomics.wait disallowed or throws in current thread context
    }
  }

  // 3. Fallback synchronous yield loop for pure isolated runtimes
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Spin until wall-clock elapsed
  }
  return Promise.resolve();
}

/**
 * Safe setTimeout wrapper that does not throw ReferenceError in pure V8 isolates.
 * 
 * @param {Function} callback
 * @param {number} [ms=0]
 * @returns {any} Timer handle or null
 */
export function safeSetTimeout(callback, ms = 0) {
  if (typeof setTimeout === 'function') {
    return setTimeout(callback, ms);
  }

  // In isolate without timers, queue asynchronously via microtask
  let cancelled = false;
  const handle = { cancelled };

  Promise.resolve().then(() => {
    if (!handle.cancelled) {
      callback();
    }
  });

  return handle;
}

/**
 * Safe clearTimeout wrapper that accepts any handle or null.
 * 
 * @param {any} handle
 */
export function safeClearTimeout(handle) {
  if (!handle) return;
  if (typeof clearTimeout === 'function') {
    clearTimeout(handle);
  } else if (typeof handle === 'object' && handle !== null) {
    handle.cancelled = true;
  }
}

// --- Module: errors.js ---
/**
 * Gramless Error System
 * 
 * Provides structured, typed errors with token and credential sanitization.
 */

const TOKEN_PATTERN = /(?:bot)?\d{5,16}:[A-Za-z0-9_-]{10,60}/g;

/**
 * Sanitizes strings, removing any Telegram bot tokens or sensitive credentials.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(TOKEN_PATTERN, 'bot[REDACTED]');
}

/**
 * Base class for all Gramless errors.
 */
export class GramlessError extends Error {
  /**
   * @param {string} message
   * @param {string} [code='GRAMLESS_ERROR']
   * @param {Record<string, unknown>} [details={}]
   */
  constructor(message, code = 'GRAMLESS_ERROR', details = {}) {
    super(sanitizeString(message));
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Thrown when a Telegram Bot API call fails.
 */
export class ApiError extends GramlessError {
  /**
   * @param {string} method
   * @param {string} description
   * @param {number} [errorCode=400]
   * @param {Record<string, unknown>} [parameters={}]
   */
  constructor(method, description, errorCode = 400, parameters = {}) {
    const cleanDesc = sanitizeString(description);
    super(`Telegram API call ${method} failed (${errorCode}): ${cleanDesc}`, 'API_ERROR', {
      method,
      errorCode,
      description: cleanDesc,
      parameters,
    });
    this.method = method;
    this.errorCode = errorCode;
    this.description = cleanDesc;
    this.parameters = parameters;
  }

  /**
   * Returns retry-after duration in seconds if specified by Telegram flood control.
   * @returns {number|null}
   */
  get retryAfter() {
    return typeof this.parameters?.retry_after === 'number'
      ? this.parameters.retry_after
      : null;
  }

  /**
   * Returns target chat ID if group was migrated to supergroup.
   * @returns {number|null}
   */
  get migrateToChatId() {
    return typeof this.parameters?.migrate_to_chat_id === 'number'
      ? this.parameters.migrate_to_chat_id
      : null;
  }

  /**
   * Primary error category enum.
   * @returns {string}
   */
  get category() {
    if (this.isBlockedByUser) return 'BLOCKED_BY_USER';
    if (this.isUserDeactivated) return 'USER_DEACTIVATED';
    if (this.isChatNotFound) return 'CHAT_NOT_FOUND';
    if (this.isKickedFromChat) return 'KICKED_FROM_CHAT';
    if (this.isNotMember) return 'NOT_MEMBER';
    if (this.isPermissionDenied) return 'PERMISSION_DENIED';
    if (this.isNotModified) return 'MESSAGE_NOT_MODIFIED';
    if (this.isReplyNotFound) return 'REPLY_NOT_FOUND';
    if (this.isMessageNotFound) return 'MESSAGE_NOT_FOUND';
    if (this.isQueryTooOld) return 'QUERY_TOO_OLD';
    if (this.isRateLimited) return 'RATE_LIMITED';
    if (this.isTopicClosed) return 'TOPIC_CLOSED';
    if (this.isParseEntityError) return 'PARSE_ENTITY_ERROR';
    if (this.isMediaRestricted) return 'MEDIA_RESTRICTED';
    return 'UNKNOWN';
  }

  /** True if the target user has blocked the bot */
  get isBlockedByUser() {
    return this.errorCode === 403 && /bot was blocked by the user/i.test(this.description);
  }

  /** True if the target user account has been deactivated or deleted */
  get isUserDeactivated() {
    return this.errorCode === 403 && /user is deactivated/i.test(this.description);
  }

  /** True if the target chat ID does not exist or bot has never interacted with it */
  get isChatNotFound() {
    return this.errorCode === 400 && /chat not found/i.test(this.description);
  }

  /** True if the bot was kicked/banned from the group, supergroup, or channel */
  get isKickedFromChat() {
    return this.errorCode === 403 && /bot was kicked/i.test(this.description);
  }

  /** True if the bot is not a member of the chat */
  get isNotMember() {
    return this.errorCode === 403 && /bot is not a member/i.test(this.description);
  }

  /** True if the bot lacks required permissions (e.g. admin rights, send messages, pin, restrict) */
  get isPermissionDenied() {
    return /not enough rights|have no rights|CHAT_ADMIN_REQUIRED|need administrator rights|can't send messages/i.test(this.description);
  }

  /** True if edit was rejected because the message content and markup are unchanged */
  get isNotModified() {
    return this.errorCode === 400 && /message is not modified/i.test(this.description);
  }

  /** True if the message being replied to was deleted */
  get isReplyNotFound() {
    return this.errorCode === 400 && /reply message not found/i.test(this.description);
  }

  /** True if the target message to edit, delete, or pin was not found or already deleted */
  get isMessageNotFound() {
    return this.errorCode === 400 && !this.isReplyNotFound && /message to (?:edit|delete) not found|message can't be deleted|message not found/i.test(this.description);
  }

  /** True if an inline callback query or widget query expired before being answered */
  get isQueryTooOld() {
    return this.errorCode === 400 && /(?:widget\s+)?query is too old/i.test(this.description);
  }

  /** True if the request was throttled by Telegram rate limits (429) */
  get isRateLimited() {
    return this.errorCode === 429 || typeof this.parameters?.retry_after === 'number';
  }

  /** True if sending to a forum topic that was closed, hidden, or deleted */
  get isTopicClosed() {
    return /message thread not found|TOPIC_CLOSED|TOPIC_DELETED/i.test(this.description);
  }

  /** True if entity parsing (Markdown/HTML tags) failed */
  get isParseEntityError() {
    return this.errorCode === 400 && /can't parse entities|entity_parse_failed/i.test(this.description);
  }

  /** True if media upload failed due to size, format, or chat media restrictions */
  get isMediaRestricted() {
    return (this.errorCode === 400 || this.errorCode === 403) &&
      !this.isParseEntityError &&
      /wrong file identifier|file is too big|failed to get HTTP URL content|IMAGE_PROCESS_FAILED|PHOTO_INVALID_DIMENSIONS|wrong type of the specified file|MEDIA_CAPTION_TOO_LONG|chat doesn't allow media messages|MEDIA_RESTRICTED/i.test(this.description);
  }
}

/**
 * Checks if an error was caused by a user blocking the bot or deleting their account.
 * Useful for purging inactive users during broadcast campaigns.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isBlockedError(err) {
  return err instanceof ApiError ? (err.isBlockedByUser || err.isUserDeactivated) : false;
}

/**
 * Checks if an error was caused by editing a message with identical content.
 * Safe to ignore in 99% of UI button interactions.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isNotModifiedError(err) {
  return err instanceof ApiError ? err.isNotModified : false;
}

/**
 * Checks if an error was caused by permission restriction, kicking, or lack of admin rights.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isPermissionError(err) {
  return err instanceof ApiError ? (err.isPermissionDenied || err.isKickedFromChat || err.isNotMember) : false;
}

/**
 * Checks if an error was caused by a missing chat or missing message.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isNotFoundError(err) {
  return err instanceof ApiError ? (err.isChatNotFound || err.isMessageNotFound || err.isReplyNotFound) : false;
}

/**
 * Checks if an error was caused by an entity or formatting parse error (e.g. invalid HTML or Markdown).
 * @param {unknown} err
 * @returns {boolean}
 */
export function isParseEntityError(err) {
  return err instanceof ApiError ? err.isParseEntityError : false;
}

/**
 * Checks if an error was caused by an expired callback query or widget query.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isQueryTooOldError(err) {
  return err instanceof ApiError ? err.isQueryTooOld : false;
}


/**
 * Thrown when input validation fails (e.g. in RPC endpoints or route parameters).
 */
export class ValidationError extends GramlessError {
  /**
   * @param {string} message
   * @param {Array<{field: string, message: string}>} [issues=[]]
   */
  constructor(message, issues = []) {
    super(message, 'VALIDATION_ERROR', { issues });
    this.issues = issues;
  }
}

/**
 * Thrown when a route or handler execution error occurs.
 */
export class RoutingError extends GramlessError {
  constructor(message, details = {}) {
    super(message, 'ROUTING_ERROR', details);
  }
}

/**
 * Thrown when a database session transaction fails or rolls back.
 */
export class SessionError extends GramlessError {
  constructor(message, details = {}) {
    super(message, 'SESSION_ERROR', details);
  }
}

/**
 * Thrown when an optimistic concurrency conflict occurs during session commit.
 */
export class SessionConflictError extends SessionError {
  constructor(message = 'Session state conflict: concurrent update detected', details = {}) {
    super(message, { code: 'SESSION_CONFLICT', ...details });
    this.code = 'SESSION_CONFLICT';
  }
}

/**
 * Thrown when a Telegram API call receives a 429 Flood Wait response that exceeds
 * the isolate's execution budget or configured maximum retry duration.
 */
export class FloodWaitError extends ApiError {
  /**
   * @param {string} method
   * @param {string} description
   * @param {number} [retryAfter=1] Seconds to wait before retry
   * @param {Record<string, unknown>} [parameters={}]
   */
  constructor(method, description, retryAfter = 1, parameters = {}) {
    super(method, description, 429, { ...parameters, retry_after: retryAfter });
    this.name = 'FloodWaitError';
    this.code = 'FLOOD_WAIT';
    this.retryAfterMs = retryAfter * 1000;
  }
}

/**
 * Wraps an unhandled exception or panic within a handler.
 */
export class PanicError extends GramlessError {
  /**
   * @param {Error|unknown} cause
   * @param {Record<string, unknown>} [context={}]
   */
  constructor(cause, context = {}) {
    const rawMessage = cause instanceof Error ? cause.message : String(cause);
    super(`Unhandled handler panic: ${rawMessage}`, 'HANDLER_PANIC', context);
    this.cause = cause;
    if (cause instanceof Error && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

// --- Module: filters.js ---
/**
 * Gramless Composable Filters Engine
 * 
 * Provides zero-allocation, functional filter predicates.
 */

export const Filter = {
  /**
   * Logical AND: All predicates must return true.
   * @param {...Function} predicates
   * @returns {Function}
   */
  all(...predicates) {
    const fns = predicates.flat();
    return async function allFilter(ctx) {
      for (let i = 0; i < fns.length; i++) {
        const res = await fns[i](ctx);
        if (!res) return false;
      }
      return true;
    };
  },

  /**
   * Logical OR: At least one predicate must return true.
   * @param {...Function} predicates
   * @returns {Function}
   */
  any(...predicates) {
    const fns = predicates.flat();
    return async function anyFilter(ctx) {
      for (let i = 0; i < fns.length; i++) {
        const res = await fns[i](ctx);
        if (res) return true;
      }
      return false;
    };
  },

  /**
   * Logical NOT: Inverts a predicate.
   * @param {Function} predicate
   * @returns {Function}
   */
  not(predicate) {
    return async function notFilter(ctx) {
      return !(await predicate(ctx));
    };
  },

  // --- Chat Types ---

  /** Matches private 1-on-1 dialogues */
  private(ctx) {
    return ctx.isPrivate;
  },

  /** Matches groups and supergroups */
  group(ctx) {
    return ctx.isGroup;
  },

  /** Matches channels */
  channel(ctx) {
    return ctx.isChannel;
  },

  // --- Media & Content Types ---

  /** Matches messages with text or caption */
  hasText(ctx) {
    return Boolean(ctx.text && ctx.text.length > 0);
  },

  /** Matches messages with photos */
  hasPhoto(ctx) {
    return Boolean(ctx.raw.photo || ctx.message?.photo);
  },

  /** Matches messages with documents / files */
  hasDocument(ctx) {
    return Boolean(ctx.raw.document || ctx.message?.document);
  },

  /** Matches messages with audio files */
  hasAudio(ctx) {
    return Boolean(ctx.raw.audio || ctx.message?.audio);
  },

  /** Matches messages with voice notes */
  hasVoice(ctx) {
    return Boolean(ctx.raw.voice || ctx.message?.voice);
  },

  /** Matches messages with videos */
  hasVideo(ctx) {
    return Boolean(ctx.raw.video || ctx.message?.video);
  },

  /** Matches messages with video notes */
  hasVideoNote(ctx) {
    return Boolean(ctx.raw.video_note || ctx.message?.video_note);
  },

  /** Matches messages with stickers */
  hasSticker(ctx) {
    return Boolean(ctx.raw.sticker || ctx.message?.sticker);
  },

  /** Matches messages with GIF/animations */
  hasAnimation(ctx) {
    return Boolean(ctx.raw.animation || ctx.message?.animation);
  },

  /** Matches messages with shared locations */
  hasLocation(ctx) {
    return Boolean(ctx.raw.location || ctx.message?.location);
  },

  /** Matches messages with shared contacts */
  hasContact(ctx) {
    return Boolean(ctx.raw.contact || ctx.message?.contact);
  },

  /** Matches messages with polls */
  hasPoll(ctx) {
    return Boolean(ctx.raw.poll || ctx.message?.poll);
  },

  /** Matches messages with animated dice */
  hasDice(ctx) {
    return Boolean(ctx.raw.dice || ctx.message?.dice);
  },

  /** Matches messages with HTML widgets (Bot API 10.4) */
  hasWidget(ctx) {
    return Boolean(ctx.widget || ctx.raw.widget || ctx.message?.widget);
  },

  /** Matches widget queries (Bot API 10.4) */
  isWidgetQuery(ctx) {
    return Boolean(ctx.widgetQuery || ctx.raw.widget_query || ctx.update?.widget_query);
  },

  /** Matches shared widget queries (Bot API 10.4) */
  isSharedWidgetQuery(ctx) {
    return Boolean(ctx.sharedWidgetQuery || ctx.raw.shared_widget_query || ctx.update?.shared_widget_query);
  },

  /** Matches TON wallet transfer service messages (Bot API 10.4) */
  hasTonTransfer(ctx) {
    return Boolean(ctx.tonWalletTransfer || ctx.raw.ton_wallet_transfer || ctx.message?.ton_wallet_transfer);
  },

  /** Matches service messages about paid messages waived (Bot API 10.4) */
  hasPaidMessagesWaived(ctx) {
    return Boolean(ctx.paidMessagesWaived || ctx.raw.paid_messages_waived || ctx.message?.paid_messages_waived);
  },

  /** Matches callback query button interactions */
  isCallback(ctx) {
    return ctx.data !== null;
  },

  // --- Parameterized Filters ---

  /**
   * Matches text starting with a specific prefix.
   * @param {string} prefix
   * @returns {Function}
   */
  textPrefix(prefix) {
    return (ctx) => Boolean(ctx.text && ctx.text.startsWith(prefix));
  },

  /**
   * Matches text matching a regex pattern.
   * @param {RegExp} pattern
   * @returns {Function}
   */
  textMatches(pattern) {
    return (ctx) => Boolean(ctx.text && pattern.test(ctx.text));
  },

  /**
   * Matches only updates originating from specific user IDs.
   * @param {...number} userIds
   * @returns {Function}
   */
  fromUsers(...userIds) {
    const ids = new Set(userIds.flat());
    return (ctx) => ctx.userId !== null && ids.has(ctx.userId);
  },

  /**
   * Matches only updates originating from specific chat IDs.
   * @param {...(number|string)} chatIds
   * @returns {Function}
   */
  inChats(...chatIds) {
    const ids = new Set(chatIds.flat());
    return (ctx) => ctx.chatId !== null && ids.has(ctx.chatId);
  },
};

// Ergonomic shorthand aliases
Filter.text = Filter.hasText;
Filter.photo = Filter.hasPhoto;
Filter.document = Filter.hasDocument;
Filter.audio = Filter.hasAudio;
Filter.voice = Filter.hasVoice;
Filter.video = Filter.hasVideo;
Filter.videoNote = Filter.hasVideoNote;
Filter.sticker = Filter.hasSticker;
Filter.animation = Filter.hasAnimation;
Filter.location = Filter.hasLocation;
Filter.contact = Filter.hasContact;
Filter.poll = Filter.hasPoll;
Filter.dice = Filter.hasDice;
Filter.widget = Filter.hasWidget;
Filter.widgetQuery = Filter.isWidgetQuery;
Filter.sharedWidgetQuery = Filter.isSharedWidgetQuery;
Filter.tonTransfer = Filter.hasTonTransfer;
Filter.paidMessagesWaived = Filter.hasPaidMessagesWaived;
Filter.callback = Filter.isCallback;

// --- Module: format.js ---
/**
 * Gramless: Safe Formatting & Entity Parser Engine
 * 
 * Provides zero-allocation HTML & MarkdownV2 escaping, tagged template
 * literals, and composable formatters to eliminate Telegram entity parse errors.
 * 
 * Engineered for V8 Isolates and TGCloud with 0 dependencies.
 */

const HTML_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

const HTML_RE = /[&<>"]/g;
const MD_V2_RE = /[_*[\]()~`>#+\-=|{}.!\\]/g;
const MD_V1_RE = /[_*`\[]/g;

/**
 * Wrapper for strings that should not be auto-escaped inside template literals.
 */
export class RawString {
  /**
   * @param {string} value
   */
  constructor(value) {
    this.value = String(value ?? '');
  }

  toString() {
    return this.value;
  }
}

/**
 * Marks a string as raw (will not be escaped inside html or md template tags).
 * @param {any} val
 * @returns {RawString}
 */
export function raw(val) {
  if (val instanceof RawString) return val;
  return new RawString(val);
}

/**
 * Escapes characters for Telegram HTML mode (&, <, >, ").
 * @param {any} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str.replace(HTML_RE, (char) => HTML_MAP[char]);
}

/**
 * Escapes reserved characters for Telegram MarkdownV2 mode.
 * Reserved: _ * [ ] ( ) ~ ` > # + - = | { } . ! \
 * @param {any} text
 * @returns {string}
 */
export function escapeMarkdown(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str.replace(MD_V2_RE, '\\$&');
}

/**
 * Escapes reserved characters for Telegram legacy Markdown mode.
 * Reserved: _ * ` [
 * @param {any} text
 * @returns {string}
 */
export function escapeMarkdownV1(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str.replace(MD_V1_RE, '\\$&');
}

/**
 * Tagged template literal for Telegram HTML.
 * Automatically escapes interpolated values unless wrapped in raw().
 * 
 * @example
 * const text = html`Hello <b>${user.name}</b>, your ID is <code>${user.id}</code>!`;
 */
export function html(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof RawString) {
        result += val.value;
      } else if (Array.isArray(val)) {
        result += val.map((v) => (v instanceof RawString ? v.value : escapeHtml(v))).join('');
      } else {
        result += escapeHtml(val);
      }
    }
  }
  return result;
}

/**
 * Tagged template literal for Telegram MarkdownV2.
 * Automatically escapes interpolated values unless wrapped in raw().
 * 
 * @example
 * const text = md`*Welcome* _${user.name}_ [link](${url})`;
 */
export function md(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof RawString) {
        result += val.value;
      } else if (Array.isArray(val)) {
        result += val.map((v) => (v instanceof RawString ? v.value : escapeMarkdown(v))).join('');
      } else {
        result += escapeMarkdown(val);
      }
    }
  }
  return result;
}

/**
 * Composable fluent formatter helper for Telegram HTML entities.
 */
export const fmt = {
  /**
   * Bold entity.
   * @param {any} text
   * @returns {RawString}
   */
  bold(text) {
    return new RawString(`<b>${escapeHtml(text)}</b>`);
  },

  /**
   * Italic entity.
   * @param {any} text
   * @returns {RawString}
   */
  italic(text) {
    return new RawString(`<i>${escapeHtml(text)}</i>`);
  },

  /**
   * Underline entity.
   * @param {any} text
   * @returns {RawString}
   */
  underline(text) {
    return new RawString(`<u>${escapeHtml(text)}</u>`);
  },

  /**
   * Strikethrough entity.
   * @param {any} text
   * @returns {RawString}
   */
  strikethrough(text) {
    return new RawString(`<s>${escapeHtml(text)}</s>`);
  },

  /**
   * Alias for strikethrough.
   * @param {any} text
   * @returns {RawString}
   */
  strike(text) {
    return fmt.strikethrough(text);
  },

  /**
   * Spoiler entity.
   * @param {any} text
   * @returns {RawString}
   */
  spoiler(text) {
    return new RawString(`<tg-spoiler>${escapeHtml(text)}</tg-spoiler>`);
  },

  /**
   * Inline code entity.
   * @param {any} text
   * @returns {RawString}
   */
  code(text) {
    return new RawString(`<code>${escapeHtml(text)}</code>`);
  },

  /**
   * Preformatted code block entity.
   * @param {any} text
   * @param {string} [language]
   * @returns {RawString}
   */
  pre(text, language = '') {
    if (language) {
      return new RawString(`<pre><code class="language-${escapeHtml(language)}">${escapeHtml(text)}</code></pre>`);
    }
    return new RawString(`<pre>${escapeHtml(text)}</pre>`);
  },

  /**
   * Inline URL link entity.
   * @param {any} text
   * @param {string} url
   * @returns {RawString}
   */
  link(text, url) {
    return new RawString(`<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`);
  },

  /**
   * User mention link entity.
   * @param {any} name
   * @param {number|string} userId
   * @returns {RawString}
   */
  mention(name, userId) {
    return new RawString(`<a href="tg://user?id=${userId}">${escapeHtml(name)}</a>`);
  },

  /**
   * Custom Telegram emoji entity.
   * @param {any} fallbackText
   * @param {string} emojiId
   * @returns {RawString}
   */
  customEmoji(fallbackText, emojiId) {
    return new RawString(`<tg-emoji emoji-id="${escapeHtml(emojiId)}">${escapeHtml(fallbackText)}</tg-emoji>`);
  },

  /**
   * Blockquote entity.
   * @param {any} text
   * @param {boolean} [expandable=false]
   * @returns {RawString}
   */
  blockquote(text, expandable = false) {
    if (expandable) {
      return new RawString(`<blockquote expandable>${escapeHtml(text)}</blockquote>`);
    }
    return new RawString(`<blockquote>${escapeHtml(text)}</blockquote>`);
  },

  /**
   * TON blockchain address entity (Bot API 10.4).
   * @param {string} address TON wallet address
   * @returns {RawString}
   */
  tonAddress(address) {
    return new RawString(`<a href="ton://transfer/${escapeHtml(address)}">${escapeHtml(address)}</a>`);
  },

  /**
   * Bank card number formatted entity (Bot API 10.4).
   * @param {string} number Card number
   * @returns {RawString}
   */
  bankCard(number) {
    return new RawString(`<code>${escapeHtml(number)}</code>`);
  },
};

// --- Module: init_data.js ---
/**
 * Gramless: Cryptographic Telegram Mini App (tApp) Auth Engine
 * 
 * Implements Telegram's WebApp initData HMAC-SHA256 verification specification
 * with zero dependencies using the universal Web Crypto API (`crypto.subtle`).
 * 
 * Works seamlessly across V8 Isolates, TGCloud, Cloudflare Workers, Deno, Bun, and Node 18+.
 */

/**
 * Constant-time string comparison to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let mismatch = a.length === b.length ? 0 : 1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const charA = a.charCodeAt(i % a.length) || 0;
    const charB = b.charCodeAt(i % b.length) || 0;
    mismatch |= (charA ^ charB);
  }
  return mismatch === 0;
}

/**
 * Parses raw Telegram Mini App initData query string into a structured object.
 * Automatically parses JSON fields (such as `user` and `receiver`).
 * 
 * @param {string} initData Raw URL-encoded initData string
 * @returns {Record<string, any>}
 */
export function parseInitData(initData) {
  if (!initData || typeof initData !== 'string') {
    return {};
  }

  // Handle optional leading '?'
  const cleanStr = initData.startsWith('?') ? initData.slice(1) : initData;
  const params = new URLSearchParams(cleanStr);
  const result = {};

  for (const [key, value] of params.entries()) {
    if (key === 'user' || key === 'receiver' || key === 'chat') {
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    } else if (key === 'auth_date') {
      const parsedInt = parseInt(value, 10);
      result[key] = Number.isNaN(parsedInt) ? value : parsedInt;
    } else if (key === 'can_send_after') {
      const parsedInt = parseInt(value, 10);
      result[key] = Number.isNaN(parsedInt) ? value : parsedInt;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Cryptographically validates Telegram Mini App initData using HMAC-SHA256.
 * 
 * Specification: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * 
 * @param {string} initData Raw query string from Telegram.WebApp.initData
 * @param {string} botToken Bot API token (e.g. "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11")
 * @param {Object} [options={}]
 * @param {number} [options.maxAge=86400] Maximum token age in seconds (replay prevention). Set to 0 to disable.
 * @param {number} [options.now] Optional timestamp override in seconds (useful for deterministic testing).
 * @returns {Promise<{ ok: boolean, data?: Record<string, any>, error?: string, message?: string }>}
 */
export async function validateInitData(initData, botToken, options = {}) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, error: 'MISSING_INIT_DATA', message: 'initData string is required' };
  }
  if (!botToken || typeof botToken !== 'string') {
    return { ok: false, error: 'MISSING_BOT_TOKEN', message: 'botToken is required for verification' };
  }

  const cleanStr = initData.startsWith('?') ? initData.slice(1) : initData;
  const params = new URLSearchParams(cleanStr);
  const hash = params.get('hash');

  if (!hash) {
    return { ok: false, error: 'MISSING_HASH', message: 'initData does not contain hash parameter' };
  }

  // Remove hash and sort remaining keys alphabetically
  params.delete('hash');
  const sortedKeys = Array.from(params.keys()).sort();
  const dataCheckParts = [];

  for (const key of sortedKeys) {
    dataCheckParts.push(`${key}=${params.get(key)}`);
  }
  const dataCheckString = dataCheckParts.join('\n');

  try {
    const enc = new TextEncoder();
    const cryptoSubtle = globalThis.crypto?.subtle;

    if (!cryptoSubtle) {
      return {
        ok: false,
        error: 'CRYPTO_UNAVAILABLE',
        message: 'Web Crypto API (crypto.subtle) is not available in this environment',
      };
    }

    // 1. Derivation: HMAC-SHA256("WebAppData", botToken)
    const webAppDataKey = await cryptoSubtle.importKey(
      'raw',
      enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secretKeyBytes = await cryptoSubtle.sign(
      'HMAC',
      webAppDataKey,
      enc.encode(botToken)
    );

    // 2. Signature: HMAC-SHA256(secretKeyBytes, dataCheckString)
    const secretKey = await cryptoSubtle.importKey(
      'raw',
      secretKeyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await cryptoSubtle.sign(
      'HMAC',
      secretKey,
      enc.encode(dataCheckString)
    );

    // Format signature as lowercase hex string
    const hex = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time verification
    if (!timingSafeEqual(hex.toLowerCase(), hash.toLowerCase())) {
      return { ok: false, error: 'INVALID_SIGNATURE', message: 'Cryptographic hash mismatch' };
    }

    // 3. Replay Protection: Check auth_date expiration and future timestamp
    const parsedData = parseInitData(initData);
    const maxAge = options.maxAge !== undefined ? options.maxAge : 86400; // 24 hours default
    if (typeof parsedData.auth_date === 'number') {
      const currentSeconds = options.now !== undefined ? options.now : Math.floor(Date.now() / 1000);
      const age = currentSeconds - parsedData.auth_date;

      // Reject future auth_date (allowing 60 seconds tolerance for client-server clock drift)
      if (age < -60) {
        return {
          ok: false,
          error: 'FUTURE_AUTH_DATE',
          message: `initData auth_date is in the future (skew: ${-age}s > 60s)`,
          data: parsedData,
        };
      }

      if (maxAge > 0 && age > maxAge) {
        return {
          ok: false,
          error: 'EXPIRED',
          message: `initData has expired (age: ${age}s > max: ${maxAge}s)`,
          data: parsedData,
        };
      }
    }

    return { ok: true, data: parsedData };
  } catch (err) {
    return {
      ok: false,
      error: 'VERIFICATION_FAILED',
      message: err.message || 'Verification failed unexpectedly',
    };
  }
}

/**
 * Creates an authentication middleware for Gramless Mini App endpoints.
 * Automatically verifies incoming `Authorization: tma <initData>` header or `initData` input parameter.
 * 
 * @param {string} botToken
 * @param {Object} [options={}]
 * @returns {Function}
 */
export function initDataAuth(botToken, options = {}) {
  return async function initDataAuthMiddleware(ctx, next) {
    const rawInitData = ctx.raw?.initData || ctx.initData || ctx.input?.initData;
    if (!rawInitData) {
      if (options.optional) {
        return next();
      }
      return { ok: false, error: 'UNAUTHORIZED', message: 'initData is required' };
    }

    const validation = await validateInitData(rawInitData, botToken, options);
    if (!validation.ok) {
      return { ok: false, error: 'UNAUTHORIZED', message: validation.message, details: validation.error };
    }

    ctx.initData = validation.data;
    ctx.user = validation.data.user || null;
    return next();
  };
}

// --- Module: pacer.js ---
/**
 * Gramless: Proactive Per-Chat Leaky-Bucket Serializer (Anti-Flood Guard)
 * 
 * Guarantees in-order delivery and paces outbound Telegram API calls to respect:
 * 1. Per-chat rate limit: Maximum 1 message per second (1,000 ms interval)
 * 2. Global rate limit: Maximum 30 messages per second globally
 * 
 * Eliminates Telegram `429 Too Many Requests` flood-wait errors before they happen.
 * Engineered for V8 Isolates and TGCloud with zero external dependencies.
 */


const DEFAULT_PACED_METHODS = new Set([
  'sendMessage',
  'sendPhoto',
  'sendDocument',
  'sendVideo',
  'sendAnimation',
  'sendAudio',
  'sendVoice',
  'sendVideoNote',
  'sendMediaGroup',
  'sendSticker',
  'sendLocation',
  'sendVenue',
  'sendContact',
  'sendPoll',
  'sendDice',
  'sendInvoice',
  'sendRichMessage',
  'sendLivePhoto',
  'sendWidget',
  'sendSharedWidget',
  'editMessageText',
  'editMessageCaption',
  'editMessageMedia',
  'editMessageReplyMarkup',
  'editMessageWidgetData',
]);

/**
 * High-performance, zero-dependency Token Bucket for global rate pacing.
 */
class GlobalTokenBucket {
  /**
   * @param {number} ratePerSec
   */
  constructor(ratePerSec) {
    this.ratePerSec = ratePerSec;
    this.capacity = ratePerSec;
    this.tokens = ratePerSec;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    if (elapsedMs > 0) {
      const addedTokens = (elapsedMs / 1000) * this.ratePerSec;
      this.tokens = Math.min(this.capacity, this.tokens + addedTokens);
      this.lastRefill = now;
    }
  }

  /**
   * Calculates delay required before next token is available.
   * @returns {number} Delay in milliseconds (0 if token is available immediately)
   */
  acquireDelay() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    // Time needed to accumulate 1 token
    const needed = 1 - this.tokens;
    const waitMs = Math.ceil((needed / this.ratePerSec) * 1000);
    this.tokens = 0;
    this.lastRefill = Date.now() + waitMs;
    return waitMs;
  }
}

/**
 * Helper to determine if a chat ID belongs to a group, supergroup, or channel.
 * In Telegram Bot API, all groups and channels have negative chat IDs.
 * @param {string|number|null|undefined} chatId
 * @returns {boolean}
 */
export function isGroupChatId(chatId) {
  if (typeof chatId === 'number') return chatId < 0;
  if (typeof chatId === 'string') return chatId.trim().startsWith('-');
  return false;
}

/**
 * Pacer engine managing per-chat queues and global dispatch limits.
 */
export class ChatPacer {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.minChatIntervalMs=1000] General minimum spacing fallback
   * @param {number} [options.minPrivateChatIntervalMs=1000] Minimum spacing for private chats (1 msg/sec)
   * @param {number} [options.minGroupChatIntervalMs=3000] Minimum spacing for groups (20 msgs/min = 3,000ms)
   * @param {number} [options.globalLimitPerSec=30] Maximum total messages across all chats per second
   * @param {Set<string>|Array<string>} [options.methods] Methods subject to pacing
   */
  constructor(options = {}) {
    this.minPrivateChatIntervalMs = options.minPrivateChatIntervalMs ?? options.minChatIntervalMs ?? 1000;
    this.minGroupChatIntervalMs = options.minGroupChatIntervalMs ?? 3000;
    this.globalTokenBucket = new GlobalTokenBucket(options.globalLimitPerSec ?? 30);
    this.maxConcurrent = options.maxConcurrent ?? 0;
    this.activeCount = 0;
    /** @type {Array<() => void>} */
    this.concurrencyWaiters = [];

    this.pacedMethods = options.methods
      ? new Set(options.methods)
      : DEFAULT_PACED_METHODS;

    /** @type {Map<string|number, number>} Bounded chat last dispatch timestamps */
    this.chatLastDispatch = new Map();

    /** @type {Map<string|number, { queue: Array<() => void>, running: boolean }>} */
    this.queues = new Map();
  }

  /**
   * Acquires a concurrency slot if maxConcurrent is enforced.
   * @private
   */
  async _acquireSlot() {
    if (this.maxConcurrent > 0 && this.activeCount >= this.maxConcurrent) {
      await new Promise((resolve) => this.concurrencyWaiters.push(resolve));
    }
    this.activeCount++;
  }

  /**
   * Releases a concurrency slot and notifies waiters.
   * @private
   */
  _releaseSlot() {
    this.activeCount--;
    if (this.concurrencyWaiters.length > 0) {
      const nextWaiter = this.concurrencyWaiters.shift();
      nextWaiter?.();
    }
  }

  /**
   * Enqueues an API call to a specific chat, guaranteeing in-order and paced execution.
   * 
   * @template T
   * @param {string|number|null} chatId
   * @param {() => Promise<T>} callFn
   * @returns {Promise<T>}
   */
  async enqueue(chatId, callFn) {
    // If no chatId is associated, execute subject only to global rate pacing and maxConcurrent
    if (chatId === null || chatId === undefined) {
      const globalDelay = this.globalTokenBucket.acquireDelay();
      if (globalDelay > 0) {
        await sleep(globalDelay);
      }
      await this._acquireSlot();
      try {
        return await callFn();
      } finally {
        this._releaseSlot();
      }
    }

    let chatEntry = this.queues.get(chatId);
    if (!chatEntry) {
      chatEntry = { queue: [], running: false };
      this.queues.set(chatId, chatEntry);
    }

    return new Promise((resolve, reject) => {
      chatEntry.queue.push(async () => {
        try {
          // 1. Calculate per-chat required wait (1s for private, 3s for groups / 20 msgs/min)
          const now = Date.now();
          const isGroup = isGroupChatId(chatId);
          const minInterval = isGroup ? this.minGroupChatIntervalMs : this.minPrivateChatIntervalMs;
          const lastDispatch = this.chatLastDispatch.get(chatId) || 0;
          const chatElapsed = now - lastDispatch;
          const chatDelay = Math.max(0, minInterval - chatElapsed);

          // 2. Calculate global bucket required wait
          const globalDelay = this.globalTokenBucket.acquireDelay();

          const totalDelay = Math.max(chatDelay, globalDelay);
          if (totalDelay > 0) {
            await sleep(totalDelay);
          }

          await this._acquireSlot();
          try {
            this.chatLastDispatch.set(chatId, Date.now());
            const result = await callFn();
            resolve(result);
          } finally {
            this._releaseSlot();
          }
        } catch (err) {
          reject(err);
        }
      });

      if (!chatEntry.running) {
        this._drainChat(chatId, chatEntry);
      }
    });
  }

  /**
   * Drains the queue for a single chat sequentially.
   * @private
   */
  async _drainChat(chatId, entry) {
    entry.running = true;
    while (entry.queue.length > 0) {
      const task = entry.queue.shift();
      if (task) {
        await task();
      }
    }
    // Clean up empty queue entry to prevent memory leaks in isolates
    entry.running = false;
    if (entry.queue.length === 0) {
      this.queues.delete(chatId);
    }

    // Opportunistically prune old chatLastDispatch timestamps
    if (this.chatLastDispatch.size > 5000) {
      const cutoff = Date.now() - 60000;
      for (const [id, ts] of this.chatLastDispatch.entries()) {
        if (ts < cutoff) {
          this.chatLastDispatch.delete(id);
        }
      }
    }
  }

  /**
   * Wraps an API client to automatically route paced methods through the serializer.
   * 
   * @param {Object} api Raw API client with a .call(method, params) signature
   * @returns {Object}
   */
  wrapApi(api) {
    if (!api || typeof api.call !== 'function') {
      return api;
    }

    const self = this;
    return new Proxy(api, {
      get(target, prop, receiver) {
        if (prop === 'call') {
          return async (method, params = {}) => {
            if (!self.pacedMethods.has(method)) {
              return target.call(method, params);
            }
            const chatId = params?.chat_id ?? null;
            return self.enqueue(chatId, () => target.call(method, params));
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }
}

/**
 * Creates a proactive flood-control pacer and wraps the API client.
 * 
 * @param {Object} api
 * @param {Object} [options={}]
 * @returns {Object}
 */
export function wrapPacer(api, options = {}) {
  const pacerInstance = new ChatPacer(options);
  return pacerInstance.wrapApi(api);
}

/**
 * Gramless middleware that injects proactive per-chat pacing into `ctx.api`.
 * 
 * @param {Object} [options={}]
 * @returns {Function}
 */
export function pacer(options = {}) {
  const pacerInstance = new ChatPacer(options);

  return async function pacerMiddleware(ctx, next) {
    if (ctx.api && typeof ctx.api.call === 'function') {
      ctx.api = pacerInstance.wrapApi(ctx.api);
    }
    return next();
  };
}

// --- Module: stateless_question.js ---
/**
 * Gramless Stateless Question Engine
 * 
 * Enables one-off questions with Telegram ForceReply without requiring
 * database sessions or complex state machines. Uses invisible zero-width
 * unicode tags so questions remain completely clean to the user.
 */

const TAG_START = '\u200B\u200C';
const TAG_END = '\u200C\u200B';

/**
 * Injects an invisible zero-width unicode tag into a text string.
 * @param {string} tag
 * @param {string} text
 * @returns {string}
 */
export function wrapQuestionText(tag, text) {
  return `${TAG_START}${tag}${TAG_END}${text}`;
}

/**
 * Extracts a hidden tag from question text.
 * @param {string} [text]
 * @returns {string|null}
 */
export function extractQuestionTag(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\u200B\u200C([^\u200C]+)\u200C\u200B/);
  return match ? match[1] : null;
}

export class StatelessQuestion {
  /**
   * @param {string} tag Unique question identifier
   * @param {Function} handler async (ctx) => void
   */
  constructor(tag, handler) {
    this.tag = tag;
    this.handler = handler;
  }

  /**
   * Sends the question message to the user with Telegram ForceReply.
   * 
   * @param {import('./context.js').GramlessContext} ctx
   * @param {string} text Question text shown to user
   * @param {Object} [options={}] Additional reply options
   * @returns {Promise<any>}
   */
  async reply(ctx, text, options = {}) {
    const tagged = wrapQuestionText(this.tag, text);
    return ctx.reply(tagged, {
      forceReply: true,
      placeholder: options.placeholder,
      selective: options.selective,
      ...options,
    });
  }

  /**
   * Middleware that intercepts replies to this question.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      const replyTo = ctx.message?.reply_to_message;
      if (!replyTo || !replyTo.text) {
        return next();
      }

      const tag = extractQuestionTag(replyTo.text);
      if (tag === this.tag) {
        ctx.questionTag = tag;
        await this.handler(ctx);
        return;
      }

      return next();
    };
  }
}

/**
 * Creates a stateless question instance.
 * 
 * @param {string} tag Unique question tag
 * @param {Function} handler async (ctx) => void
 * @returns {StatelessQuestion}
 */
export function createStatelessQuestion(tag, handler) {
  return new StatelessQuestion(tag, handler);
}

// --- Module: cleaner.js ---
/**
 * Gramless Message Cleaner Engine
 * 
 * Automatically tracks and purges temporary bot messages (loading notices,
 * transient alerts, interactive keyboards) to keep chat history clean.
 */

export class MessageCleaner {
  constructor() {
    /** @type {Map<string|number, Set<number>>} chatId -> Set of messageIds */
    this.tracked = new Map();
  }

  /**
   * Tracks a message ID for deletion in a chat.
   * 
   * @param {string|number} chatId
   * @param {number|Object} messageIdOrObject
   */
  track(chatId, messageIdOrObject) {
    if (!chatId) return;

    let id = messageIdOrObject;
    if (typeof messageIdOrObject === 'object' && messageIdOrObject !== null) {
      id = messageIdOrObject.message_id || messageIdOrObject.id;
    }

    if (typeof id !== 'number') return;

    let set = this.tracked.get(chatId);
    if (!set) {
      set = new Set();
      this.tracked.set(chatId, set);
    }
    set.add(id);
  }

  /**
   * Deletes all tracked messages in the specified chat.
   * Silently handles errors if messages were already deleted or expired.
   * 
   * @param {import('./context.js').GramlessContext} ctx
   * @returns {Promise<number>} Number of deleted messages
   */
  async clean(ctx) {
    const chatId = ctx.chatId;
    if (!chatId) return 0;

    const set = this.tracked.get(chatId);
    if (!set || set.size === 0) return 0;

    const messageIds = Array.from(set);
    this.tracked.delete(chatId);

    let deletedCount = 0;
    for (const msgId of messageIds) {
      try {
        await ctx.call('deleteMessage', {
          chat_id: chatId,
          message_id: msgId,
        });
        deletedCount++;
      } catch {
        // Silently ignore 400s (message already deleted or not found)
      }
    }

    return deletedCount;
  }

  /**
   * Middleware that equips ctx with temporary messaging and cleanup helpers.
   * 
   * @param {Object} [options={}]
   * @param {boolean} [options.autoCleanOnCommand=false] Automatically purge tracked messages on new commands
   * @returns {Function} Middleware function (ctx, next)
   */
  middleware(options = {}) {
    const autoClean = options.autoCleanOnCommand || false;

    return async (ctx, next) => {
      ctx.cleaner = {
        track: (msg) => this.track(ctx.chatId, msg),
        clean: () => this.clean(ctx),
      };

      ctx.trackTemp = (msg) => this.track(ctx.chatId, msg);
      ctx.cleanTracked = () => this.clean(ctx);

      ctx.replyTemp = async (text, opts = {}) => {
        const msg = await ctx.reply(text, opts);
        if (msg) this.track(ctx.chatId, msg);
        return msg;
      };

      if (autoClean && ctx.text && ctx.text.charCodeAt(0) === 47 /* '/' */) {
        await this.clean(ctx);
      }

      return next();
    };
  }
}

/**
 * Creates a message cleaner instance.
 * @param {Object} [options]
 * @returns {MessageCleaner}
 */
export function createCleaner(options) {
  return new MessageCleaner();
}

/**
 * Middleware factory for cleaner.
 * @param {Object} [options]
 * @returns {Function}
 */
export function cleaner(options = {}) {
  const instance = new MessageCleaner();
  return instance.middleware(options);
}

// --- Module: auto_retry.js ---
/**
 * Gramless Auto-Retry & Flood Control Interceptor
 * 
 * Automatically catches Telegram 429 (Too Many Requests) errors,
 * sleeps for the requested retry_after seconds, and retries the outbound call.
 */



/**
 * Executes a function with automatic retry on Telegram 429 flood control errors.
 * 
 * In serverless isolates, retry delays exceeding maxServerlessDelay (default 1.5s)
 * abort immediately and throw FloodWaitError, preventing fatal platform isolate timeouts.
 * 
 * @param {Function} callFn Async function to invoke
 * @param {Object} [options={}]
 * @param {number} [options.maxRetries=3] Maximum number of retry attempts
 * @param {number} [options.maxDelay=60000] Maximum acceptable retry_after wait in ms
 * @param {number} [options.maxServerlessDelay=1500] Maximum acceptable wait in serverless isolates
 * @param {boolean} [options.serverless] Force serverless ceiling behavior
 * @param {Function} [options.onRetry] Hook called before sleeping: (info) => void
 * @returns {Promise<any>}
 */
export async function executeWithRetry(callFn, options = {}) {
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
  const isServerless = options.serverless ?? isIsolateRuntime();
  const maxDelay = isServerless
    ? (options.maxServerlessDelay ?? 1500)
    : (options.maxDelay ?? 60000);
  const onRetry = options.onRetry || null;

  let attempt = 0;
  while (true) {
    try {
      return await callFn();
    } catch (err) {
      attempt++;
      const errorCode = err?.errorCode || err?.code || (err?.response && err.response.status);
      const retryAfter = err?.retryAfter || err?.parameters?.retry_after;

      if (errorCode === 429 && typeof retryAfter === 'number' && attempt <= maxRetries) {
        const delayMs = retryAfter * 1000;

        if (delayMs <= maxDelay) {
          if (onRetry) {
            onRetry({
              attempt,
              maxRetries,
              retryAfter,
              delayMs,
              error: err,
            });
          }

          await sleep(delayMs);
          continue;
        }

        // Delay exceeds ceiling: abort and emit structured FloodWaitError
        const desc = err.description
          ? `${err.description} (${retryAfter}s exceeds serverless isolate ceiling)`
          : `Telegram flood wait (${retryAfter}s exceeds serverless isolate ceiling)`;
        throw new FloodWaitError(
          err.method || 'unknown',
          desc,
          retryAfter,
          err.parameters || {}
        );
      }

      throw err;
    }
  }
}

/**
 * Wraps a Telegram API client with auto-retry on 429 flood wait errors.
 * 
 * @param {Record<string, any>} api
 * @param {Object} [options]
 * @returns {Record<string, any>}
 */
export function wrapApi(api, options = {}) {
  if (!api) return api;

  const originalCall = typeof api.call === 'function'
    ? api.call.bind(api)
    : (method, params) => api[method](params);

  const retryCall = async (method, params) => {
    return executeWithRetry(() => originalCall(method, params), options);
  };

  return new Proxy(api, {
    get(target, prop) {
      if (prop === 'call') {
        return retryCall;
      }
      if (typeof target[prop] === 'function') {
        return async (...args) => {
          return executeWithRetry(() => target[prop](...args), options);
        };
      }
      return target[prop];
    },
  });
}

/**
 * Middleware that equips ctx.call with automatic 429 flood wait retry.
 * 
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.maxDelay=60000]
 * @param {Function} [options.onRetry]
 * @returns {Function} Middleware function (ctx, next)
 */
export function autoRetry(options = {}) {
  return async function autoRetryMiddleware(ctx, next) {
    const originalCall = ctx.call.bind(ctx);

    ctx.call = async (method, params = {}) => {
      return executeWithRetry(() => originalCall(method, params), options);
    };

    if (ctx.api) {
      ctx.api = wrapApi(ctx.api, options);
    }

    return next();
  };
}

// --- Module: media_group.js ---
/**
 * Gramless Media Group / Album Aggregator Engine
 * 
 * Aggregates multi-photo/video album updates sharing the same media_group_id
 * into a single consolidated handler execution, preventing duplicate responses.
 */


export class MediaGroupAggregator {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.timeout=100] Debounce delay in milliseconds to gather album items
   */
  constructor(options = {}) {
    this.timeout = options.timeout || 100;
    /** @type {Map<string, { contexts: any[], timer: any, resolve: Function }>} */
    this.batches = new Map();
  }

  /**
   * Middleware that aggregates media group messages.
   * @returns {Function}
   */
  middleware() {
    return (ctx, next) => {
      const mediaGroupId = ctx.raw?.media_group_id || ctx.message?.media_group_id;

      // If not part of a media group, proceed immediately
      if (!mediaGroupId) {
        return next();
      }

      let batch = this.batches.get(mediaGroupId);

      const scheduleFlush = () => {
        safeClearTimeout(batch.timer);
        batch.timer = safeSetTimeout(async () => {
          this.batches.delete(mediaGroupId);
          const mediaItems = batch.contexts.map(c => c.message || c.raw);
          batch.firstCtx.mediaGroup = mediaItems;
          batch.firstCtx.mediaGroupContexts = batch.contexts;

          try {
            await batch.next();
            for (let i = 0; i < batch.waiters.length; i++) {
              batch.waiters[i].resolve();
            }
          } catch (err) {
            for (let i = 0; i < batch.waiters.length; i++) {
              batch.waiters[i].reject(err);
            }
          }
        }, this.timeout);
      };

      if (!batch) {
        batch = {
          contexts: [ctx],
          waiters: [],
          firstCtx: ctx,
          next,
          timer: null,
        };

        this.batches.set(mediaGroupId, batch);
        scheduleFlush();

        return new Promise((resolve, reject) => {
          batch.waiters.push({ resolve, reject });
        });
      }

      // Subsequent message in the same media group
      batch.contexts.push(ctx);
      scheduleFlush();

      return new Promise((resolve, reject) => {
        batch.waiters.push({ resolve, reject });
      });
    };
  }
}

/**
 * Creates a media group aggregation middleware.
 * 
 * @param {Object} [options]
 * @param {number} [options.timeout=100] Debounce window in ms (default 100)
 * @returns {Function} Middleware function (ctx, next)
 */
export function mediaGroup(options = {}) {
  const aggregator = new MediaGroupAggregator(options);
  return aggregator.middleware();
}

// --- Module: payments.js ---
/**
 * Gramless Telegram Stars & Digital Payments Engine
 * 
 * Provides first-class support for Telegram Stars (XTR), invoice creation,
 * pre-checkout validation hooks, and successful payment settlement.
 */

export class StarsEngine {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.currency='XTR'] Currency code (default 'XTR' for Telegram Stars)
   */
  constructor(options = {}) {
    this.currency = options.currency || 'XTR';
    /** @type {Function|null} */
    this.preCheckoutHandler = null;
    /** @type {Array<{ payloadPattern?: string|RegExp, handler: Function }>} */
    this.successHandlers = [];
  }

  /**
   * Sends an invoice for Telegram Stars (XTR) or digital goods.
   * 
   * @param {import('./context.js').GramlessContext} ctx
   * @param {Object} invoice
   * @param {string} invoice.title Product title
   * @param {string} invoice.description Product description
   * @param {number} invoice.stars Number of Telegram Stars
   * @param {string} invoice.payload Bot-defined invoice payload
   * @param {string} [invoice.photoUrl] Optional product image URL
   * @param {Record<string, any>} [invoice.options] Additional Bot API parameters
   * @returns {Promise<any>}
   */
  async sendInvoice(ctx, invoice) {
    const chatId = ctx.chatId;
    const stars = Number(invoice.stars) || 1;

    const params = {
      chat_id: chatId,
      title: invoice.title,
      description: invoice.description,
      payload: invoice.payload || `stars_${Date.now()}`,
      currency: this.currency,
      prices: [{ label: invoice.title, amount: stars }],
      ...(invoice.options || {}),
    };

    if (invoice.photoUrl) {
      params.photo_url = invoice.photoUrl;
    }

    return ctx.call('sendInvoice', params);
  }

  /**
   * Generates a shareable Telegram Stars invoice link (t.me/$...).
   * 
   * @param {import('./context.js').GramlessContext} ctx
   * @param {Object} invoice
   * @param {string} invoice.title
   * @param {string} invoice.description
   * @param {number} invoice.stars
   * @param {string} invoice.payload
   * @returns {Promise<string>}
   */
  async createInvoiceLink(ctx, invoice) {
    const stars = Number(invoice.stars) || 1;
    const params = {
      title: invoice.title,
      description: invoice.description,
      payload: invoice.payload || `stars_${Date.now()}`,
      currency: this.currency,
      prices: [{ label: invoice.title, amount: stars }],
      ...(invoice.options || {}),
    };

    return ctx.call('createInvoiceLink', params);
  }

  /**
   * Registers a validation hook for incoming pre_checkout_query updates.
   * Must return true to accept, or a string/object describing error to decline.
   * 
   * @param {Function} validator async (ctx) => true | string | { ok: boolean, error?: string }
   * @returns {this}
   */
  onPreCheckout(validator) {
    this.preCheckoutHandler = validator;
    return this;
  }

  /**
   * Registers a handler for completed, successful payments.
   * 
   * @param {string|RegExp|Function} [filterOrHandler] Payload pattern or handler function
   * @param {Function} [handler] async (ctx, payment) => void
   * @returns {this}
   */
  onSuccess(filterOrHandler, handler) {
    if (typeof filterOrHandler === 'function') {
      this.successHandlers.push({ handler: filterOrHandler });
    } else {
      this.successHandlers.push({ payloadPattern: filterOrHandler, handler });
    }
    return this;
  }

  /**
   * Refunds a Telegram Star payment.
   * 
   * @param {import('./context.js').GramlessContext} ctx
   * @param {Object} params
   * @param {number} params.userId
   * @param {string} params.chargeId Telegram payment charge ID
   * @returns {Promise<boolean>}
   */
  async refund(ctx, { userId, chargeId }) {
    return ctx.call('refundStarPayment', {
      user_id: userId,
      telegram_payment_charge_id: chargeId,
    });
  }

  /**
   * Middleware that intercepts pre_checkout_query and successful_payment updates.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      // 1. Pre-checkout query hook
      const preCheckout = ctx.raw?.total_amount !== undefined && ctx.raw?.currency
        ? ctx.raw
        : ctx.update?.pre_checkout_query;

      if (preCheckout) {
        if (this.preCheckoutHandler) {
          const result = await this.preCheckoutHandler(ctx);
          if (result === true || result === undefined) {
            await ctx.answerPreCheckoutQuery(true);
            return;
          } else if (typeof result === 'string') {
            await ctx.answerPreCheckoutQuery(false, result);
            return;
          } else if (result && typeof result === 'object') {
            await ctx.answerPreCheckoutQuery(result.ok !== false, result.error || '');
            return;
          }
        } else {
          // Default accept
          await ctx.answerPreCheckoutQuery(true);
          return;
        }
      }

      // 2. Successful payment hook
      const payment = ctx.raw?.successful_payment || ctx.message?.successful_payment;
      if (payment) {
        ctx.payment = payment;
        const payload = payment.invoice_payload || '';

        for (let i = 0; i < this.successHandlers.length; i++) {
          const { payloadPattern, handler } = this.successHandlers[i];
          if (!payloadPattern) {
            await handler(ctx, payment);
            return;
          }

          if (payloadPattern instanceof RegExp && payloadPattern.test(payload)) {
            await handler(ctx, payment);
            return;
          }

          if (typeof payloadPattern === 'string' && payload === payloadPattern) {
            await handler(ctx, payment);
            return;
          }
        }
      }

      return next();
    };
  }
}

/**
 * Creates a Telegram Stars & Payments engine instance.
 * @param {Object} [options]
 * @returns {StarsEngine}
 */
export function createStarsEngine(options) {
  return new StarsEngine(options);
}

// --- Module: menu.js ---
/**
 * Gramless Interactive Menu & Pagination Engine
 * 
 * Provides declarative inline menus, paginated list generation with navigation buttons,
 * and zero-boilerplate list browsing.
 */

/**
 * Builds a paginated message and inline navigation keyboard.
 * 
 * @template T
 * @param {import('./context.js').GramlessContext} ctx
 * @param {Object} options
 * @param {T[]} options.items Full array of items to paginate
 * @param {number} [options.pageSize=5] Number of items per page
 * @param {number} [options.page=1] Current page (1-indexed)
 * @param {(item: T, pageIndex: number, globalIndex: number) => string} options.formatItem Formatter for each row
 * @param {string|((page: number, totalPages: number, count: number) => string)} [options.header] Optional header
 * @param {string|((page: number, totalPages: number, count: number) => string)} [options.footer] Optional footer
 * @param {string} [options.callbackPrefix='page:'] Prefix for pagination callback buttons
 * @param {(item: T, pageIndex: number, globalIndex: number) => any} [options.itemButtons] Row buttons for each item
 * @param {Array<Array<any>>} [options.extraButtons] Extra button rows below pagination controls
 * @param {string} [options.prevText='⬅️ Prev'] Text for previous button
 * @param {string} [options.nextText='Next ➡️'] Text for next button
 * @param {((page: number, totalPages: number) => string)} [options.pageText] Text for page indicator
 * @param {boolean} [options.editMessage] Whether to edit existing message (defaults to true if callback query)
 * @param {Record<string, any>} [options.replyOptions={}] Extra options passed to reply/edit
 * @returns {Promise<{ text: string, buttons: any[][], page: number, totalPages: number }>}
 */
export async function paginate(ctx, options) {
  const items = options.items || [];
  const pageSize = Math.max(1, options.pageSize || 5);
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.max(1, Math.min(Number(options.page) || 1, totalPages));

  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const currentItems = items.slice(startIndex, endIndex);

  // 1. Build text lines
  const lines = [];

  if (options.header) {
    const headerStr = typeof options.header === 'function'
      ? options.header(page, totalPages, totalCount)
      : options.header;
    if (headerStr) lines.push(headerStr);
  }

  if (currentItems.length === 0) {
    lines.push('<i>No items to display.</i>');
  } else {
    for (let i = 0; i < currentItems.length; i++) {
      const globalIdx = startIndex + i;
      const formatted = options.formatItem(currentItems[i], i, globalIdx);
      if (formatted) lines.push(formatted);
    }
  }

  if (options.footer) {
    const footerStr = typeof options.footer === 'function'
      ? options.footer(page, totalPages, totalCount)
      : options.footer;
    if (footerStr) lines.push(footerStr);
  }

  const messageText = lines.join('\n');

  // 2. Build keyboard
  const buttons = [];
  const prefix = options.callbackPrefix || 'page:';

  // Per-item buttons if provided
  if (options.itemButtons) {
    for (let i = 0; i < currentItems.length; i++) {
      const globalIdx = startIndex + i;
      const btn = options.itemButtons(currentItems[i], i, globalIdx);
      if (btn) {
        buttons.push(Array.isArray(btn) ? btn : [btn]);
      }
    }
  }

  // Navigation row (only show if multiple pages or explicitly requested)
  if (totalPages > 1 || options.alwaysShowControls) {
    const navRow = [];
    const prevText = options.prevText || '⬅️ Prev';
    const nextText = options.nextText || 'Next ➡️';
    const pageTextFn = options.pageText || ((p, t) => `${p}/${t}`);

    if (page > 1) {
      navRow.push({ text: prevText, data: `${prefix}${page - 1}` });
    } else {
      navRow.push({ text: '·', data: `${prefix}noop` });
    }

    navRow.push({ text: pageTextFn(page, totalPages), data: `${prefix}noop` });

    if (page < totalPages) {
      navRow.push({ text: nextText, data: `${prefix}${page + 1}` });
    } else {
      navRow.push({ text: '·', data: `${prefix}noop` });
    }

    buttons.push(navRow);
  }

  // Extra action buttons below navigation
  if (Array.isArray(options.extraButtons)) {
    buttons.push(...options.extraButtons);
  }

  const editMessage = options.editMessage !== undefined
    ? options.editMessage
    : (ctx.data !== null);

  const payload = {
    buttons,
    parse_mode: 'HTML',
    ...(options.replyOptions || {}),
  };

  if (editMessage) {
    try {
      await ctx.edit(messageText, payload);
    } catch (err) {
      // If message is unchanged or too old, fall back to reply
      if (err?.description && err.description.includes('message is not modified')) {
        await ctx.answer?.();
      } else {
        await ctx.reply(messageText, payload);
      }
    }
  } else {
    await ctx.reply(messageText, payload);
  }

  return {
    text: messageText,
    buttons,
    page,
    totalPages,
    totalCount,
  };
}

/**
 * Fluent inline menu builder.
 */
export class Menu {
  /**
   * @param {string} id Unique menu identifier
   */
  constructor(id) {
    this.id = id;
    this.rows = [[]];
    this.handlers = new Map();
  }

  /**
   * Appends an interactive callback button to current row.
   * 
   * @param {string} text Button label
   * @param {Function} handler Click handler: async (ctx) => void
   * @param {string} [actionId] Custom action identifier
   * @returns {this}
   */
  text(text, handler, actionId = null) {
    const action = actionId || `${this.id}:${this.handlers.size}`;
    const currentRow = this.rows[this.rows.length - 1];
    currentRow.push({ text, data: action });
    this.handlers.set(action, handler);
    return this;
  }

  /**
   * Appends an external URL button.
   * @param {string} text
   * @param {string} url
   * @returns {this}
   */
  url(text, url) {
    const currentRow = this.rows[this.rows.length - 1];
    currentRow.push({ text, url });
    return this;
  }

  /**
   * Appends a Telegram Web App button.
   * @param {string} text
   * @param {string} url
   * @returns {this}
   */
  webApp(text, url) {
    const currentRow = this.rows[this.rows.length - 1];
    currentRow.push({ text, webApp: url });
    return this;
  }

  /**
   * Starts a new row of buttons.
   * @returns {this}
   */
  row() {
    if (this.rows[this.rows.length - 1].length > 0) {
      this.rows.push([]);
    }
    return this;
  }

  /**
   * Exports the generated buttons array for use in ctx.reply({ buttons }).
   * @returns {Array<Array<any>>}
   */
  build() {
    return this.rows.filter(r => r.length > 0);
  }

  /**
   * Registers all menu handlers on a GramlessRouter instance.
   * @param {import('./router.js').GramlessRouter} router
   * @returns {this}
   */
  register(router) {
    for (const [action, handler] of this.handlers.entries()) {
      router.action(action, async (ctx) => {
        await ctx.answer?.();
        await handler(ctx);
      });
    }
    return this;
  }
}

// --- Module: i18n.js ---
/**
 * Gramless Internationalization (i18n) Engine
 * 
 * Provides zero-dependency localization, dot-notation template interpolation,
 * and pluralization with zero runtime allocations.
 */

/**
 * Resolves a dot-delimited property path from a nested object.
 * @param {Record<string, any>} obj
 * @param {string} path
 * @returns {any}
 */
function resolvePath(obj, path) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (path in obj) return obj[path];

  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[parts[i]];
  }
  return current;
}

/**
 * Interpolates variables in a template string (e.g. "Hello, {name}!").
 * @param {string} template
 * @param {Record<string, any>} [params={}]
 * @returns {string}
 */
function interpolate(template, params = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Selects plural form based on count.
 * Supports:
 * - 2-pipe format: "singular | plural" (e.g. "{count} item | {count} items")
 * - 3-pipe format: "zero | singular | plural" (e.g. "No items | 1 item | {count} items")
 * - Object format: { zero: "...", one: "...", other: "..." }
 * 
 * @param {string|Record<string, string>} template
 * @param {number} count
 * @param {Record<string, any>} params
 * @returns {string}
 */
function pluralize(template, count, params) {
  if (typeof template === 'object' && template !== null) {
    if (count === 0 && template.zero) return interpolate(template.zero, params);
    if (count === 1 && template.one) return interpolate(template.one, params);
    if (template.other) return interpolate(template.other, params);
    return interpolate(Object.values(template)[0] || '', params);
  }

  if (typeof template === 'string') {
    if (!template.includes('|')) {
      return interpolate(template, params);
    }

    const parts = template.split('|').map(p => p.trim());
    if (parts.length === 2) {
      const selected = count === 1 ? parts[0] : parts[1];
      return interpolate(selected, params);
    } else if (parts.length >= 3) {
      let selected;
      if (count === 0) selected = parts[0];
      else if (count === 1) selected = parts[1];
      else selected = parts[2];
      return interpolate(selected, params);
    }
  }

  return '';
}

export class I18nEngine {
  /**
   * @param {Object} options
   * @param {string} [options.defaultLocale='en']
   * @param {Record<string, Record<string, any>>} [options.locales={}]
   * @param {Function} [options.resolveLocale]
   */
  constructor(options = {}) {
    this.defaultLocale = options.defaultLocale || 'en';
    this.locales = { ...(options.locales || {}) };
    this.resolveLocale = options.resolveLocale || ((ctx) => {
      return ctx.session?.lang || ctx.from?.language_code || this.defaultLocale;
    });
  }

  /**
   * Registers or extends translations for a given locale.
   * @param {string} locale
   * @param {Record<string, any>} data
   * @returns {this}
   */
  loadLocale(locale, data) {
    this.locales[locale] = {
      ...(this.locales[locale] || {}),
      ...data,
    };
    return this;
  }

  /**
   * Translates a key for a given locale with variable interpolation and pluralization.
   * 
   * @param {string} locale Target locale code (e.g. 'en', 'es', 'ru')
   * @param {string} key Dot-notated translation key
   * @param {Record<string, any>} [params={}] Interpolation arguments
   * @returns {string}
   */
  t(locale, key, params = {}) {
    const targetData = this.locales[locale];
    let template = targetData ? resolvePath(targetData, key) : undefined;

    // Fallback to default locale if missing
    if (template === undefined && locale !== this.defaultLocale) {
      const fallbackData = this.locales[this.defaultLocale];
      template = fallbackData ? resolvePath(fallbackData, key) : undefined;
    }

    if (template === undefined) {
      return key; // Missing translation fallback: return raw key
    }

    if (params && typeof params.count === 'number') {
      return pluralize(template, params.count, params);
    }

    if (typeof template === 'string') {
      return interpolate(template, params);
    }

    return String(template);
  }

  /**
   * Middleware that attaches `ctx.t()`, `ctx.locale`, and `ctx.setLocale()`.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      let currentLocale = this.resolveLocale(ctx) || this.defaultLocale;

      // Extract primary language tag if localized e.g. "en-US" -> "en" if "en-US" not found
      if (!this.locales[currentLocale] && currentLocale.includes('-')) {
        const base = currentLocale.split('-')[0];
        if (this.locales[base]) currentLocale = base;
      }

      ctx.locale = currentLocale;

      ctx.t = (key, params) => {
        return this.t(ctx.locale, key, params);
      };

      ctx.setLocale = (newLocale) => {
        ctx.locale = newLocale;
        if (ctx.session) {
          ctx.session.lang = newLocale;
        }
      };

      return next();
    };
  }
}

/**
 * Creates an internationalization engine instance.
 * @param {Object} [options]
 * @returns {I18nEngine}
 */
export function createI18n(options) {
  return new I18nEngine(options);
}

// --- Module: ratelimit.js ---
/**
 * Gramless Rate Limit & Flood Protection Engine
 * 
 * Provides sliding-window rate limiting with token-bucket behavior,
 * protecting Telegram bots from spam, double-clicks, and 429 flood wait errors.
 */

/**
 * Parses time duration strings into milliseconds.
 * Supports: '500ms', '10s', '2m', '1h', or raw numbers in ms.
 * 
 * @param {string|number} duration
 * @returns {number}
 */
export function parseDuration(duration) {
  if (typeof duration === 'number') return duration;
  if (typeof duration !== 'string') return 1000;

  const match = duration.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!match) return 1000;

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'ms').toLowerCase();

  switch (unit) {
    case 'h': return Math.round(value * 3600 * 1000);
    case 'm': return Math.round(value * 60 * 1000);
    case 's': return Math.round(value * 1000);
    case 'ms':
    default:
      return Math.round(value);
  }
}

/**
 * High-performance in-memory sliding window rate limit store.
 */
export class MemoryRateLimitStore {
  constructor() {
    /** @type {Map<string, number[]>} Key -> array of timestamps in ms */
    this.storage = new Map();
  }

  /**
   * Consumes a token and checks if within limits.
   * 
   * @param {string} key
   * @param {number} limit Maximum requests
   * @param {number} windowMs Window duration in ms
   * @returns {{ ok: boolean, remaining: number, retryAfterMs: number, resetMs: number }}
   */
  consume(key, limit, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.storage.get(key);
    if (!timestamps) {
      timestamps = [];
      this.storage.set(key, timestamps);
    }

    // Drop timestamps older than the sliding window
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= limit) {
      const oldest = timestamps[0];
      const retryAfterMs = Math.max(0, oldest + windowMs - now);
      return {
        ok: false,
        remaining: 0,
        retryAfterMs,
        resetMs: oldest + windowMs,
      };
    }

    timestamps.push(now);

    // Opportunistic memory cleanup if map grows large
    if (this.storage.size > 1000) {
      for (const [k, ts] of this.storage.entries()) {
        if (ts.length === 0 || ts[ts.length - 1] <= windowStart) {
          this.storage.delete(k);
        }
      }
    }

    return {
      ok: true,
      remaining: limit - timestamps.length,
      retryAfterMs: 0,
      resetMs: timestamps[0] + windowMs,
    };
  }

  /**
   * Clears state for a key or everything.
   * @param {string} [key]
   */
  clear(key) {
    if (key) {
      this.storage.delete(key);
    } else {
      this.storage.clear();
    }
  }
}

/**
 * Standard key resolvers for rate limiting.
 * Safely handles numeric ID 0.
 */
export const RateLimitKey = {
  byUser: (ctx) => (ctx.userId !== null && ctx.userId !== undefined ? `user:${ctx.userId}` : null),
  byChat: (ctx) => (ctx.chatId !== null && ctx.chatId !== undefined ? `chat:${ctx.chatId}` : null),
  byChatUser: (ctx) => (
    ctx.chatId !== null && ctx.chatId !== undefined &&
    ctx.userId !== null && ctx.userId !== undefined
      ? `chat_user:${ctx.chatId}:${ctx.userId}`
      : null
  ),
};

/**
 * Creates a rate limiting middleware.
 * 
 * @param {Object} [options={}]
 * @param {number} [options.limit=5] Max requests within window
 * @param {string|number} [options.window='10s'] Duration window (e.g. '10s', '1m', 5000)
 * @param {Function} [options.key] Key generator function: (ctx) => string
 * @param {MemoryRateLimitStore} [options.store] Custom store instance
 * @param {Function} [options.skip] Predicate to bypass rate limit: (ctx) => boolean
 * @param {Function} [options.onLimitReached] Handler when limit is exceeded: async (ctx, info) => void
 * @returns {Function} Middleware function (ctx, next)
 */
export function rateLimit(options = {}) {
  const limit = options.limit || 5;
  const windowMs = parseDuration(options.window || '10s');
  const store = options.store || new MemoryRateLimitStore();
  const getKey = options.key || RateLimitKey.byUser;
  const skip = options.skip || null;

  const defaultOnLimitReached = async (ctx, { retryAfterMs }) => {
    const secs = Math.ceil(retryAfterMs / 1000);
    if (ctx.data != null && typeof ctx.answer === 'function') {
      await ctx.answer(`Too fast! Please wait ${secs}s.`, { show_alert: true });
    } else if (typeof ctx.reply === 'function') {
      await ctx.reply(`⚠️ Slow down! Please wait ${secs} second${secs > 1 ? 's' : ''} before trying again.`);
    }
  };

  const onLimitReached = options.onLimitReached || defaultOnLimitReached;

  return async function rateLimitMiddleware(ctx, next) {
    if (skip && (await skip(ctx))) {
      return next();
    }

    const key = getKey(ctx);
    if (!key) {
      // If no key could be derived, bypass
      return next();
    }

    const result = store.consume(key, limit, windowMs);
    ctx.rateLimit = {
      limit,
      remaining: result.remaining,
      resetMs: result.resetMs,
    };

    if (!result.ok) {
      await onLimitReached(ctx, {
        limit,
        windowMs,
        retryAfterMs: result.retryAfterMs,
        resetMs: result.resetMs,
      });
      return;
    }

    return next();
  };
}

/**
 * Declarative rate-limit shield middleware.
 * Deflects rapid button double-taps and spam clicks during active cooldowns with an immediate
 * alert toast (ctx.answer with show_alert: true) or reply, without executing downstream handlers.
 * 
 * @param {Object} [options={}]
 * @param {number} [options.limit=1] Max requests within window
 * @param {string|number} [options.window='1s'] Cooldown window (e.g. '1s', '2s', '500ms')
 * @param {string|Function} [options.message='Please wait a moment before trying again.'] Toast or message to show
 * @returns {Function}
 */
export function rateLimitGuard(options = {}) {
  const customMessage = options.message || 'Please wait a moment before trying again.';
  return rateLimit({
    limit: options.limit ?? 1,
    window: options.window ?? '1s',
    ...options,
    onLimitReached: async (ctx, { retryAfterMs }) => {
      const secs = Math.max(1, Math.ceil(retryAfterMs / 1000));
      const msg = typeof customMessage === 'function'
        ? customMessage(ctx, { retryAfterMs, secs })
        : customMessage;

      if (ctx.data != null && typeof ctx.answer === 'function') {
        await ctx.answer(msg, { show_alert: true });
      } else if (typeof ctx.reply === 'function') {
        await ctx.reply(msg);
      }
    },
  });
}

// --- Module: endpoint.js ---
/**
 * Gramless Mini App Endpoints & RPC Engine
 * 
 * Provides type-safe, validated RPC handlers for `tgcloud/endpoints/*.js`
 * with cryptographic user identity extraction and zero-dependency input validation.
 */


/**
 * Lightweight, zero-dependency schema validation engine.
 */
export const v = {
  string(options = {}) {
    return {
      type: 'string',
      validate(val, path) {
        if (typeof val !== 'string') {
          return [{ field: path, message: `Expected string, received ${typeof val}` }];
        }
        if (options.minLength !== undefined && val.length < options.minLength) {
          return [{ field: path, message: `Minimum length is ${options.minLength}` }];
        }
        if (options.maxLength !== undefined && val.length > options.maxLength) {
          return [{ field: path, message: `Maximum length is ${options.maxLength}` }];
        }
        if (options.pattern && !options.pattern.test(val)) {
          return [{ field: path, message: `String does not match required pattern` }];
        }
        return [];
      },
    };
  },

  number(options = {}) {
    return {
      type: 'number',
      validate(val, path) {
        if (typeof val !== 'number' || Number.isNaN(val)) {
          return [{ field: path, message: `Expected number, received ${typeof val}` }];
        }
        if (options.min !== undefined && val < options.min) {
          return [{ field: path, message: `Value must be at least ${options.min}` }];
        }
        if (options.max !== undefined && val > options.max) {
          return [{ field: path, message: `Value must be at most ${options.max}` }];
        }
        return [];
      },
    };
  },

  boolean() {
    return {
      type: 'boolean',
      validate(val, path) {
        if (typeof val !== 'boolean') {
          return [{ field: path, message: `Expected boolean, received ${typeof val}` }];
        }
        return [];
      },
    };
  },

  optional(innerValidator) {
    return {
      type: 'optional',
      validate(val, path) {
        if (val === undefined || val === null) return [];
        return innerValidator.validate(val, path);
      },
    };
  },

  array(elementValidator, options = {}) {
    return {
      type: 'array',
      validate(val, path) {
        if (!Array.isArray(val)) {
          return [{ field: path, message: `Expected array, received ${typeof val}` }];
        }
        if (options.minItems !== undefined && val.length < options.minItems) {
          return [{ field: path, message: `Minimum ${options.minItems} items required` }];
        }
        const issues = [];
        for (let i = 0; i < val.length; i++) {
          issues.push(...elementValidator.validate(val[i], `${path}[${i}]`));
        }
        return issues;
      },
    };
  },

  object(shape) {
    return {
      type: 'object',
      validate(val, path = '') {
        if (!val || typeof val !== 'object' || Array.isArray(val)) {
          return [{ field: path || 'root', message: `Expected object, received ${typeof val}` }];
        }
        const issues = [];
        for (const key of Object.keys(shape)) {
          const fieldPath = path ? `${path}.${key}` : key;
          const validator = shape[key];
          const fieldValue = val[key];
          issues.push(...validator.validate(fieldValue, fieldPath));
        }
        return issues;
      },
    };
  },
};

/**
 * Wraps an endpoint function with validation, auth checks, and standardized error responses.
 * 
 * @param {Object} config
 * @param {boolean} [config.requireAuth=true] Requires valid Telegram user in ctx.initData
 * @param {any} [config.schema] Input validation schema created with `v.object()`
 * @param {Function} handler The business logic: async (ctx) => result
 * @returns {Function} Standard TGCloud endpoint export: async (input, ctx) => response
 */
export function createEndpoint(config, handler) {
  // If only handler passed
  if (typeof config === 'function') {
    handler = config;
    config = {};
  }

  const requireAuth = config.requireAuth !== false; // default true
  const schema = config.schema || null;

  return async function endpointHandler(input = {}, ctx = {}) {
    try {
      // 1. Identity & Auth verification
      const user = ctx.initData?.user || null;
      if (requireAuth && !user) {
        return {
          ok: false,
          error: 'UNAUTHORIZED',
          message: 'Valid Telegram user credentials (initData) required',
        };
      }

      // 2. Input validation
      if (schema) {
        const issues = schema.validate(input);
        if (issues.length > 0) {
          return {
            ok: false,
            error: 'VALIDATION_ERROR',
            message: 'Invalid request payload',
            issues,
          };
        }
      }

      // 3. Prepare augmented endpoint context
      const endpointCtx = {
        input,
        user,
        initData: ctx.initData || {},
        rawCtx: ctx,
      };

      // 4. Execute handler
      const result = await handler(endpointCtx);

      // 5. Wrap response if not already enveloped
      if (result && typeof result === 'object' && ('ok' in result)) {
        return result;
      }
      return { ok: true, data: result };
    } catch (err) {
      if (err instanceof ValidationError) {
        return {
          ok: false,
          error: 'VALIDATION_ERROR',
          message: err.message,
          issues: err.issues,
        };
      }

      // Hide raw internal error messages from client by default
      return {
        ok: false,
        error: 'INTERNAL_ERROR',
        message: config.exposeErrors === true
          ? (err.message || 'Internal server error')
          : 'An unexpected internal error occurred',
      };
    }
  };
}

// --- Module: session.js ---
/**
 * Gramless Transactional Session Engine
 * 
 * Provides atomic, isolated state persistence backed by SQLite (sdk/db) or In-Memory storage.
 * Enforces transactional rollback: changes to `ctx.session` commit ONLY if the handler
 * resolves successfully; any uncaught throw or API error aborts and rolls back changes.
 */


/**
 * Standard key resolvers.
 * Safely handles numeric ID 0.
 */
export const SessionKey = {
  byUser: (ctx) => (ctx.userId !== null && ctx.userId !== undefined ? `user:${ctx.userId}` : null),
  byChat: (ctx) => (ctx.chatId !== null && ctx.chatId !== undefined ? `chat:${ctx.chatId}` : null),
  byChatUser: (ctx) => (
    ctx.chatId !== null && ctx.chatId !== undefined &&
    ctx.userId !== null && ctx.userId !== undefined
      ? `chat_user:${ctx.chatId}:${ctx.userId}`
      : null
  ),
};

/**
 * Safe deep clone helper with structuredClone and JSON fallback.
 * Preserves Date, Set, Map, and BigInt when structuredClone is available.
 * @param {any} data
 * @returns {any}
 */
export function safeClone(data) {
  if (data === undefined || data === null) return data;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(data);
    } catch {
      // Fallback for non-cloneable objects
    }
  }
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

/**
 * In-memory session store for local development, testing, and ephemeral states.
 */
export class MemorySessionStore {
  constructor() {
    /** @type {Map<string, { data: any, updatedAt: number, version: number }>} */
    this.storage = new Map();
  }

  async get(key) {
    const entry = this.storage.get(key);
    if (!entry) return null;
    return safeClone(entry.data);
  }

  async set(key, data, options = {}) {
    const prev = this.storage.get(key);
    if (options.expectedVersion !== undefined && prev && prev.version !== options.expectedVersion) {
      throw new SessionConflictError(`Concurrent modification detected for session key ${key}`);
    }
    this.storage.set(key, {
      data: safeClone(data),
      updatedAt: Date.now(),
      version: (prev?.version || 0) + 1,
    });
  }

  async delete(key) {
    this.storage.delete(key);
  }

  async clear() {
    this.storage.clear();
  }
}

/**
 * TGCloud SQLite session store adapter backed by `sdk/db`.
 */
export class TgCloudSessionStore {
  /**
   * @param {Object} options
   * @param {any} options.db The db client from `import { db } from 'sdk'`
   * @param {any} options.table The table declaration from `schema.js`
   * @param {any} options.eq The `eq` operator from `sdk/db`
   * @param {any} [options.and] Optional `and` operator from `sdk/db`
   */
  constructor({ db, table, eq, and }) {
    this.db = db;
    this.table = table;
    this.eq = eq;
    this.and = and;
  }

  async get(key) {
    try {
      const row = await this.db
        .select()
        .from(this.table)
        .where(this.eq(this.table.id, key))
        .get();

      if (!row) return null;
      return row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null;
    } catch (err) {
      throw new SessionError(`Failed to read session for key ${key}: ${err.message}`, { cause: err });
    }
  }

  async set(key, data, options = {}) {
    try {
      // Optimistic concurrency check when schema includes version
      if (options.expectedVersion !== undefined && this.table.version && this.and) {
        const result = await this.db
          .update(this.table)
          .set({
            data: typeof data === 'object' ? JSON.stringify(data) : data,
            version: options.expectedVersion + 1,
          })
          .where(this.and(this.eq(this.table.id, key), this.eq(this.table.version, options.expectedVersion)))
          .run();

        if (result && result.changes === 0) {
          throw new SessionConflictError(`Concurrent modification detected for session key ${key}`);
        }
        return;
      }

      await this.db
        .insert(this.table)
        .values({
          id: key,
          data: typeof data === 'object' ? JSON.stringify(data) : data,
        })
        .onConflictDoUpdate({
          target: this.table.id,
          set: {
            data: typeof data === 'object' ? JSON.stringify(data) : data,
          },
        })
        .run();
    } catch (err) {
      if (err instanceof SessionError) throw err;
      throw new SessionError(`Failed to persist session for key ${key}: ${err.message}`, { cause: err });
    }
  }

  async delete(key) {
    try {
      await this.db
        .delete(this.table)
        .where(this.eq(this.table.id, key))
        .run();
    } catch (err) {
      throw new SessionError(`Failed to delete session for key ${key}: ${err.message}`, { cause: err });
    }
  }
}

/**
 * In-process Keyed Mutex
 * Ensures concurrent operations for the same session key (e.g. rapid double-taps)
 * are executed sequentially to prevent lost read-modify-write race conditions.
 */
export class KeyedMutex {
  constructor() {
    /** @type {Map<string, Promise<void>>} */
    this.queues = new Map();
  }

  /**
   * Acquires the lock for a given key, runs the callback, and releases the lock.
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async acquire(key, fn) {
    const prevPromise = this.queues.get(key) || Promise.resolve();

    let release;
    const currentPromise = new Promise((resolve) => {
      release = resolve;
    });

    const chainedPromise = prevPromise.then(() => currentPromise, () => currentPromise);
    this.queues.set(key, chainedPromise);

    try {
      await prevPromise;
      return await fn();
    } finally {
      release();
      if (this.queues.get(key) === chainedPromise) {
        this.queues.delete(key);
      }
    }
  }
}

/**
 * Creates a transactional session middleware.
 * 
 * @param {Object} options
 * @param {MemorySessionStore|TgCloudSessionStore} [options.store]
 * @param {Function} [options.getKey] Defaults to SessionKey.byChatUser
 * @param {Function} [options.initial] Initial state factory function
 * @returns {Function} Middleware function (ctx, next)
 */
export function session(options = {}) {
  const store = options.store || new MemorySessionStore();
  const getKey = options.getKey || SessionKey.byChatUser;
  const initial = options.initial || (() => ({}));
  const mutex = new KeyedMutex();

  return async function sessionMiddleware(ctx, next) {
    const key = getKey(ctx);
    if (!key) {
      // If no key can be resolved (e.g. system update with no user/chat), skip session
      return next();
    }

    return mutex.acquire(key, async () => {
      // 1. Fetch current committed state
      const savedData = await store.get(key);
      let originalSnapshot = safeClone(savedData);

      // 2. Working copy for handler execution
      let workingCopy = savedData !== null ? safeClone(savedData) : initial();
      ctx.session = workingCopy;

      // Expose explicit mid-execution checkpointing to persist progress before isolate timeouts
      ctx.saveSession = async () => {
        if (ctx.session === null) {
          await store.delete(key);
        } else {
          await store.set(key, ctx.session);
          originalSnapshot = safeClone(ctx.session);
        }
      };

      ctx.checkpoint = async (updates) => {
        if (updates && typeof updates === 'object') {
          Object.assign(ctx.session, updates);
        }
        await ctx.saveSession();
        return ctx.session;
      };

      try {
        // 3. Execute downstream handlers
        await next();

        // 4. On handler SUCCESS: Commit changes
        if (ctx.session === null) {
          // Explicitly cleared session
          await store.delete(key);
        } else {
          const originalSnapshotStr = JSON.stringify(originalSnapshot);
          const currentSnapshotStr = JSON.stringify(ctx.session);
          // Only write to store if state actually changed
          if (currentSnapshotStr !== originalSnapshotStr) {
            await store.set(key, ctx.session);
          }
        }
      } catch (err) {
        // 5. On handler ERROR / PANIC: Automatic Rollback!
        ctx.session = originalSnapshot !== null ? safeClone(originalSnapshot) : initial();
        throw err;
      }
    });
  };
}

// --- Module: context.js ---
/**
 * Gramless Context Engine (Comprehensive Bot API Surface)
 * 
 * Provides an allocation-minimized, ergonomic facade around incoming Telegram
 * updates, unwrapped payloads, keyboard builders, and the complete Telegram Bot API.
 */


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

// --- Module: batch.js ---
/**
 * Gramless Batch & Continuation Workflow Engine
 * 
 * Provides interactive, multi-pass batch job processing designed for V8 isolates
 * with hard execution deadlines (e.g. 10.4s in TGCloud) and egress sandbox loopback firewalls.
 * Automatically slices workloads into safe chunks, tracks session cursors,
 * monitors isolate clock budgets, and renders seamless interactive continuation UI.
 */


export class BatchJob {
  /**
   * @param {Object} options
   * @param {string} options.name Unique identifier for this batch job
   * @param {number} [options.chunkSize=10] Maximum items to process per single isolate pass
   * @param {number} [options.timeBudgetMs=8000] Maximum wall-clock time in ms per isolate pass
   * @param {Function} options.processItem Process single item: async (item, ctx, state) => any
   * @param {Function} [options.onProgress] Called when a pass finishes and pauses: async (info, ctx) => void
   * @param {Function} [options.onComplete] Called when all items finish: async (summary, ctx) => void
   * @param {string} [options.actionPrefix] Callback data prefix (defaults to 'batch:<name>:')
   * @param {string} [options.sessionKey] Key inside ctx.session (defaults to '_batch_<name>')
   */
  constructor(options = {}) {
    if (!options.name) {
      throw new Error('BatchJob requires a unique "name" property');
    }
    if (typeof options.processItem !== 'function') {
      throw new Error('BatchJob requires a "processItem" function');
    }

    this.name = options.name;
    this.chunkSize = options.chunkSize || 10;
    this.timeBudgetMs = options.timeBudgetMs || 8000;
    this.processItem = options.processItem;
    this.onProgress = options.onProgress || null;
    this.onComplete = options.onComplete || null;
    this.actionPrefix = options.actionPrefix || `batch:${this.name}:`;
    this.sessionKey = options.sessionKey || `_batch_${this.name}`;
  }

  /**
   * Generates inline keyboard markup with a continuation button for resuming the batch.
   * 
   * @param {number} cursor Current item index
   * @param {number} total Total number of items
   * @param {Object} [options={}]
   * @param {string} [options.label] Custom button label
   * @returns {Record<string, any>} InlineKeyboardMarkup
   */
  createContinuationMarkup(cursor, total, options = {}) {
    const label = options.label || `Continue (${cursor}/${total}) ▶️`;
    const callbackData = `${this.actionPrefix}${cursor}`;
    return buildInlineKeyboard([
      [{ text: label, data: callbackData }],
    ]);
  }

  /**
   * Executes a batch run for the provided items list within the current isolate's time budget.
   * If time or chunk limit is reached before finishing, saves state and renders continuation UI.
   * 
   * @param {Array<any>} items Complete array of items to process
   * @param {Record<string, any>} ctx Gramless context
   * @param {number} [initialCursor] Starting cursor index
   * @returns {Promise<{ completed: boolean, cursor: number, total: number, state: Record<string, any> }>}
   */
  async run(items, ctx, initialCursor = null) {
    if (!Array.isArray(items)) {
      throw new TypeError('BatchJob.run expects an array of items');
    }

    const total = items.length;
    const sessionStore = ctx.session ? (ctx.session[this.sessionKey] || {}) : {};
    let cursor = initialCursor !== null ? initialCursor : (sessionStore.cursor || 0);
    const state = sessionStore.state || {};
    const startCursor = cursor;
    const startTime = Date.now();

    while (cursor < total) {
      // Clock & budget check: ensure at least 1500ms remain for state commit & network reply
      const remainingTime = typeof ctx.remainingMs === 'function'
        ? ctx.remainingMs()
        : Math.max(0, this.timeBudgetMs - (Date.now() - startTime));

      const isTimeExhausted = remainingTime < 1500;
      const isChunkExhausted = (cursor - startCursor) >= this.chunkSize;

      if ((isTimeExhausted || isChunkExhausted) && cursor > startCursor) {
        // Pause batch pass: save progress
        if (ctx.session) {
          ctx.session[this.sessionKey] = {
            cursor,
            total,
            state,
            updatedAt: Date.now(),
          };
          if (typeof ctx.checkpoint === 'function') {
            await ctx.checkpoint();
          }
        }

        const progressInfo = {
          job: this.name,
          cursor,
          total,
          processedThisPass: cursor - startCursor,
          completed: false,
          state,
          continuationMarkup: this.createContinuationMarkup(cursor, total),
        };

        if (this.onProgress) {
          await this.onProgress(progressInfo, ctx);
        } else if (typeof ctx.reply === 'function') {
          await ctx.reply(
            `⏳ <b>Batch in progress:</b> ${cursor}/${total} completed.\nTap below to continue:`,
            {
              parse_mode: 'HTML',
              reply_markup: progressInfo.continuationMarkup,
            }
          );
        }

        return { completed: false, cursor, total, state };
      }

      // Process current item
      await this.processItem(items[cursor], ctx, state);
      cursor++;

      // Periodic session checkpointing if available
      if (ctx.session && typeof ctx.checkpoint === 'function' && cursor % 5 === 0) {
        ctx.session[this.sessionKey] = { cursor, total, state, updatedAt: Date.now() };
        await ctx.checkpoint();
      }
    }

    // All items completed
    if (ctx.session && ctx.session[this.sessionKey]) {
      delete ctx.session[this.sessionKey];
      if (typeof ctx.checkpoint === 'function') {
        await ctx.checkpoint();
      }
    }

    const summary = {
      job: this.name,
      cursor: total,
      total,
      processedThisPass: cursor - startCursor,
      completed: true,
      state,
    };

    if (this.onComplete) {
      await this.onComplete(summary, ctx);
    }

    return summary;
  }

  /**
   * Action handler middleware that listens for continuation button taps,
   * retrieves the saved cursor, answers the button tap, and resumes execution.
   * 
   * @param {Function} [itemsResolver] Function returning the items array: async (ctx) => any[]
   * @returns {Function} Handler function (ctx) => Promise<any>
   */
  middleware(itemsResolver = null) {
    return async (ctx) => {
      if (ctx.answer && typeof ctx.answer === 'function') {
        await ctx.answer('Resuming batch processing...');
      }

      let cursor = null;
      if (ctx.match && ctx.match[1]) {
        const parsed = parseInt(ctx.match[1], 10);
        if (!Number.isNaN(parsed)) cursor = parsed;
      }

      let items = [];
      if (typeof itemsResolver === 'function') {
        items = await itemsResolver(ctx);
      } else if (ctx.session && ctx.session[this.sessionKey]?.items) {
        items = ctx.session[this.sessionKey].items;
      }

      return this.run(items, ctx, cursor);
    };
  }
}

/**
 * Creates a new BatchJob instance.
 * 
 * @param {Object} options
 * @returns {BatchJob}
 */
export function createBatchJob(options) {
  return new BatchJob(options);
}

// --- Module: router.js ---
/**
 * Gramless Router & Dispatch Engine
 * 
 * Provides constant-time $O(1)$ command and callback dispatch, length-partitioned
 * prefix routing, and pre-compiled middleware pipelines.
 */





/**
 * Creates a zero-dependency Telegram Bot API client using standard globalThis.fetch.
 * @param {string} token
 * @returns {{ call: (method: string, params?: Record<string, any>) => Promise<any> }}
 */
export function createDefaultApiClient(token) {
  return {
    call: async (method, params = {}, options = {}) => {
      const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      };
      if (options.signal) {
        fetchOptions.signal = options.signal;
      }
      const res = await globalThis.fetch(`https://api.telegram.org/bot${token}/${method}`, fetchOptions);
      const data = await res.json();
      if (!data.ok) {
        throw new ApiError(data.description || 'Telegram API Error', data.error_code, data.parameters);
      }
      return data.result;
    },
  };
}

/**
 * Composes an array of middleware functions into a single executable pipeline.
 * Evaluated once during route registration / compilation, eliminating per-update allocations.
 * 
 * @param {Array<Function>} middlewares
 * @param {Function} targetHandler
 * @returns {Function}
 */
export function composeMiddleware(middlewares, targetHandler) {
  if (middlewares.length === 0) return targetHandler;

  return function (ctx) {
    let index = -1;

    function dispatch(i) {
      if (i <= index) {
        return Promise.reject(new RoutingError('next() called multiple times in middleware'));
      }
      index = i;
      const fn = i < middlewares.length ? middlewares[i] : targetHandler;
      if (!fn) return Promise.resolve();

      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}

/**
 * Extracts command name, target bot username, and arguments from message text.
 * Handles /command, /command@bot_name, and multiline or tabbed trailing arguments.
 * 
 * @param {string} text
 * @param {string|null} [botUsername=null]
 * @returns {{ command: string, targetBot: string|null, payload: string, args: string[] } | null}
 */
export function parseCommand(text, botUsername = null) {
  if (!text || text.charCodeAt(0) !== 47 /* '/' */) return null;

  const match = text.match(/^\/([a-zA-Z0-9_]+)(?:@([a-zA-Z0-9_]+))?(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  const rawCommand = match[1].toLowerCase();
  const targetBot = match[2] ? match[2].toLowerCase() : null;
  const payload = match[3] ? match[3].trim() : '';

  // If command is addressed to a different bot in a group chat, ignore it
  if (targetBot && botUsername && targetBot !== botUsername.toLowerCase()) {
    return null;
  }

  const args = payload.length > 0 ? payload.split(/\s+/) : [];

  return {
    command: rawCommand,
    targetBot,
    payload,
    args,
  };
}

export class GramlessRouter {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.filter] Guard filter for this entire router or sub-group
   * @param {string} [options.token] Bot API token (automatically creates zero-dependency fetch API client)
   * @param {string} [options.botToken] Alias for options.token
   * @param {Record<string, any>} [options.api] Optional custom API client injection
   * @param {Function} [options.onError] Global error handler hook
   */
  constructor(options = {}) {
    this.filter = options.filter || null;
    this.onError = options.onError || null;
    this.username = (options.username || options.botUsername || '').replace(/^@/, '');
    this.token = options.token || options.botToken || null;
    this.api = options.api || (this.token ? createDefaultApiClient(this.token) : null);
    this.db = options.db || null;
    this.executionTimeoutMs = options.executionTimeoutMs ?? 9500;

    /** @type {Array<Function>} */
    this.middlewares = [];

    /** @type {Map<string, Function>} Exact command registry: Map<commandName, compiledPipeline> */
    this.commands = new Map();

    /** @type {Map<string, Function>} Exact callback_query data registry: Map<exactData, compiledPipeline> */
    this.exactCallbacks = new Map();

    /** @type {Array<{ prefix: string, handler: Function }>} Length-ordered callback prefix routes */
    this.prefixCallbacks = [];

    /** @type {Array<{ pattern: RegExp, handler: Function }>} Regex callback routes */
    this.regexCallbacks = [];

    /** @type {Map<string, Function>} Exact widget query data registry (Bot API 10.4) */
    this.exactWidgetQueries = new Map();

    /** @type {Array<{ prefix: string, handler: Function }>} Length-ordered widget query prefix routes */
    this.prefixWidgetQueries = [];

    /** @type {Array<{ pattern: RegExp, handler: Function }>} Regex widget query routes */
    this.regexWidgetQueries = [];

    /** @type {Array<Function>} General widget query handlers */
    this.widgetHandlers = [];

    /** @type {Array<{ pattern: RegExp|string, handler: Function }>} Hears text routes */
    this.hearsRoutes = [];

    /** @type {Map<string, Array<Function>>} Event type routes ('message', 'photo', etc.) */
    this.eventRoutes = new Map();

    /** @type {Array<{ filter: Function, handler: Function }>} Composable filter predicate routes */
    this.predicateRoutes = [];

    /** @type {Array<GramlessRouter>} Child sub-routers / groups */
    this.subRouters = [];

    /** @type {Function|null} Fallback handler when no route matches */
    this.fallbackHandler = null;

    /** @private */
    this._isCompiled = false;
  }

  /**
   * Attaches one or more middleware functions.
   * @param {...Function} fns
   * @returns {this}
   */
  use(...fns) {
    this.middlewares.push(...fns.flat());
    this._compiledPipeline = null;
    return this;
  }

  /**
   * Registers a command handler (e.g. 'start', ['help', 'settings']).
   * @param {string|string[]} names
   * @param {...Function} handlers
   * @returns {this}
   */
  command(names, ...handlers) {
    const list = Array.isArray(names) ? names : [names];
    const pipeline = this._compileRoute(handlers);

    for (const name of list) {
      const cleanName = name.replace(/^\//, '').toLowerCase();
      this.commands.set(cleanName, pipeline);
    }
    return this;
  }

  /**
   * Registers a callback query button press handler.
   * Supports exact strings, wildcard prefixes (e.g. 'order:*'), or RegExp.
   * 
   * @param {string|RegExp} trigger
   * @param {...Function} handlers
   * @returns {this}
   */
  action(trigger, ...handlers) {
    const pipeline = this._compileRoute(handlers);

    if (trigger instanceof RegExp) {
      this.regexCallbacks.push({ pattern: trigger, handler: pipeline });
    } else if (typeof trigger === 'string') {
      if (trigger.endsWith('*') || trigger.endsWith(':')) {
        const prefix = trigger.replace(/\*$/, '');
        this.prefixCallbacks.push({ prefix, handler: pipeline });
        // Keep sorted by prefix length descending (longest prefix matches first)
        this.prefixCallbacks.sort((a, b) => b.prefix.length - a.prefix.length);
      } else {
        this.exactCallbacks.set(trigger, pipeline);
      }
    }
    return this;
  }

  /**
   * Alias for action(): Registers a handler for callback query data.
   * @param {string|RegExp} trigger
   * @param {...Function} handlers
   * @returns {this}
   */
  callback(trigger, ...handlers) {
    return this.action(trigger, ...handlers);
  }

  /**
   * Registers a widget query handler (Bot API 10.4).
   * Handles incoming queries from HTML widgets and shared widgets.
   * Supports exact data strings, wildcard prefixes (e.g. 'vote:*'), RegExp, or catch-all.
   * 
   * @param {string|RegExp|Function} [trigger]
   * @param {...Function} handlers
   * @returns {this}
   */
  widgetQuery(trigger, ...handlers) {
    if (typeof trigger === 'function') {
      const pipeline = this._compileRoute([trigger, ...handlers]);
      this.widgetHandlers.push(pipeline);
      return this;
    }

    const pipeline = this._compileRoute(handlers);
    if (trigger instanceof RegExp) {
      this.regexWidgetQueries.push({ pattern: trigger, handler: pipeline });
    } else if (typeof trigger === 'string') {
      if (trigger.endsWith('*') || trigger.endsWith(':')) {
        const prefix = trigger.replace(/\*$/, '');
        this.prefixWidgetQueries.push({ prefix, handler: pipeline });
        this.prefixWidgetQueries.sort((a, b) => b.prefix.length - a.prefix.length);
      } else {
        this.exactWidgetQueries.set(trigger, pipeline);
      }
    } else {
      this.widgetHandlers.push(pipeline);
    }
    return this;
  }

  /**
   * Alias for widgetQuery() (Bot API 10.4).
   * @param {string|RegExp|Function} [trigger]
   * @param {...Function} handlers
   * @returns {this}
   */
  widget(trigger, ...handlers) {
    return this.widgetQuery(trigger, ...handlers);
  }

  /**
   * Matches message text or caption against a string or RegExp pattern.
   * @param {string|RegExp} pattern
   * @param {...Function} handlers
   * @returns {this}
   */
  hears(pattern, ...handlers) {
    const pipeline = this._compileRoute(handlers);
    this.hearsRoutes.push({ pattern, handler: pipeline });
    return this;
  }

  /**
   * Matches by update event kind ('message', 'photo', etc.) or functional filter predicate.
   * @param {string|Function} trigger
   * @param {...Function} handlers
   * @returns {this}
   */
  on(trigger, ...handlers) {
    const pipeline = this._compileRoute(handlers);
    if (typeof trigger === 'function') {
      this.predicateRoutes.push({ filter: trigger, handler: pipeline });
    } else {
      let list = this.eventRoutes.get(trigger);
      if (!list) {
        list = [];
        this.eventRoutes.set(trigger, list);
      }
      list.push(pipeline);
    }
    return this;
  }

  /**
   * Creates a sub-router/group protected by an optional filter predicate.
   * Sub-routers inherit parent middleware.
   * 
   * @param {Function} [filter]
   * @returns {GramlessRouter}
   */
  group(filter) {
    const child = new GramlessRouter({
      filter,
      api: this.api,
      onError: this.onError,
      username: this.username,
    });
    this.subRouters.push(child);
    return child;
  }

  /**
   * Registers a fallback handler when no other registered routes match.
   * @param {...Function} handlers
   * @returns {this}
   */
  fallback(...handlers) {
    this.fallbackHandler = this._compileRoute(handlers);
    return this;
  }

  /**
   * Compiles handlers for a specific route.
   * @private
   */
  _compileRoute(handlers) {
    if (handlers.length === 1) return handlers[0];
    return composeMiddleware(handlers.slice(0, -1), handlers[handlers.length - 1]);
  }

  /**
   * Pre-compiles the middleware and router execution pipeline ahead of time.
   * Eliminates pipeline compilation overhead during request dispatch.
   * @returns {this}
   */
  compile() {
    this._compiledPipeline = composeMiddleware(this.middlewares, async (c) => {
      const handled = await this._dispatch(c);
      if (handled) return true;

      // Check sub-routers
      for (const sub of this.subRouters) {
        const subHandled = await sub.handle(c, c.platform, c.api);
        if (subHandled) return true;
      }

      // Fallback
      if (this.fallbackHandler) {
        await this.fallbackHandler(c);
        return true;
      }

      return false;
    });
    this._isCompiled = true;
    for (const sub of this.subRouters) {
      sub.compile();
    }
    return this;
  }

  /**
   * Core dispatch: Routes an incoming update payload to matching handler.
   * 
   * @param {Record<string, any>} input Unwrapped Telegram payload
   * @param {Record<string, any>} [ctx={}] Platform execution context
   * @param {Record<string, any>} [api] API client override
   * @returns {Promise<any>}
   */
  async handle(input, ctx = {}, api = null) {
    const effectiveApi = api || this.api;
    const effectiveCtx = {
      ...ctx,
      db: this.db || ctx.db,
      executionTimeoutMs: ctx.executionTimeoutMs ?? this.executionTimeoutMs,
    };
    const context = input instanceof GramlessContext
      ? input
      : new GramlessContext(input, effectiveCtx, effectiveApi);

    // If an outer filter predicate exists on this router and rejects, exit
    if (this.filter && !(await this.filter(context))) {
      return false;
    }

    if (!this._compiledPipeline) {
      this.compile();
    }

    try {
      return await this._compiledPipeline(context);
    } catch (err) {
      const panic = err instanceof Error ? err : new PanicError(err);
      if (typeof this.onError === 'function') {
        await this.onError(panic, context);
        return true;
      }
      throw panic;
    }
  }

  /**
   * Internal fast-path dispatcher.
   * @private
   */
  async _dispatch(ctx) {
    const text = ctx.text;
    const data = ctx.data;

    // 1. Exact Commands ($O(1) Map lookup)
    if (text && text.charCodeAt(0) === 47 /* '/' */) {
      const parsed = parseCommand(text, this.username);
      if (parsed) {
        const cmdHandler = this.commands.get(parsed.command);
        if (cmdHandler) {
          ctx.match = [text, parsed.payload];
          ctx.command = parsed.command;
          ctx.payload = parsed.payload;
          ctx.args = parsed.args;
          await cmdHandler(ctx);
          return true;
        }
      }
    }

    // 2. Callback Queries
    if (data !== null) {
      // 2a. Exact callback match ($O(1) Map lookup)
      const exactHandler = this.exactCallbacks.get(data);
      if (exactHandler) {
        await exactHandler(ctx);
        return true;
      }

      // 2b. Length-ordered prefix matching
      for (let i = 0; i < this.prefixCallbacks.length; i++) {
        const { prefix, handler } = this.prefixCallbacks[i];
        if (data.startsWith(prefix)) {
          ctx.match = [data, data.slice(prefix.length)];
          await handler(ctx);
          return true;
        }
      }

      // 2c. Regex callback matching
      for (let i = 0; i < this.regexCallbacks.length; i++) {
        const { pattern, handler } = this.regexCallbacks[i];
        const match = data.match(pattern);
        if (match) {
          ctx.match = match;
          await handler(ctx);
          return true;
        }
      }
    }

    // 3. Widget Queries (Bot API 10.4)
    if (ctx.widgetQuery || ctx.sharedWidgetQuery) {
      const widgetData = ctx.widgetQuery?.data || ctx.sharedWidgetQuery?.data || '';

      // 3a. Exact widget query match ($O(1) Map lookup)
      const exactWidgetHandler = this.exactWidgetQueries.get(widgetData);
      if (exactWidgetHandler) {
        ctx.match = [widgetData];
        await exactWidgetHandler(ctx);
        return true;
      }

      // 3b. Length-ordered widget query prefix matching
      for (let i = 0; i < this.prefixWidgetQueries.length; i++) {
        const { prefix, handler } = this.prefixWidgetQueries[i];
        if (widgetData.startsWith(prefix)) {
          ctx.match = [widgetData, widgetData.slice(prefix.length)];
          await handler(ctx);
          return true;
        }
      }

      // 3c. Regex widget query matching
      for (let i = 0; i < this.regexWidgetQueries.length; i++) {
        const { pattern, handler } = this.regexWidgetQueries[i];
        const match = widgetData.match(pattern);
        if (match) {
          ctx.match = match;
          await handler(ctx);
          return true;
        }
      }

      // 3d. General widget query catch-all handlers
      for (let i = 0; i < this.widgetHandlers.length; i++) {
        ctx.match = [widgetData];
        await this.widgetHandlers[i](ctx);
        return true;
      }
    }

    // 4. Hears (Text pattern matching)
    if (text) {
      for (let i = 0; i < this.hearsRoutes.length; i++) {
        const { pattern, handler } = this.hearsRoutes[i];
        if (typeof pattern === 'string' && text.includes(pattern)) {
          ctx.match = [text];
          await handler(ctx);
          return true;
        } else if (pattern instanceof RegExp) {
          const match = text.match(pattern);
          if (match) {
            ctx.match = match;
            await handler(ctx);
            return true;
          }
        }
      }
    }

    // 5. Composable Predicate Routes (Filter.all, etc.)
    for (let i = 0; i < this.predicateRoutes.length; i++) {
      const { filter, handler } = this.predicateRoutes[i];
      if (await filter(ctx)) {
        await handler(ctx);
        return true;
      }
    }

    // 6. Update Event Type matching (hierarchical: specific -> general, e.g. 'text' -> 'message')
    const eventTypes = this._resolveEventTypes(ctx);
    for (const eventType of eventTypes) {
      const handlers = this.eventRoutes.get(eventType);
      if (handlers && handlers.length > 0) {
        for (const handler of handlers) {
          await handler(ctx);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Resolves hierarchical candidate event types from the context (ordered specific to general).
   * @param {GramlessContext} ctx
   * @returns {string[]}
   * @private
   */
  _resolveEventTypes(ctx) {
    const types = [];
    const isMessage = Boolean(
      ctx.raw?.chat ||
      ctx.update?.message ||
      ctx.update?.channel_post ||
      ctx.update?.edited_message ||
      ctx.update?.edited_channel_post
    );

    if (ctx.widgetQuery || ctx.update?.widget_query || ctx.raw?.widget_query) types.push('widget_query');
    if (ctx.sharedWidgetQuery || ctx.update?.shared_widget_query || ctx.raw?.shared_widget_query) types.push('shared_widget_query');
    if (ctx.raw?.widget || ctx.message?.widget) types.push('widget');
    if (ctx.raw?.ton_wallet_transfer || ctx.message?.ton_wallet_transfer) types.push('ton_wallet_transfer');
    if (ctx.raw?.paid_messages_waived || ctx.message?.paid_messages_waived) types.push('paid_messages_waived');

    if (ctx.raw?.data !== undefined || ctx.update?.callback_query) types.push('callback_query');
    if (ctx.raw?.query !== undefined || ctx.update?.inline_query) types.push('inline_query');
    if (ctx.raw?.result_id !== undefined || ctx.update?.chosen_inline_result) types.push('chosen_inline_result');
    if (ctx.raw?.shipping_address || ctx.update?.shipping_query) types.push('shipping_query');
    if (ctx.raw?.total_amount !== undefined || ctx.update?.pre_checkout_query) types.push('pre_checkout_query');
    if (ctx.raw?.poll_id !== undefined || ctx.update?.poll_answer) types.push('poll_answer');
    if ((ctx.raw?.options && ctx.raw?.question) || ctx.update?.poll) types.push('poll');
    if (ctx.update?.my_chat_member || (ctx.raw?.new_chat_member && ctx.raw?.old_chat_member)) types.push('my_chat_member');
    if (ctx.update?.chat_member) types.push('chat_member');
    if (ctx.update?.chat_join_request || ctx.raw?.invite_link) types.push('chat_join_request');
    if (ctx.update?.guest_message) types.push('guest_message');
    if (ctx.update?.subscription) types.push('subscription');
    if (ctx.update?.stopped_message_generation) types.push('stopped_message_generation');

    if (ctx.update?.channel_post) types.push('channel_post');
    if (ctx.update?.edited_message) types.push('edited_message');

    if (ctx.raw?.rich_message) types.push('rich_message');
    if (ctx.raw?.live_photo) types.push('live_photo');
    if (ctx.raw?.photo) types.push('photo');
    if (ctx.raw?.document) types.push('document');
    if (ctx.raw?.voice) types.push('voice');
    if (ctx.raw?.audio) types.push('audio');
    if (ctx.raw?.video) types.push('video');
    if (ctx.raw?.video_note) types.push('video_note');
    if (ctx.raw?.sticker) types.push('sticker');
    if (ctx.raw?.animation) types.push('animation');
    if (ctx.raw?.location) types.push('location');
    if (ctx.raw?.contact) types.push('contact');
    if (ctx.raw?.dice) types.push('dice');
    if (ctx.raw?.text) types.push('text');

    // General 'message' catch-all for any message-family update
    if (isMessage && !types.includes('message')) {
      types.push('message');
    }

    return types;
  }

  /**
   * Determines primary event type name from the context.
   * @private
   */
  _resolveEventType(ctx) {
    const types = this._resolveEventTypes(ctx);
    return types.length > 0 ? types[0] : null;
  }

  /**
   * Generates a standard Telegram Serverless default export handler.
   * Usage in tgcloud/handlers/message.js:
   *   export default bot.handler();
   * 
   * @param {Object} [options={}]
   * @param {any} [options.api] Optional pre-configured API client override
   * @param {any} [options.db] Optional pre-configured database client override
   * @param {number} [options.executionTimeoutMs] Optional execution budget override
   * @returns {Function}
   */
  handler(options = {}) {
    if (options.api) this.api = options.api;
    if (options.db) this.db = options.db;
    if (options.executionTimeoutMs) this.executionTimeoutMs = options.executionTimeoutMs;

    return async (input, ctx = {}) => {
      // If running inside TGCloud and no custom API client is set, lazy-import 'sdk'
      if (!this.api) {
        try {
          // Dynamic import of the virtual module in TGCloud
          const sdk = await import('sdk');
          this.api = sdk.api;
          if (sdk.db && !this.db) {
            this.db = sdk.db;
          }
        } catch {
          // Non-cloud test environment; API can be injected per call
        }
      }
      return this.handle(input, ctx, this.api);
    };
  }

  /**
   * Universal Web Standards (WinterCG) fetch adapter for Cloudflare Workers,
   * Deno Deploy, Bun, Next.js Edge, Fastly, and native Request/Response runtimes.
   * 
   * Features:
   * - Timing-safe constant-time secret token verification (`X-Telegram-Bot-Api-Secret-Token`)
   * - Webhook Reply Acceleration: Intercepts the first outbound reply and returns it directly
   *   in the HTTP 200 response JSON, eliminating 100% of outbound roundtrip latency.
   * 
   * Usage:
   *   export default { fetch: bot.fetch({ secretToken: 'secret', webhookReply: true }) };
   * 
   * @param {Object} [options={}]
   * @param {string} [options.secretToken] Secret token to verify
   * @param {boolean} [options.webhookReply=false] Enable zero-roundtrip webhook reply
   * @param {Function} [options.onError] Custom HTTP error handler override
   * @returns {(request: any, env?: any, ctx?: any) => Promise<any>}
   */
  fetch(options = {}) {
    this.compile();
    const secretToken = options.secretToken || null;
    const enableWebhookReply = options.webhookReply === true;

    return async (request, env = {}, executionCtx = {}) => {
      // 1. HTTP Method guard
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'POST', 'Content-Type': 'text/plain' },
        });
      }

      // 2. Timing-safe secret token verification
      if (secretToken) {
        const headerToken = request.headers.get('x-telegram-bot-api-secret-token') || '';
        if (!timingSafeEqual(headerToken, secretToken)) {
          return new Response('Unauthorized: Invalid secret token', {
            status: 401,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      }

      // 3. Parse JSON body
      let payload;
      try {
        payload = await request.json();
      } catch {
        return new Response('Bad Request: Invalid JSON body', {
          status: 400,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      if (!payload || typeof payload !== 'object') {
        return new Response('Bad Request: Empty or invalid payload', {
          status: 400,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // 4. API resolution
      let effectiveApi = this.api;
      if (!effectiveApi && (env?.BOT_TOKEN || options.token)) {
        const botToken = env?.BOT_TOKEN || options.token;
        effectiveApi = createDefaultApiClient(botToken);
      }

      // 5. Webhook Reply Interceptor
      let webhookReplyPayload = null;
      let requestApi = effectiveApi;

      if (enableWebhookReply) {
        let replied = false;
        requestApi = {
          call: async (method, params = {}) => {
            if (!replied && !hasBinaryData(params)) {
              replied = true;
              webhookReplyPayload = { method, ...params };
              return { ok: true, result: true };
            }
            if (effectiveApi && typeof effectiveApi.call === 'function') {
              return effectiveApi.call(method, params);
            }
            return { ok: true };
          },
        };
      }

      // 6. Router Dispatch
      const platformCtx = { request, env, executionCtx };

      // Optional background execution on Cloudflare Workers / Vercel Edge via waitUntil
      if (options.background && typeof executionCtx?.waitUntil === 'function' && !enableWebhookReply) {
        executionCtx.waitUntil(
          this.handle(payload, platformCtx, requestApi).catch((err) => {
            if (typeof options.onError === 'function') {
              options.onError(err, request);
            }
          })
        );
        return new Response('OK', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      try {
        await this.handle(payload, platformCtx, requestApi);

        if (webhookReplyPayload) {
          return new Response(JSON.stringify(webhookReplyPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response('OK', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      } catch (err) {
        if (typeof options.onError === 'function') {
          return options.onError(err, request);
        }
        return new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    };
  }

  /**
   * Alias for fetch(): Standard Webhook Request/Response handler.
   * @param {Object} [options={}]
   * @returns {Function}
   */
  webhook(options = {}) {
    return this.fetch(options);
  }

  /**
   * Starts long-polling for updates. Ideal for local development, VPS, and traditional servers.
   * 
   * @param {Object} [options={}]
   * @param {number} [options.timeout=30] Timeout in seconds for long polling
   * @param {number} [options.limit=100] Limits the number of updates to be retrieved (1-100)
   * @param {string[]} [options.allowedUpdates] Array of update types to receive
   * @param {boolean} [options.dropPendingUpdates=false] Drop pending updates before starting
   * @param {Function} [options.onStart] Callback when polling begins
   * @param {Function} [options.onError] Error handler during polling
   * @param {AbortSignal} [options.signal] AbortSignal to stop polling
   * @returns {Promise<void>}
   */
  async start(options = {}) {
    if (!this.api) {
      throw new RoutingError('Cannot start long polling: bot token or api client was not provided.');
    }

    const timeout = options.timeout ?? 30;
    const limit = options.limit ?? 100;
    const allowedUpdates = options.allowedUpdates;
    let offset = options.offset ?? 0;

    this._polling = true;
    this._pollingController = new AbortController();

    if (options.signal) {
      options.signal.addEventListener('abort', () => this.stop(), { once: true });
    }

    if (options.dropPendingUpdates) {
      try {
        await this.api.call('deleteWebhook', { drop_pending_updates: true });
      } catch {
        // Ignore if webhook was not set
      }
    }

    if (typeof options.onStart === 'function') {
      options.onStart();
    }

    while (this._polling) {
      try {
        const params = {
          offset,
          timeout,
          limit,
        };
        if (allowedUpdates) params.allowed_updates = allowedUpdates;

        const updates = await this.api.call('getUpdates', params, {
          signal: this._pollingController.signal,
        });

        if (Array.isArray(updates)) {
          for (const update of updates) {
            if (!this._polling) break;
            offset = update.update_id + 1;
            await this.handle(update, {}, this.api).catch((err) => {
              if (this.onError) this.onError(err);
            });
          }
        }

        // Cooperative yield to event loop
        await sleep(1);
      } catch (err) {
        if (!this._polling || err.name === 'AbortError' || this._pollingController?.signal.aborted) {
          break;
        }
        if (typeof options.onError === 'function') {
          options.onError(err);
        } else if (this.onError) {
          this.onError(err);
        }
        // Graceful backoff on network errors before retrying
        await sleep(3000);
      }
    }
  }

  /**
   * Stops the long-polling loop.
   */
  stop() {
    this._polling = false;
    if (this._pollingController) {
      this._pollingController.abort();
    }
  }

  /**
   * Returns a standard Node.js HTTP / Express / Fastify / Connect webhook middleware.
   * Compatible with:
   * - Express: app.use('/webhook', bot.webhookCallback({ secretToken }))
   * - Fastify: fastify.post('/webhook', bot.webhookCallback({ secretToken }))
   * - Node http: http.createServer(bot.webhookCallback({ secretToken })).listen(3000)
   * 
   * @param {Object} [options={}]
   * @param {string} [options.secretToken] Optional secret token to verify in header
   * @param {Function} [options.onError] Error handler override
   * @returns {(req: any, res: any) => Promise<void>}
   */
  webhookCallback(options = {}) {
    this.compile();
    const secretToken = options.secretToken || null;

    return async (req, res) => {
      // 1. Method verification if available
      if (req.method && req.method !== 'POST') {
        if (res.status && typeof res.status === 'function') {
          return res.status(405).send('Method Not Allowed');
        } else if (res.writeHead) {
          res.writeHead(405, { 'Content-Type': 'text/plain' });
          return res.end('Method Not Allowed');
        }
      }

      // 2. Secret token verification
      if (secretToken) {
        const headerToken = (req.headers && req.headers['x-telegram-bot-api-secret-token']) || '';
        if (!timingSafeEqual(headerToken, secretToken)) {
          if (res.status && typeof res.status === 'function') {
            return res.status(401).send('Unauthorized: Invalid secret token');
          } else if (res.writeHead) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            return res.end('Unauthorized: Invalid secret token');
          }
          return;
        }
      }

      // 3. Parse request body (if string or not already parsed by express.json() / body-parser)
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          if (res.status && typeof res.status === 'function') {
            return res.status(400).send('Bad Request: Invalid JSON body');
          } else if (res.writeHead) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Bad Request: Invalid JSON body');
          }
          return;
        }
      } else if (!body) {
        try {
          body = await new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
              try {
                const raw = Buffer.concat(chunks).toString('utf-8');
                resolve(JSON.parse(raw));
              } catch (e) {
                reject(e);
              }
            });
            req.on('error', reject);
          });
        } catch {
          if (res.status && typeof res.status === 'function') {
            return res.status(400).send('Bad Request: Invalid JSON body');
          } else if (res.writeHead) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Bad Request: Invalid JSON body');
          }
          return;
        }
      }

      if (!body || typeof body !== 'object') {
        if (res.status && typeof res.status === 'function') {
          return res.status(400).send('Bad Request: Empty or invalid payload');
        } else if (res.writeHead) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          return res.end('Bad Request: Empty or invalid payload');
        }
        return;
      }

      // 4. Dispatch to router
      try {
        await this.handle(body, { req, res }, this.api);

        if (res.status && typeof res.status === 'function') {
          return res.status(200).send('OK');
        } else if (res.writeHead) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          return res.end('OK');
        }
      } catch (err) {
        if (typeof options.onError === 'function') {
          options.onError(err, req, res);
        } else if (this.onError) {
          this.onError(err);
        }

        if (!res.headersSent) {
          if (res.status && typeof res.status === 'function') {
            return res.status(500).send('Internal Server Error');
          } else if (res.writeHead) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            return res.end('Internal Server Error');
          }
        }
      }
    };
  }
}

/**
 * Checks if a params object contains binary data (Uint8Array, Buffer, Blob).
 * @private
 */
function hasBinaryData(params) {
  if (!params || typeof params !== 'object') return false;
  for (const key of Object.keys(params)) {
    const val = params[key];
    if (
      val instanceof Uint8Array ||
      (typeof ArrayBuffer !== 'undefined' && val instanceof ArrayBuffer) ||
      (typeof Blob !== 'undefined' && val instanceof Blob)
    ) {
      return true;
    }
  }
  return false;
}

// --- Module: deeplink.js ---
/**
 * Gramless Deep Link & Referral Engine
 * 
 * Provides parsing, pattern-matching, and URL generation for Telegram bot
 * deep links (t.me/Bot?start=payload).
 */


/**
 * Generates a valid Telegram deep link URL.
 * 
 * @param {string} botUsername
 * @param {string} payload Start parameter payload
 * @param {Object} [options={}]
 * @param {boolean} [options.group=false] Link to add bot to group (startgroup)
 * @returns {string}
 */
export function createDeepLink(botUsername, payload = '', options = {}) {
  const cleanUsername = (botUsername || '').replace(/^@/, '');
  const param = options.group ? 'startgroup' : 'start';
  const cleanPayload = encodeURIComponent(payload);
  return `https://t.me/${cleanUsername}?${param}=${cleanPayload}`;
}

/**
 * Decodes a base64url or standard base64 encoded deep link payload.
 * Safe fallback for non-encoded or standard strings.
 * 
 * @param {string} payload
 * @returns {string}
 */
export function decodeDeepLinkPayload(payload) {
  if (!payload || typeof payload !== 'string') return '';
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    let decoded = '';

    if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(padded, 'base64').toString('utf8');
      const reencoded = Buffer.from(decoded, 'utf8').toString('base64').replace(/=/g, '');
      const cleanOrig = base64.replace(/=/g, '');
      if (reencoded === cleanOrig && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(decoded)) {
        return decoded;
      }
    } else if (typeof atob === 'function' && typeof btoa === 'function') {
      decoded = atob(padded);
      const reencoded = btoa(decoded).replace(/=/g, '');
      const cleanOrig = base64.replace(/=/g, '');
      if (reencoded === cleanOrig && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(decoded)) {
        return decoded;
      }
    }
    return payload;
  } catch {
    return payload;
  }
}

/**
 * Compiles a route pattern string like 'ref_:id' into a regex with named parameter capture.
 * @param {string|RegExp} pattern
 * @returns {{ regex: RegExp, paramNames: string[] }}
 */
function compilePattern(pattern) {
  if (pattern instanceof RegExp) {
    return { regex: pattern, paramNames: [] };
  }

  const paramNames = [];
  const regexStr = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
    paramNames.push(name);
    return '([a-zA-Z0-9_.-]+)';
  });

  return {
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
  };
}

export class DeepLinkRouter {
  constructor() {
    /** @type {Array<{ pattern: string|RegExp, regex: RegExp, paramNames: string[], handler: Function }>} */
    this.routes = [];
    /** @type {Function|null} */
    this.fallbackHandler = null;
  }

  /**
   * Registers a handler for a deep link payload pattern.
   * Supports exact strings, ':param' wildcards (e.g. 'ref_:id'), or RegExp.
   * 
   * @param {string|RegExp} pattern
   * @param {Function} handler async (ctx, next?) => void
   * @returns {this}
   */
  on(pattern, handler) {
    const { regex, paramNames } = compilePattern(pattern);
    this.routes.push({ pattern, regex, paramNames, handler });
    return this;
  }

  /**
   * Registers a fallback handler when a start command has a payload that matched no patterns.
   * @param {Function} handler async (ctx, next?) => void
   * @returns {this}
   */
  fallback(handler) {
    this.fallbackHandler = handler;
    return this;
  }

  /**
   * Middleware that intercepts /start commands with payloads.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      const text = ctx.text;
      if (!text || text.charCodeAt(0) !== 47 /* '/' */) {
        return next();
      }

      const parsed = parseCommand(text);
      if (!parsed || parsed.command !== 'start' || !parsed.payload) {
        return next();
      }

      const payload = parsed.payload;
      ctx.deepLink = {
        payload,
        decoded: decodeDeepLinkPayload(payload),
        params: {},
        match: null,
      };

      for (let i = 0; i < this.routes.length; i++) {
        const { regex, paramNames, handler } = this.routes[i];
        const match = payload.match(regex);
        if (match) {
          ctx.deepLink.match = match;
          ctx.match = match;

          if (paramNames.length > 0) {
            for (let p = 0; p < paramNames.length; p++) {
              ctx.deepLink.params[paramNames[p]] = match[p + 1];
              ctx.params[paramNames[p]] = match[p + 1];
            }
          }

          await handler(ctx, next);
          return;
        }
      }

      if (this.fallbackHandler) {
        await this.fallbackHandler(ctx, next);
        return;
      }

      return next();
    };
  }
}

/**
 * Creates a DeepLinkRouter instance.
 * @returns {DeepLinkRouter}
 */
export function createDeepLinkRouter() {
  return new DeepLinkRouter();
}

// --- Module: fsm.js ---
/**
 * Gramless Finite State Machine (FSM) & Conversation Scenes
 * 
 * Provides linear multi-step dialogue flows (wizards/scenes) with state persistence,
 * validation guards, and automatic cancellation handlers.
 */


export class FsmMachine {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.sessionProperty='_fsm'] Key inside ctx.session where FSM state lives
   * @param {string} [options.initialStep=null]
   */
  constructor(options = {}) {
    this.sessionProperty = options.sessionProperty || '_fsm';
    this.initialStep = options.initialStep || null;

    /** @type {Map<string, { handler: Function, guard?: Function }>} */
    this.steps = new Map();

    /** @type {Function|null} Called when user exits or cancels the flow */
    this.cancelHandler = null;

    /** @type {string|RegExp|null} Command or regex that aborts the flow (e.g. /cancel) */
    this.cancelTrigger = /^\/cancel$/i;
  }

  /**
   * Defines a step in the conversation state machine.
   * 
   * @param {string} stepName
   * @param {Function} handler async (ctx) => void
   * @param {Function} [guard] Optional predicate: async (ctx) => boolean
   * @returns {this}
   */
  step(stepName, handler, guard = null) {
    this.steps.set(stepName, { handler, guard });
    return this;
  }

  /**
   * Configures a custom trigger for cancelling the flow.
   * @param {string|RegExp} trigger
   * @param {Function} [onCancel]
   * @returns {this}
   */
  onCancel(trigger, onCancel = null) {
    this.cancelTrigger = trigger;
    if (onCancel) this.cancelHandler = onCancel;
    return this;
  }

  /**
   * Middleware that intercepts updates when a user is in an active FSM step.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      if (!ctx.session) {
        throw new GramlessError('FSM requires session middleware to be installed before FSM middleware');
      }

      // Provide FSM control methods on context
      const sessionProp = this.sessionProperty;
      ctx.fsm = {
        /** Whether user is in an active FSM conversation */
        get active() {
          return Boolean(ctx.session[sessionProp]?.step);
        },
        /** Current active step name */
        get current() {
          return ctx.session[sessionProp]?.step || null;
        },
        /** Stored conversation payload/data */
        get data() {
          if (!ctx.session[sessionProp]) {
            ctx.session[sessionProp] = { step: null, data: {}, history: [] };
          }
          return ctx.session[sessionProp].data;
        },
        /** Advance or transition to a specific step */
        goto: (stepName, payload = {}) => {
          if (!this.steps.has(stepName)) {
            throw new GramlessError(`Unknown FSM target step: "${stepName}"`);
          }
          const prev = ctx.session[sessionProp] || { step: null, data: {}, history: [] };
          const history = Array.isArray(prev.history) ? [...prev.history] : [];
          if (prev.step) history.push(prev.step);

          ctx.session[sessionProp] = {
            step: stepName,
            data: { ...prev.data, ...payload },
            history,
          };
        },
        /** Reverts to the previous step in history, returning true if succeeded */
        back: () => {
          const current = ctx.session[sessionProp];
          if (!current || !Array.isArray(current.history) || current.history.length === 0) {
            return false;
          }
          const prevStep = current.history.pop();
          current.step = prevStep;
          return true;
        },
        /** Complete and exit the flow */
        complete: () => {
          delete ctx.session[sessionProp];
        },
      };

      const currentState = ctx.session[this.sessionProperty];
      if (!currentState?.step) {
        // Not currently in an active conversation flow; proceed to normal routes
        return next();
      }

      // Check cancellation trigger
      if (this.cancelTrigger && (ctx.text || ctx.data)) {
        const val = ctx.text || ctx.data;
        const isCancel = this.cancelTrigger instanceof RegExp
          ? this.cancelTrigger.test(val)
          : val.toLowerCase() === this.cancelTrigger.toLowerCase();

        if (isCancel) {
          ctx.fsm.complete();
          if (this.cancelHandler) {
            await this.cancelHandler(ctx);
            return;
          }
          await ctx.reply('Operation cancelled.');
          return;
        }
      }

      const activeStep = this.steps.get(currentState.step);
      if (!activeStep) {
        // Stale or removed step; reset and proceed
        ctx.fsm.complete();
        return next();
      }

      // Check guard if present
      if (activeStep.guard) {
        const isValid = await activeStep.guard(ctx);
        if (!isValid) {
          // Guard rejected; do not advance or execute main step
          return;
        }
      }

      // Execute active step
      await activeStep.handler(ctx, next);
    };
  }
}

/**
 * Factory helper for creating an FsmMachine instance.
 * @param {Object} [options]
 * @returns {FsmMachine}
 */
export function createFSM(options) {
  return new FsmMachine(options);
}

// --- Main Entrypoint ---
export function createBot(options = {}) {
  return new GramlessRouter(options);
}

export function webhookCallback(bot, options = {}) {
  return bot.webhookCallback(options);
}

export default createBot;
