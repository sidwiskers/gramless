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

  /** True if an inline callback query expired before being answered */
  get isQueryTooOld() {
    return this.errorCode === 400 && /query is too old/i.test(this.description);
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
