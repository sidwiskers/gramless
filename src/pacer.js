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

import { sleep } from './isolate.js';

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

export default {
  ChatPacer,
  wrapPacer,
  pacer,
  isGroupChatId,
};
