import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

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
            .setRequired(false))),

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
        .setDescription('List all channel pairs'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
        .setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('results')
    .setDescription('Show weekly results (judges only)')
    .addChannelOption(option =>
      option.setName('monitored')
        .setDescription('Filter results by monitored channel (optional)')
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
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('week')
    .setDescription('Voting period management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close current voting period and stop accepting posts (Admin only)')
        .addChannelOption(option =>
          option.setName('monitored')
            .setDescription('Monitored channel to close period for (optional - closes all if not specified)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start a new voting period and begin accepting posts (Admin only)')
        .addChannelOption(option =>
          option.setName('monitored')
            .setDescription('Monitored channel to start period for (optional - starts for all if not specified)')
            .setRequired(false)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('results')
        .setDescription('Export results of the last closed week as CSV (Admin only)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('reset-database')
    .setDescription('⚠️ DANGER: Reset entire database and config (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
