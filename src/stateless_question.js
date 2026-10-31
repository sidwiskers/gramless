/**
 * Gramless Stateless Question Engine
 * 
 * Enables one-off questions with Telegram ForceReply without requiring
 * database sessions or complex state machines. Uses invisible zero-width
 * unicode tags so questions remain completely clean to the user.
 */

const TAG_START = '\u200B\u200C';
const TAG_END = '\u200C\u200B';

/**
 * Injects an invisible zero-width unicode tag into a text string.
 * @param {string} tag
 * @param {string} text
 * @returns {string}
 */
export function wrapQuestionText(tag, text) {
  return `${TAG_START}${tag}${TAG_END}${text}`;
}

/**
 * Extracts a hidden tag from question text.
 * @param {string} [text]
 * @returns {string|null}
 */
export function extractQuestionTag(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\u200B\u200C([^\u200C]+)\u200C\u200B/);
  return match ? match[1] : null;
}

export class StatelessQuestion {
  /**
   * @param {string} tag Unique question identifier
   * @param {Function} handler async (ctx) => void
   */
  constructor(tag, handler) {
    this.tag = tag;
    this.handler = handler;
  }

  /**
   * Sends the question message to the user with Telegram ForceReply.
   * 
   * @param {import('./context.js').GramlessContext} ctx
   * @param {string} text Question text shown to user
   * @param {Object} [options={}] Additional reply options
   * @returns {Promise<any>}
   */
  async reply(ctx, text, options = {}) {
    const tagged = wrapQuestionText(this.tag, text);
    return ctx.reply(tagged, {
      forceReply: true,
      placeholder: options.placeholder,
      selective: options.selective,
      ...options,
    });
  }

  /**
   * Middleware that intercepts replies to this question.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      const replyTo = ctx.message?.reply_to_message;
      if (!replyTo || !replyTo.text) {
        return next();
      }

      const tag = extractQuestionTag(replyTo.text);
      if (tag === this.tag) {
        ctx.questionTag = tag;
        await this.handler(ctx);
        return;
      }

      return next();
    };
  }
}

/**
 * Creates a stateless question instance.
 * 
 * @param {string} tag Unique question tag
 * @param {Function} handler async (ctx) => void
 * @returns {StatelessQuestion}
 */
export function createStatelessQuestion(tag, handler) {
  return new StatelessQuestion(tag, handler);
}
