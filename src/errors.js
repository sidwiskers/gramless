/**
 * Gramless Error System
 * 
 * Provides structured, typed errors with token and credential sanitization.
 */

const TOKEN_PATTERN = /(?:bot)?\d{5,16}:[A-Za-z0-9_-]{20,50}/g;

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
    super(`Telegram API call ${method} failed (${errorCode}): ${description}`, 'API_ERROR', {
      method,
      errorCode,
      description,
      parameters,
    });
    this.method = method;
    this.errorCode = errorCode;
    this.description = description;
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
