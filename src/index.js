/**
 * Gramless: The Zero-Compromise Telegram Serverless Framework
 * 
 * Engineered for TGCloud and V8 Isolates.
 * Inspired by the systems discipline of Hermes.
 */

import { GramlessRouter } from './router.js';

export { GramlessRouter } from './router.js';
export {
  GramlessContext,
  buildInlineKeyboard,
  buildReplyKeyboard,
  removeKeyboard,
  forceReply,
} from './context.js';
export { Filter } from './filters.js';
export {
  GramlessError,
  ApiError,
  ValidationError,
  RoutingError,
  SessionError,
  PanicError,
  sanitizeString,
} from './errors.js';
export {
  session,
  MemorySessionStore,
  TgCloudSessionStore,
  SessionKey,
} from './session.js';
export { createFSM, FsmMachine } from './fsm.js';
export { createEndpoint, v } from './endpoint.js';

/**
 * Creates a new Gramless bot application router.
 * 
 * @param {Object} [options={}]
 * @param {Record<string, any>} [options.api] Optional API client injection
 * @param {Function} [options.onError] Global unhandled error hook
 * @returns {GramlessRouter}
 */
export function createBot(options = {}) {
  return new GramlessRouter(options);
}

export default createBot;
