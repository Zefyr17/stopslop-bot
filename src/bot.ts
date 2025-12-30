import { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, ChannelType, AttachmentBuilder } from 'discord.js';
import { guildConfigService } from './services/GuildConfigService';
import { postService } from './services/PostService';
import { voteService } from './services/VoteService';
import { ratingService } from './services/RatingService';
import { modLogService, ModLogEventType } from './services/ModLogService';
import { weekService } from './services/WeekService';
import { exportService } from './services/ExportService';
import { extractFirstLink } from './utils/linkDetector';
import { VoteType, PostStatus, WeekStatus } from '@prisma/client';

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

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Server Configuration')
        .setDescription('Current bot settings for this server')
        .addFields(
          {
            name: '📢 Monitored Channels',
            value: config.monitoredChannelIds.length > 0
              ? config.monitoredChannelIds.map((id: string) => `<#${id}>`).join(', ')
              : '*None set*',
            inline: false
          },
          {
            name: '📋 Review Channel',
            value: config.reviewChannelId ? `<#${config.reviewChannelId}>` : '*Not set*',
            inline: true
          },
          {
            name: '⭐ Shortlist Channel',
            value: config.shortlistChannelId ? `<#${config.shortlistChannelId}>` : '*Not set*',
            inline: true
          },
          {
            name: '📝 Mod Log Channel',
            value: config.modLogChannelId ? `<#${config.modLogChannelId}>` : '*Not set*',
            inline: true
          },
          {
            name: '👥 Voter Roles',
            value: config.voterRoleIds.length > 0
              ? config.voterRoleIds.map((id: string) => `<@&${id}>`).join(', ')
              : '*Everyone can vote*',
            inline: false
          },
          {
            name: '⭐ Judge Roles (CM)',
            value: config.judgeRoleIds.length > 0
              ? config.judgeRoleIds.map((id: string) => `<@&${id}>`).join(', ')
              : '*Everyone can judge*',
            inline: false
          },
          {
            name: '🔐 Admin Roles',
            value: config.adminRoleIds.length > 0
              ? config.adminRoleIds.map((id: string) => `<@&${id}>`).join(', ')
              : '*Not set (only Discord admins)*',
            inline: false
          },
          {
            name: '📊 Voting Thresholds',
            value: `👍 Not Slop: **${config.upvoteThreshold}**\n👎 Slop: **${config.downvoteThreshold}**`,
            inline: false
          }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
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

    // ===== TEST CASE: Duplicate Link Detection =====
    // Scenario 1: Same link with different UTM params should be detected as duplicate
    //   - Original: https://example.com/?utm_source=twitter
    //   - Duplicate: https://example.com/?utm_source=reddit
    //   - Expected: Message deleted, DM sent, channel notification, mod_log entry
    //
    // Scenario 2: Race condition - Two users post same link simultaneously
    //   - Expected: Unique constraint prevents duplicate creation, second user gets duplicate notification
    //
    // Scenario 3: User has DMs closed
    //   - Expected: DM silently fails, other actions continue normally
    //
    // Scenario 4: Different links should not be flagged
    //   - Original: https://example.com/video1
    //   - New: https://example.com/video2
    //   - Expected: Both posts created successfully
    const duplicatePost = await postService.findDuplicatePost(link);
    if (duplicatePost) {
      console.log(`Duplicate link detected: ${link} (original post: ${duplicatePost.id})`);

      // Delete the user's message
      try {
        await message.delete();
      } catch (error) {
        console.error('Failed to delete duplicate message:', error);
      }

      // Send DM to user
      try {
        await message.author.send(
          `Your message in **${message.guild?.name}** was deleted because it contained a link that was already posted.`
        );
      } catch (dmError) {
        console.log(`Could not DM user ${message.author.tag} about duplicate link (DMs might be closed)`);
      }

      // Note: We don't log duplicates to mod_log or send channel notifications to avoid spam

      return;
    }

    const post = await postService.createPost({
      link,
      authorId: message.author.id,
      originalMessage: message.content,
    });

    console.log(`Created post ${post.id} for link: ${link}`);

    const upvoteButton = new ButtonBuilder()
      .setCustomId(`upvote_${post.id}`)
      .setLabel('Not Slop (0)')
      .setStyle(ButtonStyle.Success);

    const downvoteButton = new ButtonBuilder()
      .setCustomId(`downvote_${post.id}`)
      .setLabel('Slop (0)')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(upvoteButton, downvoteButton);

    const reviewMessage = await message.reply({
      content: `Is this slop? Cast your vote for <@${message.author.id}>'s content below.`,
      components: [row],
      allowedMentions: { repliedUser: false },
    });

    await postService.updateReviewMessageId(post.id, reviewMessage.id);

    console.log(`Added voting buttons to message: ${reviewMessage.id}`);
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

    // Check if the week is closed
    const week = await weekService.getWeekById(post.weekId);
    if (week && week.status === WeekStatus.CLOSED) {
      await interaction.reply({ content: '❌ Cannot vote on posts from a closed week.', ephemeral: true });
      return;
    }

    if (post.status !== PostStatus.PENDING) {
      await interaction.reply({ content: 'This post has already been decided.', ephemeral: true });
      return;
    }

    // Check cooldown for vote changes
    const cooldownCheck = await voteService.canUserChangeVote(post.id, interaction.user.id, 20);
    if (!cooldownCheck.canChange) {
      await interaction.reply({
        content: `❌ You can change your vote again in ${cooldownCheck.secondsRemaining} second${cooldownCheck.secondsRemaining !== 1 ? 's' : ''}.`,
        ephemeral: true
      });
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

      const votersList = await voteService.getAllVotesWithUsers(post.id);

      await modLogService.log(guildId, ModLogEventType.POST_REJECTED_AUTO, {
        postId: post.id,
        postLink: post.link,
        authorId: post.authorId,
        votes: voteCounts,
        votersList,
      });
    } else if (voteCounts.upvotes >= config.upvoteThreshold) {
      await postService.updateStatus(post.id, PostStatus.SHORTLISTED);
      newStatus = PostStatus.SHORTLISTED;
      statusChanged = true;

      const votersList = await voteService.getAllVotesWithUsers(post.id);

      await modLogService.log(guildId, ModLogEventType.POST_SHORTLISTED_AUTO, {
        postId: post.id,
        postLink: post.link,
        authorId: post.authorId,
        votes: voteCounts,
        votersList,
      });
    }

    if (statusChanged && newStatus) {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`upvote_${post.id}`)
          .setLabel(`Not Slop (${voteCounts.upvotes})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`downvote_${post.id}`)
          .setLabel(`Slop (${voteCounts.downvotes})`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );

      await interaction.message.edit({
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

          // Create star rating buttons (1-10)
          const rateRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`rate_${post.id}_1`).setLabel('1⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_2`).setLabel('2⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_3`).setLabel('3⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_4`).setLabel('4⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_5`).setLabel('5⭐').setStyle(ButtonStyle.Secondary)
          );

          const rateRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`rate_${post.id}_6`).setLabel('6⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_7`).setLabel('7⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_8`).setLabel('8⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_9`).setLabel('9⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_10`).setLabel('10⭐').setStyle(ButtonStyle.Secondary)
          );

          await shortlistChannel.send({
            embeds: [shortlistEmbed],
            components: [rateRow1, rateRow2]
          });
          console.log(`Posted to shortlist channel: ${post.id}`);
        }
      }

      await interaction.deferUpdate();
    } else {
      const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`upvote_${post.id}`)
          .setLabel(`Not Slop (${voteCounts.upvotes})`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`downvote_${post.id}`)
          .setLabel(`Slop (${voteCounts.downvotes})`)
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.message.edit({ components: [updatedRow] });
      await interaction.deferUpdate();
    }
    } catch (error) {
      console.error('Error processing vote:', error);
      await interaction.reply({ content: 'Failed to process vote.', ephemeral: true });
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

    // Extract postId and rating from customId: rate_POSTID_RATING
    const parts = interaction.customId.split('_');
    if (parts.length < 3) {
      await interaction.reply({ content: '❌ Invalid button format.', ephemeral: true });
      return;
    }

    const rating = parseInt(parts[parts.length - 1], 10);
    const postId = parts.slice(1, -1).join('_'); // Handle post IDs that might contain underscores

    if (isNaN(rating) || rating < 1 || rating > 10) {
      await interaction.reply({ content: '❌ Invalid rating value.', ephemeral: true });
      return;
    }

    const post = await postService.getPostById(postId);

    if (!post) {
      await interaction.reply({ content: 'Post not found.', ephemeral: true });
      return;
    }

    // Check if the week is closed
    const week = await weekService.getWeekById(post.weekId);
    if (week && week.status === WeekStatus.CLOSED) {
      await interaction.reply({ content: '❌ Cannot rate posts from a closed week.', ephemeral: true });
      return;
    }

    if (post.status !== PostStatus.SHORTLISTED) {
      await interaction.reply({ content: 'Only shortlisted posts can be rated.', ephemeral: true });
      return;
    }

    // Save the rating
    await ratingService.upsertRating(postId, interaction.user.id, rating);

    await interaction.reply({
      content: `✅ Rating saved: ${rating}/10`,
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
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'show') {
        const config = await guildConfigService.getConfig(guildId);
        if (!config) {
          await interaction.reply({ content: 'No config found. Creating default config...', ephemeral: true });
          await guildConfigService.getOrCreateConfig(guildId);
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('⚙️ Server Configuration')
          .setDescription('Current bot settings for this server')
          .addFields(
            {
              name: '📢 Monitored Channels',
              value: config.monitoredChannelIds.length > 0
                ? config.monitoredChannelIds.map((id: string) => `<#${id}>`).join(', ')
                : '*None set*',
              inline: false
            },
            {
              name: '📋 Review Channel',
              value: config.reviewChannelId ? `<#${config.reviewChannelId}>` : '*Not set*',
              inline: true
            },
            {
              name: '⭐ Shortlist Channel',
              value: config.shortlistChannelId ? `<#${config.shortlistChannelId}>` : '*Not set*',
              inline: true
            },
            {
              name: '📝 Mod Log Channel',
              value: config.modLogChannelId ? `<#${config.modLogChannelId}>` : '*Not set*',
              inline: true
            },
            {
              name: '👥 Voter Roles',
              value: config.voterRoleIds.length > 0
                ? config.voterRoleIds.map((id: string) => `<@&${id}>`).join(', ')
                : '*Everyone can vote*',
              inline: false
            },
            {
              name: '⭐ Judge Roles (CM)',
              value: config.judgeRoleIds.length > 0
                ? config.judgeRoleIds.map((id: string) => `<@&${id}>`).join(', ')
                : '*Everyone can judge*',
              inline: false
            },
            {
              name: '🔐 Admin Roles',
              value: config.adminRoleIds.length > 0
                ? config.adminRoleIds.map((id: string) => `<@&${id}>`).join(', ')
                : '*Not set (only Discord admins)*',
              inline: false
            },
            {
              name: '📊 Voting Thresholds',
              value: `👍 Not Slop: **${config.upvoteThreshold}**\n👎 Slop: **${config.downvoteThreshold}**`,
              inline: false
            }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (subcommand === 'set-mod-log') {
        const channel = interaction.options.getChannel('channel', true);

        if (channel?.type !== ChannelType.GuildText) {
          await interaction.reply({ content: '❌ Channel must be a text channel.', ephemeral: true });
          return;
        }

        await guildConfigService.getOrCreateConfig(guildId);
        await guildConfigService.setModLogChannel(guildId, channel.id);

        await interaction.reply({
          content: `✅ Mod log channel set to <#${channel.id}>`,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === 'set-admin-roles') {
        const role1 = interaction.options.getRole('role1', true);
        const role2 = interaction.options.getRole('role2', false);
        const role3 = interaction.options.getRole('role3', false);

        const roles = [role1, role2, role3].filter(r => r !== null);
        const roleIds = roles.map(r => r!.id);

        await guildConfigService.getOrCreateConfig(guildId);
        await guildConfigService.setAdminRoles(guildId, roleIds);

        await interaction.reply({
          content: `✅ Admin roles updated: ${roleIds.map(id => `<@&${id}>`).join(', ')}\n\n**Note:** Admin roles can use /post approve/reject/reset_votes commands.`,
          ephemeral: true,
        });
        return;
      }
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

    if (commandName === 'post') {
      // ===== TEST CASE: Admin Override Commands =====
      // Scenario 1: Admin approves a PENDING post
      //   - Expected: Status → SHORTLISTED, buttons disabled, post in shortlist channel, mod_log entry
      //
      // Scenario 2: Admin rejects a PENDING post
      //   - Expected: Status → REJECTED, buttons disabled, mod_log entry
      //
      // Scenario 3: Admin tries to approve already SHORTLISTED post
      //   - Expected: Warning message, no changes
      //
      // Scenario 4: Non-admin user tries to use command
      //   - Expected: Permission denied message
      //
      // Scenario 5: CM (judge) uses admin override
      //   - Expected: Command works (CM has override permissions)
      const subcommand = interaction.options.getSubcommand();
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      const userRoleIds = Array.from(member.roles.cache.keys());

      const config = await guildConfigService.getConfig(guildId);
      if (!config) {
        await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
        return;
      }

      const isAdmin = await guildConfigService.isUserAdmin(guildId, userRoleIds);
      const isCM = config.judgeRoleIds.length === 0 ||
        config.judgeRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

      if (!isAdmin && !isCM) {
        await interaction.reply({ content: '❌ You do not have permission to use this command. (Admin or CM role required)', ephemeral: true });
        return;
      }

      const postId = interaction.options.getString('postid', true);
      const post = await postService.getPostById(postId);

      if (!post) {
        await interaction.reply({ content: '❌ Post not found.', ephemeral: true });
        return;
      }

      if (subcommand === 'approve') {
        const oldStatus = post.status;

        if (post.status === PostStatus.SHORTLISTED) {
          await interaction.reply({ content: '⚠️ This post is already shortlisted.', ephemeral: true });
          return;
        }

        await postService.updateStatus(postId, PostStatus.SHORTLISTED);

        // Update review message buttons if it exists
        if (post.reviewMessageId && config.monitoredChannelIds.length > 0) {
          try {
            const voteCounts = await voteService.getVoteCounts(postId);
            const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`upvote_${postId}`)
                .setLabel(`Not Slop (${voteCounts.upvotes})`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`downvote_${postId}`)
                .setLabel(`Slop (${voteCounts.downvotes})`)
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
            );

            // Try to find the review message in monitored channels
            for (const channelId of config.monitoredChannelIds) {
              try {
                const channel = await interaction.guild!.channels.fetch(channelId);
                if (channel?.isTextBased()) {
                  const reviewMessage = await channel.messages.fetch(post.reviewMessageId);
                  await reviewMessage.edit({ components: [disabledRow] });
                  break; // Found and updated, exit loop
                }
              } catch (err) {
                // Message not in this channel, try next
                continue;
              }
            }
          } catch (error) {
            console.error('Failed to disable buttons:', error);
          }
        }

        if (config.shortlistChannelId) {
          try {
            const shortlistChannel = await interaction.guild!.channels.fetch(config.shortlistChannelId);
            if (shortlistChannel?.isTextBased()) {
              const voteCounts = await voteService.getVoteCounts(postId);
              const shortlistEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('⭐ Shortlisted Content (Admin Override)')
                .setDescription(post.link)
                .addFields(
                  { name: 'Author', value: `<@${post.authorId}>`, inline: true },
                  { name: 'Votes', value: `👍 ${voteCounts.upvotes} | 👎 ${voteCounts.downvotes}`, inline: true }
                )
                .setTimestamp();

              // Create star rating buttons (1-10)
              const rateRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`rate_${postId}_1`).setLabel('1⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_${postId}_2`).setLabel('2⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_${postId}_3`).setLabel('3⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_${postId}_4`).setLabel('4⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_${postId}_5`).setLabel('5⭐').setStyle(ButtonStyle.Secondary)
              );

              const rateRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`rate_${postId}_6`).setLabel('6⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_${postId}_7`).setLabel('7⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_${postId}_8`).setLabel('8⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_${postId}_9`).setLabel('9⭐').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`rate_${postId}_10`).setLabel('10⭐').setStyle(ButtonStyle.Secondary)
              );

              await shortlistChannel.send({
                embeds: [shortlistEmbed],
                components: [rateRow1, rateRow2]
              });
            }
          } catch (error) {
            console.error('Failed to post to shortlist channel:', error);
          }
        }

        await modLogService.log(guildId, ModLogEventType.ADMIN_OVERRIDE_APPROVE, {
          postId: postId,
          postLink: post.link,
          authorId: post.authorId,
          adminId: interaction.user.id,
          oldStatus: oldStatus,
        });

        await interaction.reply({ content: `✅ Post approved and moved to shortlist.`, ephemeral: true });
        return;
      }

      if (subcommand === 'reject') {
        const oldStatus = post.status;

        if (post.status === PostStatus.REJECTED) {
          await interaction.reply({ content: '⚠️ This post is already rejected.', ephemeral: true });
          return;
        }

        await postService.updateStatus(postId, PostStatus.REJECTED);

        // Update review message buttons if it exists
        if (post.reviewMessageId && config.monitoredChannelIds.length > 0) {
          try {
            const voteCounts = await voteService.getVoteCounts(postId);
            const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`upvote_${postId}`)
                .setLabel(`Not Slop (${voteCounts.upvotes})`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`downvote_${postId}`)
                .setLabel(`Slop (${voteCounts.downvotes})`)
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
            );

            // Try to find the review message in monitored channels
            for (const channelId of config.monitoredChannelIds) {
              try {
                const channel = await interaction.guild!.channels.fetch(channelId);
                if (channel?.isTextBased()) {
                  const reviewMessage = await channel.messages.fetch(post.reviewMessageId);
                  await reviewMessage.edit({ components: [disabledRow] });
                  break; // Found and updated, exit loop
                }
              } catch (err) {
                // Message not in this channel, try next
                continue;
              }
            }
          } catch (error) {
            console.error('Failed to disable buttons:', error);
          }
        }

        await modLogService.log(guildId, ModLogEventType.ADMIN_OVERRIDE_REJECT, {
          postId: postId,
          postLink: post.link,
          authorId: post.authorId,
          adminId: interaction.user.id,
          oldStatus: oldStatus,
        });

        await interaction.reply({ content: `✅ Post rejected.`, ephemeral: true });
        return;
      }

      if (subcommand === 'reset_votes') {
        // ===== TEST CASE: Reset Votes =====
        // Scenario 1: Reset votes on REJECTED post with 10 downvotes
        //   - Expected: Status → PENDING, 10 votes deleted, buttons re-enabled, mod_log entry
        //
        // Scenario 2: Reset votes on SHORTLISTED post with 8 upvotes, 2 downvotes
        //   - Expected: Status → PENDING, 10 votes deleted, buttons show (0), mod_log shows previous votes
        //
        // Scenario 3: Reset votes on post that's already being voted on
        //   - Expected: Votes cleared mid-voting, users can vote again
        //
        // Scenario 4: Message not found (deleted manually)
        //   - Expected: Database updated, button update fails gracefully
        const oldStatus = post.status;
        const voteCounts = await voteService.getVoteCounts(postId);

        const deletedCount = await voteService.deleteAllVotesForPost(postId);
        await postService.updateStatus(postId, PostStatus.PENDING);

        // Update review message buttons if it exists
        if (post.reviewMessageId && config.monitoredChannelIds.length > 0) {
          try {
            const enabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`upvote_${postId}`)
                .setLabel('Not Slop (0)')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`downvote_${postId}`)
                .setLabel('Slop (0)')
                .setStyle(ButtonStyle.Danger)
            );

            // Try to find the review message in monitored channels
            for (const channelId of config.monitoredChannelIds) {
              try {
                const channel = await interaction.guild!.channels.fetch(channelId);
                if (channel?.isTextBased()) {
                  const reviewMessage = await channel.messages.fetch(post.reviewMessageId);
                  await reviewMessage.edit({ components: [enabledRow] });
                  break; // Found and updated, exit loop
                }
              } catch (err) {
                // Message not in this channel, try next
                continue;
              }
            }
          } catch (error) {
            console.error('Failed to re-enable buttons:', error);
          }
        }

        await modLogService.log(guildId, ModLogEventType.ADMIN_OVERRIDE_RESET, {
          postId: postId,
          postLink: post.link,
          authorId: post.authorId,
          adminId: interaction.user.id,
          oldStatus: oldStatus,
          details: `Deleted ${deletedCount} votes. Previous votes: 👍 ${voteCounts.upvotes} | 👎 ${voteCounts.downvotes}`,
        });

        await interaction.reply({ content: `✅ Post reset to PENDING. Deleted ${deletedCount} vote(s).`, ephemeral: true });
        return;
      }
    }

    if (commandName === 'week') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'close') {
        try {
          const member = await interaction.guild!.members.fetch(interaction.user.id);
          const userRoleIds = Array.from(member.roles.cache.keys());

          const config = await guildConfigService.getConfig(guildId);
          if (!config) {
            await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
            return;
          }

          const isAdmin = await guildConfigService.isUserAdmin(guildId, userRoleIds);

          if (!isAdmin) {
            await interaction.reply({ content: '❌ You do not have permission to close weeks. (Admin role required)', ephemeral: true });
            return;
          }

          // Check if there's already a closed week (prevent closing twice)
          const activeWeek = await weekService.getActiveWeek();
          const allPosts = await postService.getPostsByWeek(activeWeek.id);

          // Close the week
          const closedWeek = await weekService.closeActiveWeek();

          // Format dates for logging
          const startDate = closedWeek.startDate.toISOString().split('T')[0];
          const endDate = closedWeek.endDate.toISOString().split('T')[0];

          // Log to mod_log
          await modLogService.log(guildId, ModLogEventType.WEEK_CLOSED, {
            weekId: closedWeek.id,
            adminId: interaction.user.id,
            postsCount: allPosts.length,
            weekDates: `${startDate} to ${endDate}`,
            details: `Week closed by <@${interaction.user.id}>. A new active week has been created.`,
          });

          await interaction.reply({
            content: `✅ Week closed successfully.\n\n**Closed Week:** ${startDate} to ${endDate}\n**Total Posts:** ${allPosts.length}\n\nA new active week has been created.`,
            ephemeral: true,
          });
        } catch (error) {
          console.error('Error closing week:', error);
          await modLogService.log(guildId, ModLogEventType.BOT_ERROR, {
            error: 'Failed to close week',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
          await interaction.reply({ content: '❌ Failed to close week. Check mod log for details.', ephemeral: true });
        }
        return;
      }
    }

    if (commandName === 'export') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'results') {
        try {
          const member = await interaction.guild!.members.fetch(interaction.user.id);
          const userRoleIds = Array.from(member.roles.cache.keys());

          const config = await guildConfigService.getConfig(guildId);
          if (!config) {
            await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
            return;
          }

          const isAdmin = await guildConfigService.isUserAdmin(guildId, userRoleIds);
          const isCM = config.judgeRoleIds.length === 0 ||
            config.judgeRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

          if (!isAdmin && !isCM) {
            await interaction.reply({ content: '❌ You do not have permission to export results. (Admin or CM role required)', ephemeral: true });
            return;
          }

          // Get the last closed week
          const closedWeek = await weekService.getLastClosedWeek();
          if (!closedWeek) {
            await interaction.reply({ content: '❌ No closed weeks found. Please close a week first using /week close.', ephemeral: true });
            return;
          }

          // Get results for the closed week
          const results = await exportService.getWeekResults(closedWeek.id);

          if (results.length === 0) {
            await interaction.reply({ content: '❌ No shortlisted posts found in the last closed week.', ephemeral: true });
            return;
          }

          // Generate CSV
          const csvContent = exportService.generateCSV(results);
          const csvBuffer = exportService.createCSVBuffer(csvContent);

          // Create attachment
          const startDate = closedWeek.startDate.toISOString().split('T')[0];
          const endDate = closedWeek.endDate.toISOString().split('T')[0];
          const fileName = `results_${startDate}_to_${endDate}.csv`;

          const attachment = new AttachmentBuilder(csvBuffer, { name: fileName });

          // Log to mod_log
          await modLogService.log(guildId, ModLogEventType.EXPORT_RESULTS, {
            weekId: closedWeek.id,
            adminId: interaction.user.id,
            postsCount: results.length,
          });

          await interaction.reply({
            content: `📊 **Results Exported**\n\nWeek: ${startDate} to ${endDate}\nPosts: ${results.length}`,
            files: [attachment],
            ephemeral: true,
          });
        } catch (error) {
          console.error('Error exporting results:', error);
          await modLogService.log(guildId, ModLogEventType.BOT_ERROR, {
            error: 'Failed to export results',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
          await interaction.reply({ content: '❌ Failed to export results. Check mod log for details.', ephemeral: true });
        }
        return;
      }
    }
  } catch (error) {
    console.error(`Error handling command ${commandName}:`, error);
    await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
  }
}
