/**
 * Gramless Media Group / Album Aggregator Engine
 * 
 * Aggregates multi-photo/video album updates sharing the same media_group_id
 * into a single consolidated handler execution, preventing duplicate responses.
 */

import { safeSetTimeout, safeClearTimeout } from './isolate.js';

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
