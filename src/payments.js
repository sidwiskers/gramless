/**
 * Gramless Telegram Stars & Digital Payments Engine
 * 
 * Provides first-class support for Telegram Stars (XTR), invoice creation,
 * pre-checkout validation hooks, and successful payment settlement.
 */

export class StarsEngine {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.currency='XTR'] Currency code (default 'XTR' for Telegram Stars)
   */
  constructor(options = {}) {
    this.currency = options.currency || 'XTR';
    /** @type {Function|null} */
    this.preCheckoutHandler = null;
    /** @type {Array<{ payloadPattern?: string|RegExp, handler: Function }>} */
    this.successHandlers = [];
  }

  /**
   * Sends an invoice for Telegram Stars (XTR) or digital goods.
   * 
   * @param {import('./context.js').GramlessContext} ctx
   * @param {Object} invoice
   * @param {string} invoice.title Product title
   * @param {string} invoice.description Product description
   * @param {number} invoice.stars Number of Telegram Stars
   * @param {string} invoice.payload Bot-defined invoice payload
   * @param {string} [invoice.photoUrl] Optional product image URL
   * @param {Record<string, any>} [invoice.options] Additional Bot API parameters
   * @returns {Promise<any>}
   */
  async sendInvoice(ctx, invoice) {
    const chatId = ctx.chatId;
    const stars = Number(invoice.stars) || 1;

    const params = {
      chat_id: chatId,
      title: invoice.title,
      description: invoice.description,
      payload: invoice.payload || `stars_${Date.now()}`,
      currency: this.currency,
      prices: [{ label: invoice.title, amount: stars }],
      ...(invoice.options || {}),
    };

    if (invoice.photoUrl) {
      params.photo_url = invoice.photoUrl;
    }

    return ctx.call('sendInvoice', params);
  }

  /**
   * Generates a shareable Telegram Stars invoice link (t.me/$...).
   * 
   * @param {import('./context.js').GramlessContext} ctx
   * @param {Object} invoice
   * @param {string} invoice.title
   * @param {string} invoice.description
   * @param {number} invoice.stars
   * @param {string} invoice.payload
   * @returns {Promise<string>}
   */
  async createInvoiceLink(ctx, invoice) {
    const stars = Number(invoice.stars) || 1;
    const params = {
      title: invoice.title,
      description: invoice.description,
      payload: invoice.payload || `stars_${Date.now()}`,
      currency: this.currency,
      prices: [{ label: invoice.title, amount: stars }],
      ...(invoice.options || {}),
    };

    return ctx.call('createInvoiceLink', params);
  }

  /**
   * Registers a validation hook for incoming pre_checkout_query updates.
   * Must return true to accept, or a string/object describing error to decline.
   * 
   * @param {Function} validator async (ctx) => true | string | { ok: boolean, error?: string }
   * @returns {this}
   */
  onPreCheckout(validator) {
    this.preCheckoutHandler = validator;
    return this;
  }

  /**
   * Registers a handler for completed, successful payments.
   * 
   * @param {string|RegExp|Function} [filterOrHandler] Payload pattern or handler function
   * @param {Function} [handler] async (ctx, payment) => void
   * @returns {this}
   */
  onSuccess(filterOrHandler, handler) {
    if (typeof filterOrHandler === 'function') {
      this.successHandlers.push({ handler: filterOrHandler });
    } else {
      this.successHandlers.push({ payloadPattern: filterOrHandler, handler });
    }
    return this;
  }

  /**
   * Refunds a Telegram Star payment.
   * 
   * @param {import('./context.js').GramlessContext} ctx
   * @param {Object} params
   * @param {number} params.userId
   * @param {string} params.chargeId Telegram payment charge ID
   * @returns {Promise<boolean>}
   */
  async refund(ctx, { userId, chargeId }) {
    return ctx.call('refundStarPayment', {
      user_id: userId,
      telegram_payment_charge_id: chargeId,
    });
  }

  /**
   * Middleware that intercepts pre_checkout_query and successful_payment updates.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      // 1. Pre-checkout query hook
      const preCheckout = ctx.raw?.total_amount !== undefined && ctx.raw?.currency
        ? ctx.raw
        : ctx.update?.pre_checkout_query;

      if (preCheckout) {
        if (this.preCheckoutHandler) {
          const result = await this.preCheckoutHandler(ctx);
          if (result === true || result === undefined) {
            await ctx.answerPreCheckoutQuery(true);
            return;
          } else if (typeof result === 'string') {
            await ctx.answerPreCheckoutQuery(false, result);
            return;
          } else if (result && typeof result === 'object') {
            await ctx.answerPreCheckoutQuery(result.ok !== false, result.error || '');
            return;
          }
        } else {
          // Default accept
          await ctx.answerPreCheckoutQuery(true);
          return;
        }
      }

      // 2. Successful payment hook
      const payment = ctx.raw?.successful_payment || ctx.message?.successful_payment;
      if (payment) {
        ctx.payment = payment;
        const payload = payment.invoice_payload || '';

        for (let i = 0; i < this.successHandlers.length; i++) {
          const { payloadPattern, handler } = this.successHandlers[i];
          if (!payloadPattern) {
            await handler(ctx, payment);
            return;
          }

          if (payloadPattern instanceof RegExp && payloadPattern.test(payload)) {
            await handler(ctx, payment);
            return;
          }

          if (typeof payloadPattern === 'string' && payload === payloadPattern) {
            await handler(ctx, payment);
            return;
          }
        }
      }

      return next();
    };
  }
}

/**
 * Creates a Telegram Stars & Payments engine instance.
 * @param {Object} [options]
 * @returns {StarsEngine}
 */
export function createStarsEngine(options) {
  return new StarsEngine(options);
}
