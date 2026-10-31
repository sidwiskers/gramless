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
 */
export const RateLimitKey = {
  byUser: (ctx) => (ctx.userId ? `user:${ctx.userId}` : null),
  byChat: (ctx) => (ctx.chatId ? `chat:${ctx.chatId}` : null),
  byChatUser: (ctx) => (ctx.chatId && ctx.userId ? `chat_user:${ctx.chatId}:${ctx.userId}` : null),
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
    if (ctx.data !== null) {
      await ctx.answer(`Too fast! Please wait ${secs}s.`, { show_alert: true });
    } else {
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
