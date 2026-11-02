import { createBot, Filter } from 'gramless';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Error: BOT_TOKEN environment variable is required.');
  console.error('Usage: BOT_TOKEN="123456:ABC..." node index.js');
  process.exit(1);
}

const bot = createBot({ token });

bot.command('start', async (ctx) => {
  await ctx.reply(`Hello <b>${ctx.from?.first_name || 'there'}</b>!\n\nBot is running in long-polling mode.`, {
    parse_mode: 'HTML',
    buttons: [
      [{ text: 'Ping', data: 'action:ping' }],
      [{ text: 'Help', data: 'action:help' }],
    ],
  });
});

bot.action('action:ping', async (ctx) => {
  await ctx.answer('Pong!');
  await ctx.reply(`Pong! Server timestamp: <code>${new Date().toISOString()}</code>`, {
    parse_mode: 'HTML',
  });
});

bot.action('action:help', async (ctx) => {
  await ctx.answer();
  await ctx.edit('Available commands:\n/start - Start the bot\n/help - Show this message');
});

// Composable filter: matches photos sent in private chats
bot.on(Filter.all(Filter.private, Filter.hasPhoto), async (ctx) => {
  await ctx.reply('Photo received!');
});

// Graceful shutdown handling
process.once('SIGINT', () => {
  console.log('\nStopping polling...');
  bot.stop();
});
process.once('SIGTERM', () => {
  console.log('\nStopping polling...');
  bot.stop();
});

console.log('Starting Gramless long polling...');
await bot.start({
  dropPendingUpdates: true,
  allowedUpdates: ['message', 'callback_query'],
});
