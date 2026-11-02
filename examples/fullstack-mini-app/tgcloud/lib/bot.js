import { createBot } from 'gramless';

export const bot = createBot();

bot.command('start', async (ctx) => {
  await ctx.reply(`Welcome <b>${ctx.from?.first_name || 'Gamer'}</b>!\n\nTap below to play the Mini App:`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: 'Launch Mini App', webApp: 'https://app.tgcloud.ai/' }],
    ],
  });
});
