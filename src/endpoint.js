/**
 * Gramless Mini App Endpoints & RPC Engine
 * 
 * Provides type-safe, validated RPC handlers for `tgcloud/endpoints/*.js`
 * with cryptographic user identity extraction and zero-dependency input validation.
 */

import { ValidationError, GramlessError } from './errors.js';

/**
 * Lightweight, zero-dependency schema validation engine.
 */
export const v = {
  string(options = {}) {
    return {
      type: 'string',
      validate(val, path) {
        if (typeof val !== 'string') {
          return [{ field: path, message: `Expected string, received ${typeof val}` }];
        }
        if (options.minLength !== undefined && val.length < options.minLength) {
          return [{ field: path, message: `Minimum length is ${options.minLength}` }];
        }
        if (options.maxLength !== undefined && val.length > options.maxLength) {
          return [{ field: path, message: `Maximum length is ${options.maxLength}` }];
        }
        if (options.pattern && !options.pattern.test(val)) {
          return [{ field: path, message: `String does not match required pattern` }];
        }
        return [];
      },
    };
  },

  number(options = {}) {
    return {
      type: 'number',
      validate(val, path) {
        if (typeof val !== 'number' || Number.isNaN(val)) {
          return [{ field: path, message: `Expected number, received ${typeof val}` }];
        }
        if (options.min !== undefined && val < options.min) {
          return [{ field: path, message: `Value must be at least ${options.min}` }];
        }
        if (options.max !== undefined && val > options.max) {
          return [{ field: path, message: `Value must be at most ${options.max}` }];
        }
        return [];
      },
    };
  },

  boolean() {
    return {
      type: 'boolean',
      validate(val, path) {
        if (typeof val !== 'boolean') {
          return [{ field: path, message: `Expected boolean, received ${typeof val}` }];
        }
        return [];
      },
    };
  },

  optional(innerValidator) {
    return {
      type: 'optional',
      validate(val, path) {
        if (val === undefined || val === null) return [];
        return innerValidator.validate(val, path);
      },
    };
  },

  array(elementValidator, options = {}) {
    return {
      type: 'array',
      validate(val, path) {
        if (!Array.isArray(val)) {
          return [{ field: path, message: `Expected array, received ${typeof val}` }];
        }
        if (options.minItems !== undefined && val.length < options.minItems) {
          return [{ field: path, message: `Minimum ${options.minItems} items required` }];
        }
        const issues = [];
        for (let i = 0; i < val.length; i++) {
          issues.push(...elementValidator.validate(val[i], `${path}[${i}]`));
        }
        return issues;
      },
    };
  },

  object(shape) {
    return {
      type: 'object',
      validate(val, path = '') {
        if (!val || typeof val !== 'object' || Array.isArray(val)) {
          return [{ field: path || 'root', message: `Expected object, received ${typeof val}` }];
        }
        const issues = [];
        for (const key of Object.keys(shape)) {
          const fieldPath = path ? `${path}.${key}` : key;
          const validator = shape[key];
          const fieldValue = val[key];
          issues.push(...validator.validate(fieldValue, fieldPath));
        }
        return issues;
      },
    };
  },
};

/**
 * Wraps an endpoint function with validation, auth checks, and standardized error responses.
 * 
 * @param {Object} config
 * @param {boolean} [config.requireAuth=true] Requires valid Telegram user in ctx.initData
 * @param {any} [config.schema] Input validation schema created with `v.object()`
 * @param {Function} handler The business logic: async (ctx) => result
 * @returns {Function} Standard TGCloud endpoint export: async (input, ctx) => response
 */
export function createEndpoint(config, handler) {
  // If only handler passed
  if (typeof config === 'function') {
    handler = config;
    config = {};
  }

  const requireAuth = config.requireAuth !== false; // default true
  const schema = config.schema || null;

  return async function endpointHandler(input = {}, ctx = {}) {
    try {
      // 1. Identity & Auth verification
      const user = ctx.initData?.user || null;
      if (requireAuth && !user) {
        return {
          ok: false,
          error: 'UNAUTHORIZED',
          message: 'Valid Telegram user credentials (initData) required',
        };
      }

      // 2. Input validation
      if (schema) {
        const issues = schema.validate(input);
        if (issues.length > 0) {
          return {
            ok: false,
            error: 'VALIDATION_ERROR',
            message: 'Invalid request payload',
            issues,
          };
        }
      }

      // 3. Prepare augmented endpoint context
      const endpointCtx = {
        input,
        user,
        initData: ctx.initData || {},
        rawCtx: ctx,
      };

      // 4. Execute handler
      const result = await handler(endpointCtx);

      // 5. Wrap response if not already enveloped
      if (result && typeof result === 'object' && ('ok' in result)) {
        return result;
      }
      return { ok: true, data: result };
    } catch (err) {
      if (err instanceof ValidationError) {
        return {
          ok: false,
          error: 'VALIDATION_ERROR',
          message: err.message,
          issues: err.issues,
        };
      }

      return {
        ok: false,
        error: 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred in endpoint',
      };
    }
  };
}
