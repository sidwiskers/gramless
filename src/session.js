/**
 * Gramless Transactional Session Engine
 * 
 * Provides atomic, isolated state persistence backed by SQLite (sdk/db) or In-Memory storage.
 * Enforces transactional rollback: changes to `ctx.session` commit ONLY if the handler
 * resolves successfully; any uncaught throw or API error aborts and rolls back changes.
 */

import { SessionError, SessionConflictError } from './errors.js';

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
      const originalSnapshot = safeClone(savedData);

      // 2. Working copy for handler execution
      let workingCopy = savedData !== null ? safeClone(savedData) : initial();
      ctx.session = workingCopy;

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
