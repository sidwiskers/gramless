/**
 * Gramless Composable Filters Engine
 * 
 * Provides zero-allocation, functional filter predicates.
 */

export const Filter = {
  /**
   * Logical AND: All predicates must return true.
   * @param {...Function} predicates
   * @returns {Function}
   */
  all(...predicates) {
    const fns = predicates.flat();
    return async function allFilter(ctx) {
      for (let i = 0; i < fns.length; i++) {
        const res = await fns[i](ctx);
        if (!res) return false;
      }
      return true;
    };
  },

  /**
   * Logical OR: At least one predicate must return true.
   * @param {...Function} predicates
   * @returns {Function}
   */
  any(...predicates) {
    const fns = predicates.flat();
    return async function anyFilter(ctx) {
      for (let i = 0; i < fns.length; i++) {
        const res = await fns[i](ctx);
        if (res) return true;
      }
      return false;
    };
  },

  /**
   * Logical NOT: Inverts a predicate.
   * @param {Function} predicate
   * @returns {Function}
   */
  not(predicate) {
    return async function notFilter(ctx) {
      return !(await predicate(ctx));
    };
  },

  // --- Chat Types ---

  /** Matches private 1-on-1 dialogues */
  private(ctx) {
    return ctx.isPrivate;
  },

  /** Matches groups and supergroups */
  group(ctx) {
    return ctx.isGroup;
  },

  /** Matches channels */
  channel(ctx) {
    return ctx.isChannel;
  },

  // --- Media & Content Types ---

  /** Matches messages with text or caption */
  hasText(ctx) {
    return Boolean(ctx.text && ctx.text.length > 0);
  },

  /** Matches messages with photos */
  hasPhoto(ctx) {
    return Boolean(ctx.raw.photo || ctx.message?.photo);
  },

  /** Matches messages with documents / files */
  hasDocument(ctx) {
    return Boolean(ctx.raw.document || ctx.message?.document);
  },

  /** Matches messages with audio files */
  hasAudio(ctx) {
    return Boolean(ctx.raw.audio || ctx.message?.audio);
  },

  /** Matches messages with voice notes */
  hasVoice(ctx) {
    return Boolean(ctx.raw.voice || ctx.message?.voice);
  },

  /** Matches messages with videos */
  hasVideo(ctx) {
    return Boolean(ctx.raw.video || ctx.message?.video);
  },

  /** Matches messages with video notes */
  hasVideoNote(ctx) {
    return Boolean(ctx.raw.video_note || ctx.message?.video_note);
  },

  /** Matches messages with stickers */
  hasSticker(ctx) {
    return Boolean(ctx.raw.sticker || ctx.message?.sticker);
  },

  /** Matches messages with GIF/animations */
  hasAnimation(ctx) {
    return Boolean(ctx.raw.animation || ctx.message?.animation);
  },

  /** Matches messages with shared locations */
  hasLocation(ctx) {
    return Boolean(ctx.raw.location || ctx.message?.location);
  },

  /** Matches messages with shared contacts */
  hasContact(ctx) {
    return Boolean(ctx.raw.contact || ctx.message?.contact);
  },

  /** Matches messages with polls */
  hasPoll(ctx) {
    return Boolean(ctx.raw.poll || ctx.message?.poll);
  },

  /** Matches messages with animated dice */
  hasDice(ctx) {
    return Boolean(ctx.raw.dice || ctx.message?.dice);
  },

  /** Matches callback query button interactions */
  isCallback(ctx) {
    return ctx.data !== null;
  },

  // --- Parameterized Filters ---

  /**
   * Matches text starting with a specific prefix.
   * @param {string} prefix
   * @returns {Function}
   */
  textPrefix(prefix) {
    return (ctx) => Boolean(ctx.text && ctx.text.startsWith(prefix));
  },

  /**
   * Matches text matching a regex pattern.
   * @param {RegExp} pattern
   * @returns {Function}
   */
  textMatches(pattern) {
    return (ctx) => Boolean(ctx.text && pattern.test(ctx.text));
  },

  /**
   * Matches only updates originating from specific user IDs.
   * @param {...number} userIds
   * @returns {Function}
   */
  fromUsers(...userIds) {
    const ids = new Set(userIds.flat());
    return (ctx) => ctx.userId !== null && ids.has(ctx.userId);
  },

  /**
   * Matches only updates originating from specific chat IDs.
   * @param {...(number|string)} chatIds
   * @returns {Function}
   */
  inChats(...chatIds) {
    const ids = new Set(chatIds.flat());
    return (ctx) => ctx.chatId !== null && ids.has(ctx.chatId);
  },
};

// Ergonomic shorthand aliases
Filter.text = Filter.hasText;
Filter.photo = Filter.hasPhoto;
Filter.document = Filter.hasDocument;
Filter.audio = Filter.hasAudio;
Filter.voice = Filter.hasVoice;
Filter.video = Filter.hasVideo;
Filter.videoNote = Filter.hasVideoNote;
Filter.sticker = Filter.hasSticker;
Filter.animation = Filter.hasAnimation;
Filter.location = Filter.hasLocation;
Filter.contact = Filter.hasContact;
Filter.poll = Filter.hasPoll;
Filter.dice = Filter.hasDice;
Filter.callback = Filter.isCallback;

