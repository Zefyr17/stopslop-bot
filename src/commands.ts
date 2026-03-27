import { REST, Routes, SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is working'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show bot usage guide and available commands'),

  new SlashCommandBuilder()
    .setName('config')
    .setDescription('View or configure server settings')
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Show current server configuration'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-mod-log')
        .setDescription('Set the mod log channel (Admin only)')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel for mod logs')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-admin-roles')
        .setDescription('Set admin roles for override commands (Admin only)')
        .addRoleOption(option =>
          option.setName('role1')
            .setDescription('First admin role')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role2')
            .setDescription('Second admin role')
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('role3')
            .setDescription('Third admin role')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-post-limit')
        .setDescription('Set the default weekly post limit per user (Admin only)')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of posts allowed per user per week')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10))),

  new SlashCommandBuilder()
    .setName('channel-pair')
    .setDescription('Manage monitored and shortlist channel pairs')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a monitored-shortlist channel pair')
        .addChannelOption(option =>
          option.setName('monitored')
            .setDescription('Channel to monitor for content submissions')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('shortlist')
            .setDescription('Channel where shortlisted content will be posted')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a channel pair')
        .addChannelOption(option =>
          option.setName('monitored')
            .setDescription('Monitored channel to remove')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all channel pairs')),

  new SlashCommandBuilder()
    .setName('set-voter-roles')
    .setDescription('Set roles allowed to vote')
    .addRoleOption(option =>
      option.setName('role1')
        .setDescription('First role')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role2')
        .setDescription('Second role')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('role3')
        .setDescription('Third role')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('set-judge-roles')
    .setDescription('Set roles allowed to judge')
    .addRoleOption(option =>
      option.setName('role1')
        .setDescription('First role')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role2')
        .setDescription('Second role')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('role3')
        .setDescription('Third role')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('set-unlimited-roles')
    .setDescription('Set roles that bypass weekly post limits (e.g. Singularity)')
    .addRoleOption(option =>
      option.setName('role1')
        .setDescription('First role')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role2')
        .setDescription('Second role')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('role3')
        .setDescription('Third role')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('set-thresholds')
    .setDescription('Set voting thresholds')
    .addIntegerOption(option =>
      option.setName('upvotes')
        .setDescription('Number of upvotes needed to shortlist')
        .setRequired(true)
        .setMinValue(1))
    .addIntegerOption(option =>
      option.setName('downvotes')
        .setDescription('Number of downvotes needed to reject')
        .setRequired(true)
        .setMinValue(1)),

  new SlashCommandBuilder()
    .setName('results')
    .setDescription('Show weekly results (judges only)')
    .addChannelOption(option =>
      option.setName('monitored')
        .setDescription('Filter results by monitored channel (optional)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('week_id')
        .setDescription('Week ID for closed weeks (visible in mod log)')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('post')
    .setDescription('Admin post management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('approve')
        .setDescription('Manually approve a post (Admin only)')
        .addStringOption(option =>
          option.setName('postid')
            .setDescription('The post ID to approve')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reject')
        .setDescription('Manually reject a post (Admin only)')
        .addStringOption(option =>
          option.setName('postid')
            .setDescription('The post ID to reject')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset_votes')
        .setDescription('Reset all votes for a post (Admin only)')
        .addStringOption(option =>
          option.setName('postid')
            .setDescription('The post ID to reset')
            .setRequired(true))),

  new SlashCommandBuilder()
    .setName('week')
    .setDescription('Voting period management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close current voting period and stop accepting posts (Admin only)')
        .addChannelOption(option =>
          option.setName('monitored')
            .setDescription('Monitored channel to close the voting period for')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start a new voting period and begin accepting posts (Admin only)')
        .addChannelOption(option =>
          option.setName('monitored')
            .setDescription('Monitored channel to start the voting period for')
            .setRequired(true))),

  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Ranking session management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Open ranking for judges to rate shortlisted content (Admin only)')
        .addChannelOption(option =>
          option.setName('monitored')
            .setDescription('Monitored channel to open ranking for (optional - opens for all if not specified)')
            .setRequired(false))),

  new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('logs')
        .setDescription('Export detailed rating logs for active week (Admin only)')
        .addChannelOption(option =>
          option.setName('monitored')
            .setDescription('Filter by monitored channel (optional)')
            .setRequired(false))),

  new SlashCommandBuilder()
    .setName('reset-database')
    .setDescription('⚠️ DANGER: Reset entire database and config (Admin only)'),

  new SlashCommandBuilder()
    .setName('watch-votes')
    .setDescription('Show all pending posts with voting details')
    .addChannelOption(option =>
      option.setName('monitored')
        .setDescription('Filter by monitored channel (optional)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number (10 posts per page)')
        .setRequired(false)
        .setMinValue(1)),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show voting statistics for current or past week')
    .addChannelOption(option =>
      option.setName('monitored')
        .setDescription('Filter by monitored channel (optional)')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to check voting stats for (default: voter roles from config)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('week_id')
        .setDescription('Week ID to view past stats (visible in mod log)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('period')
        .setDescription('View summary across all weeks in a period')
        .setRequired(false)
        .addChoices(
          { name: 'Last month', value: 'last_month' },
          { name: 'Last 2 months', value: 'last_2_months' },
        )),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View raffle ticket leaderboard')
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('Show raffle tickets leaderboard')),

  new SlashCommandBuilder()
    .setName('spam')
    .setDescription('Manage spam penalties')
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Check spam penalties for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset spam penalties for a user (Admin only)')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to reset penalties for')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant-slot')
        .setDescription('Give a user +1 post slot this week by removing one penalty (Admin only)')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to grant a slot to')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove spam penalty for a specific post (Admin only)')
        .addStringOption(option =>
          option.setName('post_id')
            .setDescription('Post ID to remove penalty for')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove-post')
        .setDescription('Remove a post from the database by ID (restores post slot)')
        .addStringOption(option =>
          option.setName('post_id')
            .setDescription('Post ID to remove (visible in /spam check)')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Show all users with active penalties and their posts'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear-link')
        .setDescription('Clear duplicate link block so a user can repost it in correct channel')
        .addStringOption(option =>
          option.setName('link')
            .setDescription('The link to unblock')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add-penalty')
        .setDescription('Manually add a spam penalty to a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to penalize')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to apply the penalty to')
            .setRequired(true))),

  new SlashCommandBuilder()
    .setName('weight')
    .setDescription('Manage x2 vote weight boosts')
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant')
        .setDescription('Grant x2 vote weight to a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to grant x2 weight to')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('revoke')
        .setDescription('Revoke x2 vote weight from a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to revoke x2 weight from')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all users with x2 vote weight')),

  new SlashCommandBuilder()
    .setName('raffle')
    .setDescription('Manage the weekly raffle system')
    .addSubcommand(subcommand =>
      subcommand
        .setName('draw')
        .setDescription('Draw 5 random raffle winners and award quality guard tickets (Admin only)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('badges')
        .setDescription('Show accumulated quality guard tickets and raffle wins')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check (leave empty to check yourself)')
            .setRequired(false))),
  new SlashCommandBuilder()
    .setName('parse-message')
    .setDescription('Parse @usernames + XP from pasted text and generate /give-xp commands')
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Paste the full announcement text with @usernames and XP amounts')
        .setRequired(true)),
].map(command => command.toJSON());

export async function registerCommands(clientId: string, token: string) {
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}
