/**
 * Gramless: Safe Formatting & Entity Parser Engine
 * 
 * Provides zero-allocation HTML & MarkdownV2 escaping, tagged template
 * literals, and composable formatters to eliminate Telegram entity parse errors.
 * 
 * Engineered for V8 Isolates and TGCloud with 0 dependencies.
 */

const HTML_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

const HTML_RE = /[&<>"]/g;
const MD_V2_RE = /[_*[\]()~`>#+\-=|{}.!\\]/g;
const MD_V1_RE = /[_*`\[]/g;

/**
 * Wrapper for strings that should not be auto-escaped inside template literals.
 */
export class RawString {
  /**
   * @param {string} value
   */
  constructor(value) {
    this.value = String(value ?? '');
  }

  toString() {
    return this.value;
  }
}

/**
 * Marks a string as raw (will not be escaped inside html or md template tags).
 * @param {any} val
 * @returns {RawString}
 */
export function raw(val) {
  if (val instanceof RawString) return val;
  return new RawString(val);
}

/**
 * Escapes characters for Telegram HTML mode (&, <, >, ").
 * @param {any} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str.replace(HTML_RE, (char) => HTML_MAP[char]);
}

/**
 * Escapes reserved characters for Telegram MarkdownV2 mode.
 * Reserved: _ * [ ] ( ) ~ ` > # + - = | { } . ! \
 * @param {any} text
 * @returns {string}
 */
export function escapeMarkdown(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str.replace(MD_V2_RE, '\\$&');
}

/**
 * Escapes reserved characters for Telegram legacy Markdown mode.
 * Reserved: _ * ` [
 * @param {any} text
 * @returns {string}
 */
export function escapeMarkdownV1(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str.replace(MD_V1_RE, '\\$&');
}

/**
 * Tagged template literal for Telegram HTML.
 * Automatically escapes interpolated values unless wrapped in raw().
 * 
 * @example
 * const text = html`Hello <b>${user.name}</b>, your ID is <code>${user.id}</code>!`;
 */
export function html(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof RawString) {
        result += val.value;
      } else if (Array.isArray(val)) {
        result += val.map((v) => (v instanceof RawString ? v.value : escapeHtml(v))).join('');
      } else {
        result += escapeHtml(val);
      }
    }
  }
  return result;
}

/**
 * Tagged template literal for Telegram MarkdownV2.
 * Automatically escapes interpolated values unless wrapped in raw().
 * 
 * @example
 * const text = md`*Welcome* _${user.name}_ [link](${url})`;
 */
export function md(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof RawString) {
        result += val.value;
      } else if (Array.isArray(val)) {
        result += val.map((v) => (v instanceof RawString ? v.value : escapeMarkdown(v))).join('');
      } else {
        result += escapeMarkdown(val);
      }
    }
  }
  return result;
}

/**
 * Composable fluent formatter helper for Telegram HTML entities.
 */
export const fmt = {
  /**
   * Bold entity.
   * @param {any} text
   * @returns {RawString}
   */
  bold(text) {
    return new RawString(`<b>${escapeHtml(text)}</b>`);
  },

  /**
   * Italic entity.
   * @param {any} text
   * @returns {RawString}
   */
  italic(text) {
    return new RawString(`<i>${escapeHtml(text)}</i>`);
  },

  /**
   * Underline entity.
   * @param {any} text
   * @returns {RawString}
   */
  underline(text) {
    return new RawString(`<u>${escapeHtml(text)}</u>`);
  },

  /**
   * Strikethrough entity.
   * @param {any} text
   * @returns {RawString}
   */
  strikethrough(text) {
    return new RawString(`<s>${escapeHtml(text)}</s>`);
  },

  /**
   * Alias for strikethrough.
   * @param {any} text
   * @returns {RawString}
   */
  strike(text) {
    return fmt.strikethrough(text);
  },

  /**
   * Spoiler entity.
   * @param {any} text
   * @returns {RawString}
   */
  spoiler(text) {
    return new RawString(`<tg-spoiler>${escapeHtml(text)}</tg-spoiler>`);
  },

  /**
   * Inline code entity.
   * @param {any} text
   * @returns {RawString}
   */
  code(text) {
    return new RawString(`<code>${escapeHtml(text)}</code>`);
  },

  /**
   * Preformatted code block entity.
   * @param {any} text
   * @param {string} [language]
   * @returns {RawString}
   */
  pre(text, language = '') {
    if (language) {
      return new RawString(`<pre><code class="language-${escapeHtml(language)}">${escapeHtml(text)}</code></pre>`);
    }
    return new RawString(`<pre>${escapeHtml(text)}</pre>`);
  },

  /**
   * Inline URL link entity.
   * @param {any} text
   * @param {string} url
   * @returns {RawString}
   */
  link(text, url) {
    return new RawString(`<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`);
  },

  /**
   * User mention link entity.
   * @param {any} name
   * @param {number|string} userId
   * @returns {RawString}
   */
  mention(name, userId) {
    return new RawString(`<a href="tg://user?id=${userId}">${escapeHtml(name)}</a>`);
  },

  /**
   * Custom Telegram emoji entity.
   * @param {any} fallbackText
   * @param {string} emojiId
   * @returns {RawString}
   */
  customEmoji(fallbackText, emojiId) {
    return new RawString(`<tg-emoji emoji-id="${escapeHtml(emojiId)}">${escapeHtml(fallbackText)}</tg-emoji>`);
  },

  /**
   * Blockquote entity.
   * @param {any} text
   * @param {boolean} [expandable=false]
   * @returns {RawString}
   */
  blockquote(text, expandable = false) {
    if (expandable) {
      return new RawString(`<blockquote expandable>${escapeHtml(text)}</blockquote>`);
    }
    return new RawString(`<blockquote>${escapeHtml(text)}</blockquote>`);
  },
};

export default {
  html,
  md,
  fmt,
  raw,
  RawString,
  escapeHtml,
  escapeMarkdown,
  escapeMarkdownV1,
};
