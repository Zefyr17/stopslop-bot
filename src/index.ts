import 'dotenv/config';
import { bot } from './bot';
import { registerCommands } from './commands';

async function main() {
  try {
    console.log('Starting Discord bot...');
    console.log('Node version:', process.version);
    console.log('Environment:', process.env.NODE_ENV || 'development');

    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN not found in environment variables');
    }

    console.log('Token found, attempting login...');

    // Add timeout to login attempt
    const loginTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Login timeout after 30 seconds')), 30000)
    );

    await Promise.race([
      bot.login(token),
      loginTimeout
    ]);

    console.log('Bot successfully logged in!');

    const clientId = bot.user?.id;
    if (clientId) {
      console.log('Registering slash commands...');
      await registerCommands(clientId, token);
      console.log('Slash commands registered!');
    }
  } catch (error) {
    console.error('Failed to start bot:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

main();
