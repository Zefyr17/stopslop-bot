import 'dotenv/config';
import { bot } from './bot';

async function main() {
  try {
    console.log('Starting Discord bot...');
    await bot.login(process.env.DISCORD_TOKEN);
    console.log('Bot successfully logged in!');
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();
