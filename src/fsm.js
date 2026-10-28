/**
 * Gramless Finite State Machine (FSM) & Conversation Scenes
 * 
 * Provides linear multi-step dialogue flows (wizards/scenes) with state persistence,
 * validation guards, and automatic cancellation handlers.
 */

import { GramlessError } from './errors.js';

export class FsmMachine {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.sessionProperty='_fsm'] Key inside ctx.session where FSM state lives
   * @param {string} [options.initialStep=null]
   */
  constructor(options = {}) {
    this.sessionProperty = options.sessionProperty || '_fsm';
    this.initialStep = options.initialStep || null;

    /** @type {Map<string, { handler: Function, guard?: Function }>} */
    this.steps = new Map();

    /** @type {Function|null} Called when user exits or cancels the flow */
    this.cancelHandler = null;

    /** @type {string|RegExp|null} Command or regex that aborts the flow (e.g. /cancel) */
    this.cancelTrigger = /^\/cancel$/i;
  }

  /**
   * Defines a step in the conversation state machine.
   * 
   * @param {string} stepName
   * @param {Function} handler async (ctx) => void
   * @param {Function} [guard] Optional predicate: async (ctx) => boolean
   * @returns {this}
   */
  step(stepName, handler, guard = null) {
    this.steps.set(stepName, { handler, guard });
    return this;
  }

  /**
   * Configures a custom trigger for cancelling the flow.
   * @param {string|RegExp} trigger
   * @param {Function} [onCancel]
   * @returns {this}
   */
  onCancel(trigger, onCancel = null) {
    this.cancelTrigger = trigger;
    if (onCancel) this.cancelHandler = onCancel;
    return this;
  }

  /**
   * Middleware that intercepts updates when a user is in an active FSM step.
   * @returns {Function}
   */
  middleware() {
    return async (ctx, next) => {
      if (!ctx.session) {
        throw new GramlessError('FSM requires session middleware to be installed before FSM middleware');
      }

      // Provide FSM control methods on context
      ctx.fsm = {
        /** Current active step name */
        get current() {
          return ctx.session[this.sessionProperty]?.step || null;
        },
        /** Stored conversation payload/data */
        get data() {
          if (!ctx.session[this.sessionProperty]) {
            ctx.session[this.sessionProperty] = { step: null, data: {} };
          }
          return ctx.session[this.sessionProperty].data;
        },
        /** Advance or transition to a specific step */
        goto: (stepName, payload = {}) => {
          if (!this.steps.has(stepName)) {
            throw new GramlessError(`Unknown FSM target step: "${stepName}"`);
          }
          ctx.session[this.sessionProperty] = {
            step: stepName,
            data: { ...(ctx.session[this.sessionProperty]?.data || {}), ...payload },
          };
        },
        /** Complete and exit the flow */
        complete: () => {
          delete ctx.session[this.sessionProperty];
        },
      };

      const currentState = ctx.session[this.sessionProperty];
      if (!currentState?.step) {
        // Not currently in an active conversation flow; proceed to normal routes
        return next();
      }

      // Check cancellation trigger
      if (this.cancelTrigger) {
        const text = ctx.text;
        const isCancel = this.cancelTrigger instanceof RegExp
          ? this.cancelTrigger.test(text)
          : text.toLowerCase() === this.cancelTrigger.toLowerCase();

        if (isCancel) {
          ctx.fsm.complete();
          if (this.cancelHandler) {
            await this.cancelHandler(ctx);
            return;
          }
          await ctx.reply('Operation cancelled.');
          return;
        }
      }

      const activeStep = this.steps.get(currentState.step);
      if (!activeStep) {
        // Stale or removed step; reset and proceed
        ctx.fsm.complete();
        return next();
      }

      // Check guard if present
      if (activeStep.guard) {
        const isValid = await activeStep.guard(ctx);
        if (!isValid) {
          // Guard rejected; do not advance or execute main step
          return;
        }
      }

      // Execute active step
      await activeStep.handler(ctx);
    };
  }
}

/**
 * Factory helper for creating an FsmMachine instance.
 * @param {Object} [options]
 * @returns {FsmMachine}
 */
export function createFSM(options) {
  return new FsmMachine(options);
}
