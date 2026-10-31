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
