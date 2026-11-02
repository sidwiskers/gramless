import { createBot } from 'gramless';

export default {
  async fetch(request, env, ctx) {
    const bot = createBot({
      token: env.BOT_TOKEN,
    });

    bot.command('start', async (bCtx) => {
      await bCtx.reply(`Hello from <b>Cloudflare Workers</b>!\n\nEdge colo: <code>${request.cf?.colo || 'local'}</code>`, {
        parse_mode: 'HTML',
        buttons: [
          [{ text: 'Ping Edge', data: 'action:ping' }],
        ],
      });
    });

    bot.action('action:ping', async (bCtx) => {
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
