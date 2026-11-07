/**
 * TypeScript Type Definitions for Gramless Batch Engine
 */

import type { GramlessContext, MiddlewareFunction } from './index.js';

export interface BatchJobOptions<T = any> {
  name: string;
  chunkSize?: number;
  timeBudgetMs?: number;
  processItem: (item: T, ctx: GramlessContext, state: Record<string, any>) => Promise<any> | any;
  onProgress?: (info: { cursor: number; total: number; state: Record<string, any>; itemsProcessed: number }, ctx: GramlessContext) => Promise<void> | void;
  onComplete?: (summary: { total: number; state: Record<string, any> }, ctx: GramlessContext) => Promise<void> | void;
  actionPrefix?: string;
  sessionKey?: string;
}

export class BatchJob<T = any> {
  name: string;
  chunkSize: number;
  timeBudgetMs: number;
  processItem: (item: T, ctx: GramlessContext, state: Record<string, any>) => Promise<any> | any;
  onProgress: ((info: { cursor: number; total: number; state: Record<string, any>; itemsProcessed: number }, ctx: GramlessContext) => Promise<void> | void) | null;
  onComplete: ((summary: { total: number; state: Record<string, any> }, ctx: GramlessContext) => Promise<void> | void) | null;
  actionPrefix: string;
  sessionKey: string;

  constructor(options: BatchJobOptions<T>);

  createContinuationMarkup(
    cursor: number,
    total: number,
    options?: { label?: string }
  ): { inline_keyboard: Array<Array<Record<string, any>>> };

  run(
    items: T[],
    ctx: GramlessContext,
    initialCursor?: number | null
  ): Promise<{ completed: boolean; cursor: number; total: number; state: Record<string, any> }>;

  middleware(
    itemsResolver?: ((ctx: GramlessContext) => Promise<T[]> | T[]) | null
  ): (ctx: GramlessContext) => Promise<any>;
}

export function createBatchJob<T = any>(options: BatchJobOptions<T>): BatchJob<T>;

declare const _default: {
  BatchJob: typeof BatchJob;
  createBatchJob: typeof createBatchJob;
};

export default _default;
