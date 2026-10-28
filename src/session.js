/**
 * Gramless Transactional Session Engine
 * 
 * Provides atomic, isolated state persistence backed by SQLite (sdk/db) or In-Memory storage.
 * Enforces transactional rollback: changes to `ctx.session` commit ONLY if the handler
 * resolves successfully; any uncaught throw or API error aborts and rolls back changes.
 */

import { SessionError } from './errors.js';

/**
 * Standard key resolvers.
 */
export const SessionKey = {
  byUser: (ctx) => (ctx.userId ? `user:${ctx.userId}` : null),
  byChat: (ctx) => (ctx.chatId ? `chat:${ctx.chatId}` : null),
  byChatUser: (ctx) => (ctx.chatId && ctx.userId ? `chat_user:${ctx.chatId}:${ctx.userId}` : null),
};

/**
 * In-memory session store for local development, testing, and ephemeral states.
 */
export class MemorySessionStore {
  constructor() {
    /** @type {Map<string, { data: any, updatedAt: number }>} */
    this.storage = new Map();
  }

  async get(key) {
    const entry = this.storage.get(key);
    if (!entry) return null;
    // Return deep clone to ensure isolation
    return JSON.parse(JSON.stringify(entry.data));
  }

  async set(key, data) {
    this.storage.set(key, {
      data: JSON.parse(JSON.stringify(data)),
      updatedAt: Date.now(),
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
   */
  constructor({ db, table, eq }) {
    this.db = db;
    this.table = table;
    this.eq = eq;
  }

  async get(key) {
    try {
      const row = await this.db
        .select()
        .from(this.table)
        .where(this.eq(this.table.id, key))
        .get();

      return row?.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null;
    } catch (err) {
      throw new SessionError(`Failed to read session for key ${key}: ${err.message}`, { cause: err });
    }
  }

  async set(key, data) {
    try {
      await this.db
        .insert(this.table)
        .values({
          id: key,
          data: data,
        })
        .onConflictDoUpdate({
          target: this.table.id,
          set: {
            data: data,
          },
        })
        .run();
    } catch (err) {
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

  return async function sessionMiddleware(ctx, next) {
    const key = getKey(ctx);
    if (!key) {
      // If no key can be resolved (e.g. system update with no user/chat), skip session
      return next();
    }

    // 1. Fetch current committed state
    const savedData = await store.get(key);
    const originalSnapshot = savedData ? JSON.stringify(savedData) : null;

    // 2. Working copy for handler execution
    let workingCopy = savedData !== null ? savedData : initial();
    ctx.session = workingCopy;

    try {
      // 3. Execute downstream handlers
      await next();

      // 4. On handler SUCCESS: Commit changes
      if (ctx.session === null) {
        // Explicitly cleared session
        await store.delete(key);
      } else {
        const currentSnapshot = JSON.stringify(ctx.session);
        // Only write to store if state actually changed
        if (currentSnapshot !== originalSnapshot) {
          await store.set(key, ctx.session);
        }
      }
    } catch (err) {
      // 5. On handler ERROR / PANIC: Automatic Rollback!
      // We do NOT write `ctx.session` to `store`.
      // The pending uncommitted modifications are discarded immediately.
      ctx.session = originalSnapshot ? JSON.parse(originalSnapshot) : initial();
      throw err;
    }
  };
}
