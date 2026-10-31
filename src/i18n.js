/**
 * Gramless Internationalization (i18n) Engine
 * 
 * Provides zero-dependency localization, dot-notation template interpolation,
 * and pluralization with zero runtime allocations.
 */

/**
 * Resolves a dot-delimited property path from a nested object.
 * @param {Record<string, any>} obj
 * @param {string} path
 * @returns {any}
 */
function resolvePath(obj, path) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (path in obj) return obj[path];

  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[parts[i]];
  }
  return current;
}

/**
 * Interpolates variables in a template string (e.g. "Hello, {name}!").
 * @param {string} template
 * @param {Record<string, any>} [params={}]
 * @returns {string}
 */
function interpolate(template, params = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Selects plural form based on count.
 * Supports:
 * - 2-pipe format: "singular | plural" (e.g. "{count} item | {count} items")
 * - 3-pipe format: "zero | singular | plural" (e.g. "No items | 1 item | {count} items")
 * - Object format: { zero: "...", one: "...", other: "..." }
 * 
 * @param {string|Record<string, string>} template
 * @param {number} count
 * @param {Record<string, any>} params
 * @returns {string}
 */
function pluralize(template, count, params) {
  if (typeof template === 'object' && template !== null) {
    if (count === 0 && template.zero) return interpolate(template.zero, params);
    if (count === 1 && template.one) return interpolate(template.one, params);
    if (template.other) return interpolate(template.other, params);
    return interpolate(Object.values(template)[0] || '', params);
  }

  if (typeof template === 'string') {
    if (!template.includes('|')) {
      return interpolate(template, params);
    }

    const parts = template.split('|').map(p => p.trim());
    if (parts.length === 2) {
      const selected = count === 1 ? parts[0] : parts[1];
      return interpolate(selected, params);
    } else if (parts.length >= 3) {
      let selected;
      if (count === 0) selected = parts[0];
      else if (count === 1) selected = parts[1];
      else selected = parts[2];
      return interpolate(selected, params);
    }
  }

  return '';
}

export class I18nEngine {
  /**
   * @param {Object} options
   * @param {string} [options.defaultLocale='en']
   * @param {Record<string, Record<string, any>>} [options.locales={}]
   * @param {Function} [options.resolveLocale]
   */
  constructor(options = {}) {
    this.defaultLocale = options.defaultLocale || 'en';
    this.locales = { ...(options.locales || {}) };
    this.resolveLocale = options.resolveLocale || ((ctx) => {
      return ctx.session?.lang || ctx.from?.language_code || this.defaultLocale;
    });
  }

  /**
   * Registers or extends translations for a given locale.
   * @param {string} locale
   * @param {Record<string, any>} data
   * @returns {this}
   */
  loadLocale(locale, data) {
    this.locales[locale] = {
      ...(this.locales[locale] || {}),
      ...data,
    };
    return this;
  }

  /**
   * Translates a key for a given locale with variable interpolation and pluralization.
   * 
   * @param {string} locale Target locale code (e.g. 'en', 'es', 'ru')
   * @param {string} key Dot-notated translation key
   * @param {Record<string, any>} [params={}] Interpolation arguments
   * @returns {string}
   */
  t(locale, key, params = {}) {
    const targetData = this.locales[locale];
    let template = targetData ? resolvePath(targetData, key) : undefined;

    // Fallback to default locale if missing
    if (template === undefined && locale !== this.defaultLocale) {
      const fallbackData = this.locales[this.defaultLocale];
      template = fallbackData ? resolvePath(fallbackData, key) : undefined;
    }

    if (template === undefined) {
      return key; // Missing translation fallback: return raw key
    }

    if (params && typeof params.count === 'number') {
      return pluralize(template, params.count, params);
    }

    if (typeof template === 'string') {
      return interpolate(template, params);
    }

    return String(template);
  }

  /**
   * Middleware that attaches `ctx.t()`, `ctx.locale`, and `ctx.setLocale()`.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      let currentLocale = this.resolveLocale(ctx) || this.defaultLocale;

      // Extract primary language tag if localized e.g. "en-US" -> "en" if "en-US" not found
      if (!this.locales[currentLocale] && currentLocale.includes('-')) {
        const base = currentLocale.split('-')[0];
        if (this.locales[base]) currentLocale = base;
      }

      ctx.locale = currentLocale;

      ctx.t = (key, params) => {
        return this.t(ctx.locale, key, params);
      };

      ctx.setLocale = (newLocale) => {
        ctx.locale = newLocale;
        if (ctx.session) {
          ctx.session.lang = newLocale;
        }
      };

      return next();
    };
  }
}

/**
 * Creates an internationalization engine instance.
 * @param {Object} [options]
 * @returns {I18nEngine}
 */
export function createI18n(options) {
  return new I18nEngine(options);
}
