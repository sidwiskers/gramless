/**
 * Gramless Deep Link & Referral Engine
 * 
 * Provides parsing, pattern-matching, and URL generation for Telegram bot
 * deep links (t.me/Bot?start=payload).
 */

import { parseCommand } from './router.js';

/**
 * Generates a valid Telegram deep link URL.
 * 
 * @param {string} botUsername
 * @param {string} payload Start parameter payload
 * @param {Object} [options={}]
 * @param {boolean} [options.group=false] Link to add bot to group (startgroup)
 * @returns {string}
 */
export function createDeepLink(botUsername, payload = '', options = {}) {
  const cleanUsername = (botUsername || '').replace(/^@/, '');
  const param = options.group ? 'startgroup' : 'start';
  const cleanPayload = encodeURIComponent(payload);
  return `https://t.me/${cleanUsername}?${param}=${cleanPayload}`;
}

/**
 * Decodes a base64url or standard base64 encoded deep link payload.
 * Safe fallback for non-encoded or standard strings.
 * 
 * @param {string} payload
 * @returns {string}
 */
export function decodeDeepLinkPayload(payload) {
  if (!payload || typeof payload !== 'string') return '';
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    let decoded = '';

    if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(padded, 'base64').toString('utf8');
      const reencoded = Buffer.from(decoded, 'utf8').toString('base64').replace(/=/g, '');
      const cleanOrig = base64.replace(/=/g, '');
      if (reencoded === cleanOrig && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(decoded)) {
        return decoded;
      }
    } else if (typeof atob === 'function' && typeof btoa === 'function') {
      decoded = atob(padded);
      const reencoded = btoa(decoded).replace(/=/g, '');
      const cleanOrig = base64.replace(/=/g, '');
      if (reencoded === cleanOrig && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(decoded)) {
        return decoded;
      }
    }
    return payload;
  } catch {
    return payload;
  }
}

/**
 * Compiles a route pattern string like 'ref_:id' into a regex with named parameter capture.
 * @param {string|RegExp} pattern
 * @returns {{ regex: RegExp, paramNames: string[] }}
 */
function compilePattern(pattern) {
  if (pattern instanceof RegExp) {
    return { regex: pattern, paramNames: [] };
  }

  const paramNames = [];
  const regexStr = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^\\s_]+)';
  });

  return {
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
  };
}

export class DeepLinkRouter {
  constructor() {
    /** @type {Array<{ pattern: string|RegExp, regex: RegExp, paramNames: string[], handler: Function }>} */
    this.routes = [];
    /** @type {Function|null} */
    this.fallbackHandler = null;
  }

  /**
   * Registers a handler for a deep link payload pattern.
   * Supports exact strings, ':param' wildcards (e.g. 'ref_:id'), or RegExp.
   * 
   * @param {string|RegExp} pattern
   * @param {Function} handler async (ctx) => void
   * @returns {this}
   */
  on(pattern, handler) {
    const { regex, paramNames } = compilePattern(pattern);
    this.routes.push({ pattern, regex, paramNames, handler });
    return this;
  }

  /**
   * Registers a fallback handler when a start command has a payload that matched no patterns.
   * @param {Function} handler
   * @returns {this}
   */
  fallback(handler) {
    this.fallbackHandler = handler;
    return this;
  }

  /**
   * Middleware that intercepts /start commands with payloads.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      const text = ctx.text;
      if (!text || text.charCodeAt(0) !== 47 /* '/' */) {
        return next();
      }

      const parsed = parseCommand(text);
      if (!parsed || parsed.command !== 'start' || !parsed.payload) {
        return next();
      }

      const payload = parsed.payload;
      ctx.deepLink = {
        payload,
        decoded: decodeDeepLinkPayload(payload),
        params: {},
        match: null,
      };

      for (let i = 0; i < this.routes.length; i++) {
        const { regex, paramNames, handler } = this.routes[i];
        const match = payload.match(regex);
        if (match) {
          ctx.deepLink.match = match;
          ctx.match = match;

          if (paramNames.length > 0) {
            for (let p = 0; p < paramNames.length; p++) {
              ctx.deepLink.params[paramNames[p]] = match[p + 1];
              ctx.params[paramNames[p]] = match[p + 1];
            }
          }

          await handler(ctx);
          return;
        }
      }

      if (this.fallbackHandler) {
        await this.fallbackHandler(ctx);
        return;
      }

      return next();
    };
  }
}

/**
 * Creates a DeepLinkRouter instance.
 * @returns {DeepLinkRouter}
 */
export function createDeepLinkRouter() {
  return new DeepLinkRouter();
}
