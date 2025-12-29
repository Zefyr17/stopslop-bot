import 'dotenv/config';
import { bot } from './bot';
import { registerCommands } from './commands';

async function main() {
  try {
    console.log('Starting Discord bot...');

    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN not found in environment variables');
    }

    await bot.login(token);
    console.log('Bot successfully logged in!');

    const clientId = bot.user?.id;
    if (clientId) {
      console.log('Registering slash commands...');
      await registerCommands(clientId, token);
      console.log('Slash commands registered!');
    }
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();
