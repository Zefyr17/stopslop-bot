import { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { guildConfigService } from './services/GuildConfigService';
import { postService } from './services/PostService';
import { voteService } from './services/VoteService';
import { ratingService } from './services/RatingService';
import { extractFirstLink } from './utils/linkDetector';
import { VoteType, PostStatus } from '@prisma/client';

export const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

bot.once(Events.ClientReady, async (client) => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  const guilds = await client.guilds.fetch();
  console.log(`Bot is in ${guilds.size} guild(s)`);

  for (const [guildId, guild] of guilds) {
    try {
      await guildConfigService.getOrCreateConfig(guildId);
      console.log(`Config ready for guild: ${guild.name} (${guildId})`);
    } catch (error) {
      console.error(`Failed to initialize config for guild ${guildId}:`, error);
    }
  }

  console.log('All guild configs initialized!');
});

bot.on(Events.GuildCreate, async (guild) => {
  console.log(`Bot joined new guild: ${guild.name} (${guild.id})`);
  try {
    await guildConfigService.getOrCreateConfig(guild.id);
    console.log(`Config created for new guild: ${guild.name}`);
  } catch (error) {
    console.error(`Failed to create config for guild ${guild.id}:`, error);
  }
});

bot.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildId = message.guildId!;

  if (message.content === '!ping') {
    await message.reply('Pong!');
    return;
  }

  if (message.content === '!config') {
    try {
      const config = await guildConfigService.getConfig(guildId);
      if (!config) {
        await message.reply('No config found. Creating default config...');
        await guildConfigService.getOrCreateConfig(guildId);
        return;
      }

      const configInfo = [
        '**Guild Configuration:**',
        `Monitored Channels: ${config.monitoredChannelIds.length > 0 ? config.monitoredChannelIds.map((id: string) => `<#${id}>`).join(', ') : 'None'}`,
        `Review Channel: ${config.reviewChannelId ? `<#${config.reviewChannelId}>` : 'Not set'}`,
        `Shortlist Channel: ${config.shortlistChannelId ? `<#${config.shortlistChannelId}>` : 'Not set'}`,
        `Voter Roles: ${config.voterRoleIds.length > 0 ? config.voterRoleIds.map((id: string) => `<@&${id}>`).join(', ') : 'None'}`,
        `Judge Roles: ${config.judgeRoleIds.length > 0 ? config.judgeRoleIds.map((id: string) => `<@&${id}>`).join(', ') : 'None'}`,
        `Upvote Threshold: ${config.upvoteThreshold}`,
        `Downvote Threshold: ${config.downvoteThreshold}`,
      ].join('\n');

      await message.reply(configInfo);
    } catch (error) {
      console.error('Error fetching config:', error);
      await message.reply('Failed to fetch configuration.');
    }
    return;
  }

  if (message.content === '!results') {
    try {
      const config = await guildConfigService.getConfig(guildId);
      if (!config) {
        await message.reply('Configuration not found.');
        return;
      }

      const member = await message.guild.members.fetch(message.author.id);
      const hasJudgeRole = config.judgeRoleIds.length === 0 ||
        config.judgeRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

      if (!hasJudgeRole) {
        await message.reply('❌ You do not have permission to view results.');
        return;
      }

      const activeWeek = await (await import('./services/WeekService')).weekService.getActiveWeek();
      const shortlistedPosts = await postService.getPostsByStatus(PostStatus.SHORTLISTED);
      const weekPosts = shortlistedPosts.filter(p => p.weekId === activeWeek.id);

      if (weekPosts.length === 0) {
        await message.reply('No shortlisted posts found for this week.');
        return;
      }

      const postsWithRatings = await Promise.all(
        weekPosts.map(async (post) => {
          const stats = await ratingService.getPostRatingStats(post.id);
          return {
            post,
            stats,
          };
        })
      );

      postsWithRatings.sort((a, b) => b.stats.averageRating - a.stats.averageRating);

      const medals = ['🥇', '🥈', '🥉'];
      const resultLines = postsWithRatings.map((item, index) => {
        const medal = medals[index] || `${index + 1}.`;
        const avgRating = item.stats.averageRating > 0 ? item.stats.averageRating.toFixed(2) : 'No ratings';
        const ratingCount = item.stats.totalRatings;
        return `${medal} **${avgRating} ⭐** (${ratingCount} rating${ratingCount !== 1 ? 's' : ''})\n${item.post.link}\nBy <@${item.post.authorId}>`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('🏆 Weekly Results')
        .setDescription(resultLines.join('\n\n'))
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching results:', error);
      await message.reply('Failed to fetch results.');
    }
    return;
  }

  try {
    const config = await guildConfigService.getConfig(guildId);
    if (!config) return;

    if (!config.monitoredChannelIds.includes(message.channelId)) {
      return;
    }

    const link = extractFirstLink(message.content);
    if (!link) return;

    console.log(`Detected link in monitored channel: ${link}`);

    const post = await postService.createPost({
      link,
      authorId: message.author.id,
      originalMessage: message.content,
    });

    console.log(`Created post ${post.id} for link: ${link}`);

    if (!config.reviewChannelId) {
      console.warn('Review channel not configured. Skipping repost.');
      return;
    }

    const reviewChannel = await message.guild.channels.fetch(config.reviewChannelId);
    if (!reviewChannel || !reviewChannel.isTextBased()) {
      console.error('Review channel not found or not text-based.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('New Content Submission')
      .setDescription(link)
      .addFields(
        { name: 'Author', value: `<@${message.author.id}>`, inline: true },
        { name: 'Status', value: 'PENDING', inline: true }
      )
      .setTimestamp();

    const upvoteButton = new ButtonBuilder()
      .setCustomId(`upvote_${post.id}`)
      .setLabel('👍 Upvote')
      .setStyle(ButtonStyle.Success);

    const downvoteButton = new ButtonBuilder()
      .setCustomId(`downvote_${post.id}`)
      .setLabel('👎 Downvote')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(upvoteButton, downvoteButton);

    const reviewMessage = await reviewChannel.send({
      embeds: [embed],
      components: [row],
    });

    await postService.updateReviewMessageId(post.id, reviewMessage.id);

    console.log(`Posted to review channel: ${reviewMessage.id}`);
  } catch (error) {
    console.error('Error processing message:', error);
  }
});

bot.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild) return;

  const guildId = interaction.guildId!;

  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction, guildId);
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId.startsWith('rate_')) {
      await handleRateButton(interaction, guildId);
      return;
    }

    if (!customId.startsWith('upvote_') && !customId.startsWith('downvote_')) {
      return;
    }

  try {
    const config = await guildConfigService.getConfig(guildId);
    if (!config) {
      await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasVoterRole = config.voterRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

    if (config.voterRoleIds.length > 0 && !hasVoterRole) {
      await interaction.reply({ content: '❌ You are not allowed to vote.', ephemeral: true });
      return;
    }

    const post = await postService.getPostByReviewMessageId(interaction.message.id);
    if (!post) {
      await interaction.reply({ content: 'Post not found.', ephemeral: true });
      return;
    }

    if (post.status !== PostStatus.PENDING) {
      await interaction.reply({ content: 'This post has already been decided.', ephemeral: true });
      return;
    }

    const hasVoted = await voteService.hasUserVoted(post.id, interaction.user.id);
    if (hasVoted) {
      await interaction.reply({ content: '❌ You already voted on this post.', ephemeral: true });
      return;
    }

    const voteType = customId.startsWith('upvote_') ? VoteType.UP : VoteType.DOWN;

    await voteService.recordVote(post.id, interaction.user.id, voteType);

    const voteCounts = await voteService.getVoteCounts(post.id);

    let statusChanged = false;
    let newStatus: PostStatus | null = null;

    if (voteCounts.downvotes >= config.downvoteThreshold) {
      await postService.updateStatus(post.id, PostStatus.REJECTED);
      newStatus = PostStatus.REJECTED;
      statusChanged = true;
    } else if (voteCounts.upvotes >= config.upvoteThreshold) {
      await postService.updateStatus(post.id, PostStatus.SHORTLISTED);
      newStatus = PostStatus.SHORTLISTED;
      statusChanged = true;
    }

    if (statusChanged && newStatus) {
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFields(
          { name: 'Author', value: `<@${post.authorId}>`, inline: true },
          { name: 'Status', value: newStatus, inline: true }
        );

      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`upvote_${post.id}`)
          .setLabel(`👍 Upvote (${voteCounts.upvotes})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`downvote_${post.id}`)
          .setLabel(`👎 Downvote (${voteCounts.downvotes})`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );

      await interaction.message.edit({
        embeds: [updatedEmbed],
        components: [disabledRow],
      });

      if (newStatus === PostStatus.SHORTLISTED && config.shortlistChannelId) {
        const shortlistChannel = await interaction.guild.channels.fetch(config.shortlistChannelId);
        if (shortlistChannel?.isTextBased()) {
          const shortlistEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('⭐ Shortlisted Content')
            .setDescription(post.link)
            .addFields(
              { name: 'Author', value: `<@${post.authorId}>`, inline: true },
              { name: 'Votes', value: `👍 ${voteCounts.upvotes} | 👎 ${voteCounts.downvotes}`, inline: true }
            )
            .setTimestamp();

          const rateButton = new ButtonBuilder()
            .setCustomId(`rate_${post.id}`)
            .setLabel('⭐ Rate (1-10)')
            .setStyle(ButtonStyle.Primary);

          const rateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(rateButton);

          await shortlistChannel.send({
            embeds: [shortlistEmbed],
            components: [rateRow]
          });
          console.log(`Posted to shortlist channel: ${post.id}`);
        }
      }

      await interaction.reply({
        content: `✅ Vote registered! Status changed to **${newStatus}**\n👍 ${voteCounts.upvotes} | 👎 ${voteCounts.downvotes}`,
        ephemeral: true,
      });
    } else {
      const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`upvote_${post.id}`)
          .setLabel(`👍 Upvote (${voteCounts.upvotes})`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`downvote_${post.id}`)
          .setLabel(`👎 Downvote (${voteCounts.downvotes})`)
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.message.edit({ components: [updatedRow] });

      await interaction.reply({
        content: `✅ Vote registered!\n👍 ${voteCounts.upvotes} | 👎 ${voteCounts.downvotes}`,
        ephemeral: true,
      });
    }
    } catch (error) {
      console.error('Error processing vote:', error);
      await interaction.reply({ content: 'Failed to process vote.', ephemeral: true });
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('rating_modal_')) {
      await handleRatingModalSubmit(interaction, guildId);
    }
  }
});

async function handleRateButton(interaction: ButtonInteraction, guildId: string) {
  try {
    const config = await guildConfigService.getConfig(guildId);
    if (!config) {
      await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
      return;
    }

    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const hasJudgeRole = config.judgeRoleIds.length === 0 ||
      config.judgeRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

    if (!hasJudgeRole) {
      await interaction.reply({ content: '❌ You are not allowed to rate posts.', ephemeral: true });
      return;
    }

    const postId = interaction.customId.replace('rate_', '');
    const post = await postService.getPostById(postId);

    if (!post) {
      await interaction.reply({ content: 'Post not found.', ephemeral: true });
      return;
    }

    if (post.status !== PostStatus.SHORTLISTED) {
      await interaction.reply({ content: 'Only shortlisted posts can be rated.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`rating_modal_${postId}`)
      .setTitle('Rate Content (1-10)');

    const ratingInput = new TextInputBuilder()
      .setCustomId('rating_score')
      .setLabel('Enter your rating (1-10)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1-10')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(2);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(ratingInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing rating modal:', error);
    await interaction.reply({ content: 'Failed to open rating modal.', ephemeral: true });
  }
}

async function handleRatingModalSubmit(interaction: any, guildId: string) {
  try {
    const postId = interaction.customId.replace('rating_modal_', '');
    const ratingInput = interaction.fields.getTextInputValue('rating_score');

    const score = parseInt(ratingInput, 10);

    if (isNaN(score) || score < 1 || score > 10) {
      await interaction.reply({ content: '❌ Invalid rating. Please enter a number between 1 and 10.', ephemeral: true });
      return;
    }

    await ratingService.upsertRating(postId, interaction.user.id, score);

    const stats = await ratingService.getPostRatingStats(postId);

    await interaction.reply({
      content: `✅ Rating saved: ${score}/10\nAverage rating: ${stats.averageRating.toFixed(2)} ⭐ (${stats.totalRatings} rating${stats.totalRatings !== 1 ? 's' : ''})`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error processing rating:', error);
    await interaction.reply({ content: 'Failed to save rating.', ephemeral: true });
  }
}

async function handleSlashCommand(interaction: ChatInputCommandInteraction, guildId: string) {
  const { commandName } = interaction;

  try {
    if (commandName === 'ping') {
      await interaction.reply('Pong!');
      return;
    }

    if (commandName === 'config') {
      const config = await guildConfigService.getConfig(guildId);
      if (!config) {
        await interaction.reply('No config found. Creating default config...');
        await guildConfigService.getOrCreateConfig(guildId);
        return;
      }

      const configInfo = [
        '**Guild Configuration:**',
        `Monitored Channels: ${config.monitoredChannelIds.length > 0 ? config.monitoredChannelIds.map((id: string) => `<#${id}>`).join(', ') : 'None'}`,
        `Review Channel: ${config.reviewChannelId ? `<#${config.reviewChannelId}>` : 'Not set'}`,
        `Shortlist Channel: ${config.shortlistChannelId ? `<#${config.shortlistChannelId}>` : 'Not set'}`,
        `Voter Roles: ${config.voterRoleIds.length > 0 ? config.voterRoleIds.map((id: string) => `<@&${id}>`).join(', ') : 'None'}`,
        `Judge Roles: ${config.judgeRoleIds.length > 0 ? config.judgeRoleIds.map((id: string) => `<@&${id}>`).join(', ') : 'None'}`,
        `Upvote Threshold: ${config.upvoteThreshold}`,
        `Downvote Threshold: ${config.downvoteThreshold}`,
      ].join('\n');

      await interaction.reply({ content: configInfo, ephemeral: true });
      return;
    }

    if (commandName === 'set-monitored') {
      const channel1 = interaction.options.getChannel('channel1', true);
      const channel2 = interaction.options.getChannel('channel2', false);
      const channel3 = interaction.options.getChannel('channel3', false);

      const channels = [channel1, channel2, channel3].filter(c => c !== null);

      if (!channels.every(c => c?.type === ChannelType.GuildText)) {
        await interaction.reply({ content: '❌ All channels must be text channels.', ephemeral: true });
        return;
      }

      const channelIds = channels.map(c => c!.id);
      await guildConfigService.setMonitoredChannels(guildId, channelIds);

      await interaction.reply({
        content: `✅ Monitored channels updated: ${channelIds.map(id => `<#${id}>`).join(', ')}`,
        ephemeral: true,
      });
      return;
    }

    if (commandName === 'set-review') {
      const channel = interaction.options.getChannel('channel', true);

      if (channel?.type !== ChannelType.GuildText) {
        await interaction.reply({ content: '❌ Channel must be a text channel.', ephemeral: true });
        return;
      }

      await guildConfigService.getOrCreateConfig(guildId);
      await guildConfigService.updateConfig(guildId, { reviewChannelId: channel.id });

      await interaction.reply({
        content: `✅ Review channel set to <#${channel.id}>`,
        ephemeral: true,
      });
      return;
    }

    if (commandName === 'set-shortlist') {
      const channel = interaction.options.getChannel('channel', true);

      if (channel?.type !== ChannelType.GuildText) {
        await interaction.reply({ content: '❌ Channel must be a text channel.', ephemeral: true });
        return;
      }

      await guildConfigService.updateConfig(guildId, { shortlistChannelId: channel.id });

      await interaction.reply({
        content: `✅ Shortlist channel set to <#${channel.id}>`,
        ephemeral: true,
      });
      return;
    }

    if (commandName === 'set-voter-roles') {
      const role1 = interaction.options.getRole('role1', true);
      const role2 = interaction.options.getRole('role2', false);
      const role3 = interaction.options.getRole('role3', false);

      const roles = [role1, role2, role3].filter(r => r !== null);
      const roleIds = roles.map(r => r!.id);

      await guildConfigService.setVoterRoles(guildId, roleIds);

      await interaction.reply({
        content: `✅ Voter roles updated: ${roleIds.map(id => `<@&${id}>`).join(', ')}`,
        ephemeral: true,
      });
      return;
    }

    if (commandName === 'set-judge-roles') {
      const role1 = interaction.options.getRole('role1', true);
      const role2 = interaction.options.getRole('role2', false);
      const role3 = interaction.options.getRole('role3', false);

      const roles = [role1, role2, role3].filter(r => r !== null);
      const roleIds = roles.map(r => r!.id);

      await guildConfigService.getOrCreateConfig(guildId);
      await guildConfigService.updateConfig(guildId, { judgeRoleIds: roleIds });

      await interaction.reply({
        content: `✅ Judge roles updated: ${roleIds.map(id => `<@&${id}>`).join(', ')}`,
        ephemeral: true,
      });
      return;
    }

    if (commandName === 'set-thresholds') {
      const upvotes = interaction.options.getInteger('upvotes', true);
      const downvotes = interaction.options.getInteger('downvotes', true);

      await guildConfigService.setThresholds(guildId, upvotes, downvotes);

      await interaction.reply({
        content: `✅ Thresholds updated: ${upvotes} upvotes, ${downvotes} downvotes`,
        ephemeral: true,
      });
      return;
    }

    if (commandName === 'results') {
      const config = await guildConfigService.getConfig(guildId);
      if (!config) {
        await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
        return;
      }

      const member = await interaction.guild!.members.fetch(interaction.user.id);
      const hasJudgeRole = config.judgeRoleIds.length === 0 ||
        config.judgeRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

      if (!hasJudgeRole) {
        await interaction.reply({ content: '❌ You do not have permission to view results.', ephemeral: true });
        return;
      }

      const activeWeek = await (await import('./services/WeekService')).weekService.getActiveWeek();
      const shortlistedPosts = await postService.getPostsByStatus(PostStatus.SHORTLISTED);
      const weekPosts = shortlistedPosts.filter(p => p.weekId === activeWeek.id);

      if (weekPosts.length === 0) {
        await interaction.reply({ content: 'No shortlisted posts found for this week.', ephemeral: true });
        return;
      }

      const postsWithRatings = await Promise.all(
        weekPosts.map(async (post) => {
          const stats = await ratingService.getPostRatingStats(post.id);
          return {
            post,
            stats,
          };
        })
      );

      postsWithRatings.sort((a, b) => b.stats.averageRating - a.stats.averageRating);

      const medals = ['🥇', '🥈', '🥉'];
      const resultLines = postsWithRatings.map((item, index) => {
        const medal = medals[index] || `${index + 1}.`;
        const avgRating = item.stats.averageRating > 0 ? item.stats.averageRating.toFixed(2) : 'No ratings';
        const ratingCount = item.stats.totalRatings;
        return `${medal} **${avgRating} ⭐** (${ratingCount} rating${ratingCount !== 1 ? 's' : ''})\n${item.post.link}\nBy <@${item.post.authorId}>`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('🏆 Weekly Results')
        .setDescription(resultLines.join('\n\n'))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }
  } catch (error) {
    console.error(`Error handling command ${commandName}:`, error);
    await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
  }
}
