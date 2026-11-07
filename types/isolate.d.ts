/**
 * TypeScript Type Definitions for Gramless Isolate Primitives
 */

export function isIsolateRuntime(): boolean;
export function sleep(ms: number): Promise<void>;
export function safeSetTimeout(callback: Function, ms?: number): any;
export function safeClearTimeout(handle: any): void;

declare const _default: {
  sleep: typeof sleep;
  safeSetTimeout: typeof safeSetTimeout;
  safeClearTimeout: typeof safeClearTimeout;
  isIsolateRuntime: typeof isIsolateRuntime;
};

export default _default;
