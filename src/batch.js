/**
 * Gramless Batch & Continuation Workflow Engine
 * 
 * Provides interactive, multi-pass batch job processing designed for V8 isolates
 * with hard execution deadlines (e.g. 10.4s in TGCloud) and egress sandbox loopback firewalls.
 * Automatically slices workloads into safe chunks, tracks session cursors,
 * monitors isolate clock budgets, and renders seamless interactive continuation UI.
 */

import { buildInlineKeyboard } from './context.js';

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

export default {
  BatchJob,
  createBatchJob,
};
