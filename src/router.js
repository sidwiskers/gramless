/**
 * Gramless Router & Dispatch Engine
 * 
 * Provides constant-time $O(1)$ command and callback dispatch, length-partitioned
 * prefix routing, and pre-compiled middleware pipelines.
 */

import { GramlessContext } from './context.js';
import { RoutingError, PanicError } from './errors.js';

/**
 * Composes an array of middleware functions into a single executable pipeline.
 * Evaluated once during route registration / compilation, eliminating per-update allocations.
 * 
 * @param {Array<Function>} middlewares
 * @param {Function} targetHandler
 * @returns {Function}
 */
export function composeMiddleware(middlewares, targetHandler) {
  if (middlewares.length === 0) return targetHandler;

  return function (ctx) {
    let index = -1;

    function dispatch(i) {
      if (i <= index) {
        return Promise.reject(new RoutingError('next() called multiple times in middleware'));
      }
      index = i;
      const fn = i < middlewares.length ? middlewares[i] : targetHandler;
      if (!fn) return Promise.resolve();

      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}

/**
 * Extracts command name, target bot username, and arguments from message text.
 * Handles /command, /command@bot_name, and multiline or tabbed trailing arguments.
 * 
 * @param {string} text
 * @param {string|null} [botUsername=null]
 * @returns {{ command: string, targetBot: string|null, payload: string, args: string[] } | null}
 */
export function parseCommand(text, botUsername = null) {
  if (!text || text.charCodeAt(0) !== 47 /* '/' */) return null;

  const match = text.match(/^\/([a-zA-Z0-9_]+)(?:@([a-zA-Z0-9_]+))?(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  const rawCommand = match[1].toLowerCase();
  const targetBot = match[2] ? match[2].toLowerCase() : null;
  const payload = match[3] ? match[3].trim() : '';

  // If command is addressed to a different bot in a group chat, ignore it
  if (targetBot && botUsername && targetBot !== botUsername.toLowerCase()) {
    return null;
  }

  const args = payload.length > 0 ? payload.split(/\s+/) : [];

  return {
    command: rawCommand,
    targetBot,
    payload,
    args,
  };
}

export class GramlessRouter {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.filter] Guard filter for this entire router or sub-group
   * @param {Record<string, any>} [options.api] Optional API client injection
   * @param {Function} [options.onError] Global error handler hook
   */
  constructor(options = {}) {
    this.filter = options.filter || null;
    this.api = options.api || null;
    this.onError = options.onError || null;
    this.username = (options.username || options.botUsername || '').replace(/^@/, '');

    /** @type {Array<Function>} */
    this.middlewares = [];

    /** @type {Map<string, Function>} Exact command registry: Map<commandName, compiledPipeline> */
    this.commands = new Map();

    /** @type {Map<string, Function>} Exact callback_query data registry: Map<exactData, compiledPipeline> */
    this.exactCallbacks = new Map();

    /** @type {Array<{ prefix: string, handler: Function }>} Length-ordered callback prefix routes */
    this.prefixCallbacks = [];

    /** @type {Array<{ pattern: RegExp, handler: Function }>} Regex callback routes */
    this.regexCallbacks = [];

    /** @type {Array<{ pattern: RegExp|string, handler: Function }>} Hears text routes */
    this.hearsRoutes = [];

    /** @type {Map<string, Array<Function>>} Event type routes ('message', 'photo', etc.) */
    this.eventRoutes = new Map();

    /** @type {Array<{ filter: Function, handler: Function }>} Composable filter predicate routes */
    this.predicateRoutes = [];

    /** @type {Array<GramlessRouter>} Child sub-routers / groups */
    this.subRouters = [];

    /** @type {Function|null} Fallback handler when no route matches */
    this.fallbackHandler = null;

    /** @private */
    this._isCompiled = false;
  }

  /**
   * Attaches one or more middleware functions.
   * @param {...Function} fns
   * @returns {this}
   */
  use(...fns) {
    this.middlewares.push(...fns.flat());
    this._compiledPipeline = null;
    return this;
  }

  /**
   * Registers a command handler (e.g. 'start', ['help', 'settings']).
   * @param {string|string[]} names
   * @param {...Function} handlers
   * @returns {this}
   */
  command(names, ...handlers) {
    const list = Array.isArray(names) ? names : [names];
    const pipeline = this._compileRoute(handlers);

    for (const name of list) {
      const cleanName = name.replace(/^\//, '').toLowerCase();
      this.commands.set(cleanName, pipeline);
    }
    return this;
  }

  /**
   * Registers a callback query button press handler.
   * Supports exact strings, wildcard prefixes (e.g. 'order:*'), or RegExp.
   * 
   * @param {string|RegExp} trigger
   * @param {...Function} handlers
   * @returns {this}
   */
  action(trigger, ...handlers) {
    const pipeline = this._compileRoute(handlers);

    if (trigger instanceof RegExp) {
      this.regexCallbacks.push({ pattern: trigger, handler: pipeline });
    } else if (typeof trigger === 'string') {
      if (trigger.endsWith('*') || trigger.endsWith(':')) {
        const prefix = trigger.replace(/\*$/, '');
        this.prefixCallbacks.push({ prefix, handler: pipeline });
        // Keep sorted by prefix length descending (longest prefix matches first)
        this.prefixCallbacks.sort((a, b) => b.prefix.length - a.prefix.length);
      } else {
        this.exactCallbacks.set(trigger, pipeline);
      }
    }
    return this;
  }

  /**
   * Alias for action(): Registers a handler for callback query data.
   * @param {string|RegExp} trigger
   * @param {...Function} handlers
   * @returns {this}
   */
  callback(trigger, ...handlers) {
    return this.action(trigger, ...handlers);
  }

  /**
   * Matches message text or caption against a string or RegExp pattern.
   * @param {string|RegExp} pattern
   * @param {...Function} handlers
   * @returns {this}
   */
  hears(pattern, ...handlers) {
    const pipeline = this._compileRoute(handlers);
    this.hearsRoutes.push({ pattern, handler: pipeline });
    return this;
  }

  /**
   * Matches by update event kind ('message', 'photo', etc.) or functional filter predicate.
   * @param {string|Function} trigger
   * @param {...Function} handlers
   * @returns {this}
   */
  on(trigger, ...handlers) {
    const pipeline = this._compileRoute(handlers);
    if (typeof trigger === 'function') {
      this.predicateRoutes.push({ filter: trigger, handler: pipeline });
    } else {
      let list = this.eventRoutes.get(trigger);
      if (!list) {
        list = [];
        this.eventRoutes.set(trigger, list);
      }
      list.push(pipeline);
    }
    return this;
  }

  /**
   * Creates a sub-router/group protected by an optional filter predicate.
   * Sub-routers inherit parent middleware.
   * 
   * @param {Function} [filter]
   * @returns {GramlessRouter}
   */
  group(filter) {
    const child = new GramlessRouter({
      filter,
      api: this.api,
      onError: this.onError,
      username: this.username,
    });
    this.subRouters.push(child);
    return child;
  }

  /**
   * Registers a fallback handler when no other registered routes match.
   * @param {...Function} handlers
   * @returns {this}
   */
  fallback(...handlers) {
    this.fallbackHandler = this._compileRoute(handlers);
    return this;
  }

  /**
   * Compiles handlers for a specific route.
   * @private
   */
  _compileRoute(handlers) {
    if (handlers.length === 1) return handlers[0];
    return composeMiddleware(handlers.slice(0, -1), handlers[handlers.length - 1]);
  }

  /**
   * Core dispatch: Routes an incoming update payload to matching handler.
   * 
   * @param {Record<string, any>} input Unwrapped Telegram payload
   * @param {Record<string, any>} [ctx={}] Platform execution context
   * @param {Record<string, any>} [api] API client override
   * @returns {Promise<any>}
   */
  async handle(input, ctx = {}, api = null) {
    const effectiveApi = api || this.api;
    const context = input instanceof GramlessContext
      ? input
      : new GramlessContext(input, ctx, effectiveApi);

    // If an outer filter predicate exists on this router and rejects, exit
    if (this.filter && !(await this.filter(context))) {
      return false;
    }

    if (!this._compiledPipeline) {
      this._compiledPipeline = composeMiddleware(this.middlewares, async (c) => {
        const handled = await this._dispatch(c);
        if (handled) return true;

        // Check sub-routers
        for (const sub of this.subRouters) {
          const subHandled = await sub.handle(c, ctx, effectiveApi);
          if (subHandled) return true;
        }

        // Fallback
        if (this.fallbackHandler) {
          await this.fallbackHandler(c);
          return true;
        }

        return false;
      });
    }

    try {
      return await this._compiledPipeline(context);
    } catch (err) {
      const panic = err instanceof Error ? err : new PanicError(err);
      if (typeof this.onError === 'function') {
        await this.onError(panic, context);
        return true;
      }
      throw panic;
    }
  }

  /**
   * Internal fast-path dispatcher.
   * @private
   */
  async _dispatch(ctx) {
    const text = ctx.text;
    const data = ctx.data;

    // 1. Exact Commands ($O(1) Map lookup)
    if (text && text.charCodeAt(0) === 47 /* '/' */) {
      const parsed = parseCommand(text, this.username);
      if (parsed) {
        const cmdHandler = this.commands.get(parsed.command);
        if (cmdHandler) {
          ctx.match = [text, parsed.payload];
          ctx.command = parsed.command;
          ctx.payload = parsed.payload;
          ctx.args = parsed.args;
          await cmdHandler(ctx);
          return true;
        }
      }
    }

    // 2. Callback Queries
    if (data !== null) {
      // 2a. Exact callback match ($O(1) Map lookup)
      const exactHandler = this.exactCallbacks.get(data);
      if (exactHandler) {
        await exactHandler(ctx);
        return true;
      }

      // 2b. Length-ordered prefix matching
      for (let i = 0; i < this.prefixCallbacks.length; i++) {
        const { prefix, handler } = this.prefixCallbacks[i];
        if (data.startsWith(prefix)) {
          ctx.match = [data, data.slice(prefix.length)];
          await handler(ctx);
          return true;
        }
      }

      // 2c. Regex callback matching
      for (let i = 0; i < this.regexCallbacks.length; i++) {
        const { pattern, handler } = this.regexCallbacks[i];
        const match = data.match(pattern);
        if (match) {
          ctx.match = match;
          await handler(ctx);
          return true;
        }
      }
    }

    // 3. Hears (Text pattern matching)
    if (text) {
      for (let i = 0; i < this.hearsRoutes.length; i++) {
        const { pattern, handler } = this.hearsRoutes[i];
        if (typeof pattern === 'string' && text.includes(pattern)) {
          ctx.match = [text];
          await handler(ctx);
          return true;
        } else if (pattern instanceof RegExp) {
          const match = text.match(pattern);
          if (match) {
            ctx.match = match;
            await handler(ctx);
            return true;
          }
        }
      }
    }

    // 4. Composable Predicate Routes (Filter.all, etc.)
    for (let i = 0; i < this.predicateRoutes.length; i++) {
      const { filter, handler } = this.predicateRoutes[i];
      if (await filter(ctx)) {
        await handler(ctx);
        return true;
      }
    }

    // 5. Update Event Type matching (hierarchical: specific -> general, e.g. 'text' -> 'message')
    const eventTypes = this._resolveEventTypes(ctx);
    for (const eventType of eventTypes) {
      const handlers = this.eventRoutes.get(eventType);
      if (handlers && handlers.length > 0) {
        for (const handler of handlers) {
          await handler(ctx);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Resolves hierarchical candidate event types from the context (ordered specific to general).
   * @param {GramlessContext} ctx
   * @returns {string[]}
   * @private
   */
  _resolveEventTypes(ctx) {
    const types = [];
    const isMessage = Boolean(
      ctx.raw?.chat ||
      ctx.update?.message ||
      ctx.update?.channel_post ||
      ctx.update?.edited_message ||
      ctx.update?.edited_channel_post
    );

    if (ctx.raw?.data !== undefined || ctx.update?.callback_query) types.push('callback_query');
    if (ctx.raw?.query !== undefined || ctx.update?.inline_query) types.push('inline_query');
    if (ctx.raw?.result_id !== undefined || ctx.update?.chosen_inline_result) types.push('chosen_inline_result');
    if (ctx.raw?.shipping_address || ctx.update?.shipping_query) types.push('shipping_query');
    if (ctx.raw?.total_amount !== undefined || ctx.update?.pre_checkout_query) types.push('pre_checkout_query');
    if (ctx.raw?.poll_id !== undefined || ctx.update?.poll_answer) types.push('poll_answer');
    if ((ctx.raw?.options && ctx.raw?.question) || ctx.update?.poll) types.push('poll');
    if (ctx.update?.my_chat_member || (ctx.raw?.new_chat_member && ctx.raw?.old_chat_member)) types.push('my_chat_member');
    if (ctx.update?.chat_member) types.push('chat_member');
    if (ctx.update?.chat_join_request || ctx.raw?.invite_link) types.push('chat_join_request');
    if (ctx.update?.guest_message) types.push('guest_message');
    if (ctx.update?.subscription) types.push('subscription');
    if (ctx.update?.stopped_message_generation) types.push('stopped_message_generation');

    if (ctx.update?.channel_post) types.push('channel_post');
    if (ctx.update?.edited_message) types.push('edited_message');

    if (ctx.raw?.rich_message) types.push('rich_message');
    if (ctx.raw?.live_photo) types.push('live_photo');
    if (ctx.raw?.photo) types.push('photo');
    if (ctx.raw?.document) types.push('document');
    if (ctx.raw?.voice) types.push('voice');
    if (ctx.raw?.audio) types.push('audio');
    if (ctx.raw?.video) types.push('video');
    if (ctx.raw?.video_note) types.push('video_note');
    if (ctx.raw?.sticker) types.push('sticker');
    if (ctx.raw?.animation) types.push('animation');
    if (ctx.raw?.location) types.push('location');
    if (ctx.raw?.contact) types.push('contact');
    if (ctx.raw?.dice) types.push('dice');
    if (ctx.raw?.text) types.push('text');

    // General 'message' catch-all for any message-family update
    if (isMessage && !types.includes('message')) {
      types.push('message');
    }

    return types;
  }

  /**
   * Determines primary event type name from the context.
   * @private
   */
  _resolveEventType(ctx) {
    const types = this._resolveEventTypes(ctx);
    return types.length > 0 ? types[0] : null;
  }

  /**
   * Generates a standard Telegram Serverless default export handler.
   * Usage in tgcloud/handlers/message.js:
   *   export default bot.handler();
   * 
   * @returns {Function}
   */
  handler() {
    return async (input, ctx) => {
      // If running inside TGCloud and no custom API client is set, lazy-import 'sdk'
      if (!this.api) {
        try {
          // Dynamic import of the virtual module in TGCloud
          const sdk = await import('sdk');
          this.api = sdk.api;
        } catch {
          // Non-cloud test environment; API can be injected per call
        }
      }
      return this.handle(input, ctx, this.api);
    };
  }
}
