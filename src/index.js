/**
 * Gramless: The Zero-Compromise Telegram Serverless Framework
 * 
 * Engineered for TGCloud and V8 Isolates.
 * Built with zero-allocation systems discipline.
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
export { rateLimit, MemoryRateLimitStore, RateLimitKey } from './ratelimit.js';
export { createI18n, I18nEngine } from './i18n.js';
export { paginate, Menu } from './menu.js';
export { createDeepLinkRouter, createDeepLink, decodeDeepLinkPayload } from './deeplink.js';
export { createStarsEngine, StarsEngine } from './payments.js';
export { mediaGroup, MediaGroupAggregator } from './media_group.js';
export { autoRetry, wrapApi, executeWithRetry } from './auto_retry.js';
export { createStatelessQuestion, StatelessQuestion } from './stateless_question.js';
export { cleaner, createCleaner, MessageCleaner } from './cleaner.js';
export {
  html,
  md,
  fmt,
  raw,
  RawString,
  escapeHtml,
  escapeMarkdown,
  escapeMarkdownV1,
} from './format.js';

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
