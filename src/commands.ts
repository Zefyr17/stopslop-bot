import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Проверка работы бота'),

  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Показать текущую конфигурацию сервера'),

  new SlashCommandBuilder()
    .setName('set-monitored')
    .setDescription('Установить каналы для отслеживания ссылок')
    .addChannelOption(option =>
      option.setName('channel1')
        .setDescription('Первый канал')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel2')
        .setDescription('Второй канал')
        .setRequired(false))
    .addChannelOption(option =>
      option.setName('channel3')
        .setDescription('Третий канал')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('set-review')
    .setDescription('Установить канал для голосования')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Канал для голосования')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('set-shortlist')
    .setDescription('Установить канал для финалистов')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Канал для финалистов')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('set-voter-roles')
    .setDescription('Установить роли для голосующих')
    .addRoleOption(option =>
      option.setName('role1')
        .setDescription('Первая роль')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role2')
        .setDescription('Вторая роль')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('role3')
        .setDescription('Третья роль')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('set-judge-roles')
    .setDescription('Установить роли для судей')
    .addRoleOption(option =>
      option.setName('role1')
        .setDescription('Первая роль')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role2')
        .setDescription('Вторая роль')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('role3')
        .setDescription('Третья роль')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('set-thresholds')
    .setDescription('Установить пороги голосов')
    .addIntegerOption(option =>
      option.setName('upvotes')
        .setDescription('Количество апвотов для попадания в шортлист')
        .setRequired(true)
        .setMinValue(1))
    .addIntegerOption(option =>
      option.setName('downvotes')
        .setDescription('Количество даунвотов для отклонения')
        .setRequired(true)
        .setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('results')
    .setDescription('Показать результаты недели (только для судей)'),
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
