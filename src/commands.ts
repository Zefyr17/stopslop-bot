import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is working'),

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
    .setName('set-monitored')
    .setDescription('Set channels to monitor for links')
    .addChannelOption(option =>
      option.setName('channel1')
        .setDescription('First channel')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel2')
        .setDescription('Second channel')
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('channel3')
        .setDescription('Third channel')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('set-review')
    .setDescription('Set the review channel for voting')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Review channel')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('set-shortlist')
    .setDescription('Set the shortlist channel for finalists')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Shortlist channel')
        .setRequired(true))
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
    .setDescription('Show weekly results (judges only)'),

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
    .setDescription('Week management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close current week and start a new one (Admin only)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('results')
        .setDescription('Export results of the last closed week as CSV (Admin only)'))
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
