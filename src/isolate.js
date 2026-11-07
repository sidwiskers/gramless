/**
 * Gramless Isolate-Native Runtime Primitives
 * 
 * Provides safe timer, delay, and execution primitives engineered for pure V8 isolates
 * (such as Telegram Serverless / TGCloud) where global `setTimeout` and `clearTimeout`
 * are not provided by the host environment.
 */

/**
 * Checks if the current execution environment is a sandboxed V8 isolate
 * without standard timer globals.
 * 
 * @returns {boolean}
 */
export function isIsolateRuntime() {
  return typeof setTimeout === 'undefined';
}

/**
 * Non-crashing delay primitive.
 * - In Node.js / browser / modern workers: uses setTimeout.
 * - In pure V8 isolates: leverages Atomics.wait on SharedArrayBuffer or a micro-yield loop.
 * 
 * @param {number} ms Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  if (ms <= 0) return Promise.resolve();

  // 1. Standard host environment with timer globals
  if (typeof setTimeout === 'function') {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 2. Pure V8 isolate with SharedArrayBuffer & Atomics support
  if (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof Atomics !== 'undefined' &&
    typeof Atomics.wait === 'function'
  ) {
    try {
      const int32 = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(int32, 0, 0, Math.min(ms, 10000));
      return Promise.resolve();
    } catch {
      // Atomics.wait disallowed or throws in current thread context
    }
  }

  // 3. Fallback synchronous yield loop for pure isolated runtimes
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Spin until wall-clock elapsed
  }
  return Promise.resolve();
}

/**
 * Safe setTimeout wrapper that does not throw ReferenceError in pure V8 isolates.
 * 
 * @param {Function} callback
 * @param {number} [ms=0]
 * @returns {any} Timer handle or null
 */
export function safeSetTimeout(callback, ms = 0) {
  if (typeof setTimeout === 'function') {
    return setTimeout(callback, ms);
  }

  // In isolate without timers, queue asynchronously via microtask
  let cancelled = false;
  const handle = { cancelled };

  Promise.resolve().then(() => {
    if (!handle.cancelled) {
      callback();
    }
  });

  return handle;
}

/**
 * Safe clearTimeout wrapper that accepts any handle or null.
 * 
 * @param {any} handle
 */
export function safeClearTimeout(handle) {
  if (!handle) return;
  if (typeof clearTimeout === 'function') {
    clearTimeout(handle);
  } else if (typeof handle === 'object' && handle !== null) {
    handle.cancelled = true;
  }
}

export default {
  sleep,
  safeSetTimeout,
  safeClearTimeout,
  isIsolateRuntime,
};
