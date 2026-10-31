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
      const sessionProp = this.sessionProperty;
      ctx.fsm = {
        /** Whether user is in an active FSM conversation */
        get active() {
          return Boolean(ctx.session[sessionProp]?.step);
        },
        /** Current active step name */
        get current() {
          return ctx.session[sessionProp]?.step || null;
        },
        /** Stored conversation payload/data */
        get data() {
          if (!ctx.session[sessionProp]) {
            ctx.session[sessionProp] = { step: null, data: {}, history: [] };
          }
          return ctx.session[sessionProp].data;
        },
        /** Advance or transition to a specific step */
        goto: (stepName, payload = {}) => {
          if (!this.steps.has(stepName)) {
            throw new GramlessError(`Unknown FSM target step: "${stepName}"`);
          }
          const prev = ctx.session[sessionProp] || { step: null, data: {}, history: [] };
          const history = Array.isArray(prev.history) ? [...prev.history] : [];
          if (prev.step) history.push(prev.step);

          ctx.session[sessionProp] = {
            step: stepName,
            data: { ...prev.data, ...payload },
            history,
          };
        },
        /** Reverts to the previous step in history, returning true if succeeded */
        back: () => {
          const current = ctx.session[sessionProp];
          if (!current || !Array.isArray(current.history) || current.history.length === 0) {
            return false;
          }
          const prevStep = current.history.pop();
          current.step = prevStep;
          return true;
        },
        /** Complete and exit the flow */
        complete: () => {
          delete ctx.session[sessionProp];
        },
      };

      const currentState = ctx.session[this.sessionProperty];
      if (!currentState?.step) {
        // Not currently in an active conversation flow; proceed to normal routes
        return next();
      }

      // Check cancellation trigger
      if (this.cancelTrigger && (ctx.text || ctx.data)) {
        const val = ctx.text || ctx.data;
        const isCancel = this.cancelTrigger instanceof RegExp
          ? this.cancelTrigger.test(val)
          : val.toLowerCase() === this.cancelTrigger.toLowerCase();

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
