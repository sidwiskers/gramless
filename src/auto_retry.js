/**
 * Gramless Auto-Retry & Flood Control Interceptor
 * 
 * Automatically catches Telegram 429 (Too Many Requests) errors,
 * sleeps for the requested retry_after seconds, and retries the outbound call.
 */

/**
 * Executes a function with automatic retry on Telegram 429 flood control errors.
 * 
 * @param {Function} callFn Async function to invoke
 * @param {Object} [options={}]
 * @param {number} [options.maxRetries=3] Maximum number of retry attempts
 * @param {number} [options.maxDelay=60000] Maximum acceptable retry_after wait in ms
 * @param {Function} [options.onRetry] Hook called before sleeping: (info) => void
 * @returns {Promise<any>}
 */
export async function executeWithRetry(callFn, options = {}) {
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
  const maxDelay = options.maxDelay !== undefined ? options.maxDelay : 60000;
  const onRetry = options.onRetry || null;

  let attempt = 0;
  while (true) {
    try {
      return await callFn();
    } catch (err) {
      attempt++;
      const errorCode = err?.errorCode || err?.code || (err?.response && err.response.status);
      const retryAfter = err?.retryAfter || err?.parameters?.retry_after;

      if (errorCode === 429 && typeof retryAfter === 'number' && attempt <= maxRetries) {
        const delayMs = retryAfter * 1000;

        if (delayMs <= maxDelay) {
          if (onRetry) {
            onRetry({
              attempt,
              maxRetries,
              retryAfter,
              delayMs,
              error: err,
            });
          }

          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }

      throw err;
    }
  }
}

/**
 * Wraps a Telegram API client with auto-retry on 429 flood wait errors.
 * 
 * @param {Record<string, any>} api
 * @param {Object} [options]
 * @returns {Record<string, any>}
 */
export function wrapApi(api, options = {}) {
  if (!api) return api;

  const originalCall = typeof api.call === 'function'
    ? api.call.bind(api)
    : (method, params) => api[method](params);

  const retryCall = async (method, params) => {
    return executeWithRetry(() => originalCall(method, params), options);
  };

  return new Proxy(api, {
    get(target, prop) {
      if (prop === 'call') {
        return retryCall;
      }
      if (typeof target[prop] === 'function') {
        return async (...args) => {
          return executeWithRetry(() => target[prop](...args), options);
        };
      }
      return target[prop];
    },
  });
}

/**
 * Middleware that equips ctx.call with automatic 429 flood wait retry.
 * 
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.maxDelay=60000]
 * @param {Function} [options.onRetry]
 * @returns {Function} Middleware function (ctx, next)
 */
export function autoRetry(options = {}) {
  return async function autoRetryMiddleware(ctx, next) {
    const originalCall = ctx.call.bind(ctx);

    ctx.call = async (method, params = {}) => {
      return executeWithRetry(() => originalCall(method, params), options);
    };

    if (ctx.api) {
      ctx.api = wrapApi(ctx.api, options);
    }

    return next();
  };
}
