import { createBot, type GramlessContext } from 'gramless';

export interface Env {
  BOT_TOKEN: string;
  TELEGRAM_SECRET_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const bot = createBot({
      token: env.BOT_TOKEN,
    });

    bot.command('start', async (bCtx: GramlessContext) => {
      await bCtx.reply(`Hello from <b>Cloudflare Workers (TypeScript)</b>!\n\nEdge colo: <code>${(request as any).cf?.colo || 'local'}</code>`, {
        parse_mode: 'HTML',
        buttons: [
          [{ text: 'Ping Edge', data: 'action:ping' }],
        ],
      });
    });

    bot.action('action:ping', async (bCtx: GramlessContext) => {
      await bCtx.answer({ text: 'Edge worker responsive' });
      await bCtx.edit('<b>Pong!</b> Response served from Cloudflare Workers edge isolate.', {
        parse_mode: 'HTML',
      });
    });

    return bot.fetch(request, env, ctx, {
      secretToken: env.TELEGRAM_SECRET_TOKEN,
    });
  },
};
