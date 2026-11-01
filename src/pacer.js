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
  'editMessageText',
  'editMessageCaption',
  'editMessageMedia',
  'editMessageReplyMarkup',
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
 * Pacer engine managing per-chat queues and global dispatch limits.
 */
export class ChatPacer {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.minChatIntervalMs=1000] Minimum spacing between messages to the same chat
   * @param {number} [options.globalLimitPerSec=30] Maximum total messages across all chats per second
   * @param {Set<string>|Array<string>} [options.methods] Methods subject to pacing
   */
  constructor(options = {}) {
    this.minChatIntervalMs = options.minChatIntervalMs ?? 1000;
    this.globalTokenBucket = new GlobalTokenBucket(options.globalLimitPerSec ?? 30);
    this.pacedMethods = options.methods
      ? new Set(options.methods)
      : DEFAULT_PACED_METHODS;

    /** @type {Map<string|number, { lastDispatch: number, queue: Array<() => void>, running: boolean }>} */
    this.queues = new Map();
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
    // If no chatId is associated, execute subject only to global rate pacing
    if (chatId === null || chatId === undefined) {
      const globalDelay = this.globalTokenBucket.acquireDelay();
      if (globalDelay > 0) {
        await new Promise((r) => setTimeout(r, globalDelay));
      }
      return callFn();
    }

    let chatEntry = this.queues.get(chatId);
    if (!chatEntry) {
      chatEntry = { lastDispatch: 0, queue: [], running: false };
      this.queues.set(chatId, chatEntry);
    }

    return new Promise((resolve, reject) => {
      chatEntry.queue.push(async () => {
        try {
          // 1. Calculate per-chat required wait
          const now = Date.now();
          const chatElapsed = now - chatEntry.lastDispatch;
          const chatDelay = Math.max(0, this.minChatIntervalMs - chatElapsed);

          // 2. Calculate global bucket required wait
          const globalDelay = this.globalTokenBucket.acquireDelay();

          const totalDelay = Math.max(chatDelay, globalDelay);
          if (totalDelay > 0) {
            await new Promise((r) => setTimeout(r, totalDelay));
          }

          chatEntry.lastDispatch = Date.now();
          const result = await callFn();
          resolve(result);
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

export default {
  ChatPacer,
  wrapPacer,
  pacer,
};
