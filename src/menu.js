/**
 * Gramless Interactive Menu & Pagination Engine
 * 
 * Provides declarative inline menus, paginated list generation with navigation buttons,
 * and zero-boilerplate list browsing.
 */

/**
 * Builds a paginated message and inline navigation keyboard.
 * 
 * @template T
 * @param {import('./context.js').GramlessContext} ctx
 * @param {Object} options
 * @param {T[]} options.items Full array of items to paginate
 * @param {number} [options.pageSize=5] Number of items per page
 * @param {number} [options.page=1] Current page (1-indexed)
 * @param {(item: T, pageIndex: number, globalIndex: number) => string} options.formatItem Formatter for each row
 * @param {string|((page: number, totalPages: number, count: number) => string)} [options.header] Optional header
 * @param {string|((page: number, totalPages: number, count: number) => string)} [options.footer] Optional footer
 * @param {string} [options.callbackPrefix='page:'] Prefix for pagination callback buttons
 * @param {(item: T, pageIndex: number, globalIndex: number) => any} [options.itemButtons] Row buttons for each item
 * @param {Array<Array<any>>} [options.extraButtons] Extra button rows below pagination controls
 * @param {string} [options.prevText='⬅️ Prev'] Text for previous button
 * @param {string} [options.nextText='Next ➡️'] Text for next button
 * @param {((page: number, totalPages: number) => string)} [options.pageText] Text for page indicator
 * @param {boolean} [options.editMessage] Whether to edit existing message (defaults to true if callback query)
 * @param {Record<string, any>} [options.replyOptions={}] Extra options passed to reply/edit
 * @returns {Promise<{ text: string, buttons: any[][], page: number, totalPages: number }>}
 */
export async function paginate(ctx, options) {
  const items = options.items || [];
  const pageSize = Math.max(1, options.pageSize || 5);
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.max(1, Math.min(Number(options.page) || 1, totalPages));

  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const currentItems = items.slice(startIndex, endIndex);

  // 1. Build text lines
  const lines = [];

  if (options.header) {
    const headerStr = typeof options.header === 'function'
      ? options.header(page, totalPages, totalCount)
      : options.header;
    if (headerStr) lines.push(headerStr);
  }

  if (currentItems.length === 0) {
    lines.push('<i>No items to display.</i>');
  } else {
    for (let i = 0; i < currentItems.length; i++) {
      const globalIdx = startIndex + i;
      const formatted = options.formatItem(currentItems[i], i, globalIdx);
      if (formatted) lines.push(formatted);
    }
  }

  if (options.footer) {
    const footerStr = typeof options.footer === 'function'
      ? options.footer(page, totalPages, totalCount)
      : options.footer;
    if (footerStr) lines.push(footerStr);
  }

  const messageText = lines.join('\n');

  // 2. Build keyboard
  const buttons = [];
  const prefix = options.callbackPrefix || 'page:';

  // Per-item buttons if provided
  if (options.itemButtons) {
    for (let i = 0; i < currentItems.length; i++) {
      const globalIdx = startIndex + i;
      const btn = options.itemButtons(currentItems[i], i, globalIdx);
      if (btn) {
        buttons.push(Array.isArray(btn) ? btn : [btn]);
      }
    }
  }

  // Navigation row (only show if multiple pages or explicitly requested)
  if (totalPages > 1 || options.alwaysShowControls) {
    const navRow = [];
    const prevText = options.prevText || '⬅️ Prev';
    const nextText = options.nextText || 'Next ➡️';
    const pageTextFn = options.pageText || ((p, t) => `${p}/${t}`);

    if (page > 1) {
      navRow.push({ text: prevText, data: `${prefix}${page - 1}` });
    } else {
      navRow.push({ text: '·', data: `${prefix}noop` });
    }

    navRow.push({ text: pageTextFn(page, totalPages), data: `${prefix}noop` });

    if (page < totalPages) {
      navRow.push({ text: nextText, data: `${prefix}${page + 1}` });
    } else {
      navRow.push({ text: '·', data: `${prefix}noop` });
    }

    buttons.push(navRow);
  }

  // Extra action buttons below navigation
  if (Array.isArray(options.extraButtons)) {
    buttons.push(...options.extraButtons);
  }

  const editMessage = options.editMessage !== undefined
    ? options.editMessage
    : (ctx.data !== null);

  const payload = {
    buttons,
    parse_mode: 'HTML',
    ...(options.replyOptions || {}),
  };

  if (editMessage) {
    try {
      await ctx.edit(messageText, payload);
    } catch (err) {
      // If message is unchanged or too old, fall back to reply
      if (err?.description && err.description.includes('message is not modified')) {
        await ctx.answer?.();
      } else {
        await ctx.reply(messageText, payload);
      }
    }
  } else {
    await ctx.reply(messageText, payload);
  }

  return {
    text: messageText,
    buttons,
    page,
    totalPages,
    totalCount,
  };
}

/**
 * Fluent inline menu builder.
 */
export class Menu {
  /**
   * @param {string} id Unique menu identifier
   */
  constructor(id) {
    this.id = id;
    this.rows = [[]];
    this.handlers = new Map();
  }

  /**
   * Appends an interactive callback button to current row.
   * 
   * @param {string} text Button label
   * @param {Function} handler Click handler: async (ctx) => void
   * @param {string} [actionId] Custom action identifier
   * @returns {this}
   */
  text(text, handler, actionId = null) {
    const action = actionId || `${this.id}:${this.handlers.size}`;
    const currentRow = this.rows[this.rows.length - 1];
    currentRow.push({ text, data: action });
    this.handlers.set(action, handler);
    return this;
  }

  /**
   * Appends an external URL button.
   * @param {string} text
   * @param {string} url
   * @returns {this}
   */
  url(text, url) {
    const currentRow = this.rows[this.rows.length - 1];
    currentRow.push({ text, url });
    return this;
  }

  /**
   * Appends a Telegram Web App button.
   * @param {string} text
   * @param {string} url
   * @returns {this}
   */
  webApp(text, url) {
    const currentRow = this.rows[this.rows.length - 1];
    currentRow.push({ text, webApp: url });
    return this;
  }

  /**
   * Starts a new row of buttons.
   * @returns {this}
   */
  row() {
    if (this.rows[this.rows.length - 1].length > 0) {
      this.rows.push([]);
    }
    return this;
  }

  /**
   * Exports the generated buttons array for use in ctx.reply({ buttons }).
   * @returns {Array<Array<any>>}
   */
  build() {
    return this.rows.filter(r => r.length > 0);
  }

  /**
   * Registers all menu handlers on a GramlessRouter instance.
   * @param {import('./router.js').GramlessRouter} router
   * @returns {this}
   */
  register(router) {
    for (const [action, handler] of this.handlers.entries()) {
      router.action(action, async (ctx) => {
        await ctx.answer?.();
        await handler(ctx);
      });
    }
    return this;
  }
}
