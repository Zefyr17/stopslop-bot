import { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, ChannelType, AttachmentBuilder } from 'discord.js';
import { guildConfigService } from './services/GuildConfigService';
import { postService } from './services/PostService';
import { voteService } from './services/VoteService';
import { ratingService } from './services/RatingService';
import { modLogService, ModLogEventType } from './services/ModLogService';
import { weekService } from './services/WeekService';
import { voterStatsService } from './services/VoterStatsService';
import { spamPenaltyService } from './services/SpamPenaltyService';
import { weightBoostService } from './services/WeightBoostService';
import { extractFirstLink } from './utils/linkDetector';
import { VoteType, PostStatus, WeekStatus } from '@prisma/client';
import { prisma } from './db';

export const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  ws: {
    large_threshold: 50,
  },
  rest: {
    timeout: 60000, // 60 seconds
  },
});

// Add debug event listeners - log everything in production
bot.on('debug', (info) => {
  console.log('[Discord Debug]', info);
});

bot.on('warn', (info) => {
  console.warn('[Discord Warn]', info);
});

bot.on('error', (error) => {
  console.error('[Discord Error]', error);
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

      const { channelPairService } = await import('./services/ChannelPairService');
      const pairs = await channelPairService.getChannelPairs(guildId);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Server Configuration')
        .setDescription('Current bot settings for this server')
        .addFields(
          {
            name: '📢 Channel Pairs',
            value: pairs.length > 0
              ? pairs.map(pair => `<#${pair.monitoredChannelId}> → <#${pair.shortlistChannelId}>`).join('\n')
              : '*None set*\nUse `/channel-pair add` to create pairs.',
            inline: false
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
            value: `👍 Yes: **${config.upvoteThreshold}**\n👎 No: **${config.downvoteThreshold}**`,
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
      if (!activeWeek) {
        await message.reply('No active voting period. Use `/week start` to begin accepting posts.');
        return;
      }
      const shortlistedPosts = await postService.getPostsByStatus(PostStatus.SHORTLISTED);
      const weekPosts = shortlistedPosts.filter(p => p.weekId === activeWeek.id);

      if (weekPosts.length === 0) {
        await message.reply('No shortlisted posts found for this week.');
        return;
      }

      // Fetch all ratings in a single query to avoid N+1 problem
      const postIds = weekPosts.map(p => p.id);
      const statsMap = await ratingService.getBulkPostRatingStats(postIds);

      const postsWithRatings = weekPosts.map((post) => {
        const stats = statsMap.get(post.id) || {
          postId: post.id,
          averageRating: 0,
          totalRatings: 0,
        };
        return {
          post,
          stats,
        };
      });

      postsWithRatings.sort((a, b) => b.stats.averageRating - a.stats.averageRating);

      const medals = ['🥇', '🥈', '🥉'];
      const resultLines = postsWithRatings.map((item, index) => {
        const medal = medals[index] || `${index + 1}.`;
        const avgRating = item.stats.averageRating > 0 ? item.stats.averageRating.toFixed(2) : 'No ratings';
        const ratingCount = item.stats.totalRatings;
        return `${medal} **${avgRating} ⭐** (${ratingCount} rating${ratingCount !== 1 ? 's' : ''})\n${item.post.link}\nBy <@${item.post.authorId}>`;
      });

      // Split into multiple embeds if needed (Discord limit: 4096 chars per embed description)
      const embeds: EmbedBuilder[] = [];
      let currentLines: string[] = [];
      let currentLength = 0;
      const MAX_LENGTH = 4000; // Leave some buffer

      for (const line of resultLines) {
        const lineLength = line.length + 2; // +2 for double newline separator

        if (currentLength + lineLength > MAX_LENGTH && currentLines.length > 0) {
          // Create embed with current lines
          const embed = new EmbedBuilder()
            .setColor(0xffd700)
            .setDescription(currentLines.join('\n\n'))
            .setTimestamp();

          if (embeds.length === 0) {
            embed.setTitle('🏆 Weekly Results');
          }

          embeds.push(embed);
          currentLines = [];
          currentLength = 0;
        }

        currentLines.push(line);
        currentLength += lineLength;
      }

      // Add remaining lines
      if (currentLines.length > 0) {
        const embed = new EmbedBuilder()
          .setColor(0xffd700)
          .setDescription(currentLines.join('\n\n'))
          .setTimestamp();

        if (embeds.length === 0) {
          embed.setTitle('🏆 Weekly Results');
        }

        embeds.push(embed);
      }

      await message.reply({ embeds });
    } catch (error) {
      console.error('Error fetching results:', error);
      await message.reply('Failed to fetch results.');
    }
    return;
  }

  try {
    const config = await guildConfigService.getConfig(guildId);
    if (!config) return;

    // Check if this channel is monitored using channel pairs
    const { channelPairService } = await import('./services/ChannelPairService');
    const isMonitored = await channelPairService.isMonitoredChannel(guildId, message.channelId);
    if (!isMonitored) {
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
        console.log(`Deleted duplicate message from ${message.author.tag} in channel ${message.channelId}`);
      } catch (error) {
        console.error('Failed to delete duplicate message:', error);
        console.error('Bot may be missing MANAGE_MESSAGES permission in this channel');
      }

      // Send DM to user
      try {
        await message.author.send(
          `Your message in **${message.guild?.name}** was deleted because it contained a link that was already posted.\n\nOriginal post: <https://discord.com/channels/${message.guildId}/${duplicatePost.monitoredChannelId}/${duplicatePost.reviewMessageId}>`
        );
      } catch (dmError) {
        console.log(`Could not DM user ${message.author.tag} about duplicate link (DMs might be closed)`);
      }

      // Log to mod_log
      await modLogService.log(guildId, ModLogEventType.DUPLICATE_LINK_DELETED, {
        postLink: link,
        authorId: message.author.id,
        monitoredChannelId: message.channelId,
        details: `User <@${message.author.id}> posted a duplicate link. Original post by <@${duplicatePost.authorId}>.`,
      });

      return;
    }

    // Check spam penalty post limit (per channel)
    const postLimitCheck = await spamPenaltyService.canUserPost(
      message.author.id,
      guildId,
      message.channelId,
      config.defaultPostLimit
    );

    if (!postLimitCheck.canPost) {
      console.log(`[SpamPenalty] User ${message.author.id} blocked from posting in ${message.channelId}. Limit: ${postLimitCheck.limit}, Current: ${postLimitCheck.currentCount}`);

      // Get current week penalties to show impact on next week
      const currentWeekPenalties = await spamPenaltyService.getCurrentWeekPenalties(message.author.id, guildId, message.channelId);
      const nextWeekLimit = Math.max(1, config.defaultPostLimit - currentWeekPenalties);

      // Reply to the message instead of deleting
      try {
        let replyText = `🚫 **Post limit reached.**\n\nYou've already posted **${postLimitCheck.currentCount}/${postLimitCheck.limit}** this week.`;

        if (postLimitCheck.penaltiesFromLastWeek > 0) {
          replyText += `\nYou have **${postLimitCheck.limit}** post slot${postLimitCheck.limit === 1 ? '' : 's'} this week because some of your posts didn't receive enough positive votes last week.`;

          if (currentWeekPenalties === 0) {
            replyText += `\n\n✅ Next week your post limit will be back to **${config.defaultPostLimit}/${config.defaultPostLimit}**.`;
          }
        }

        if (currentWeekPenalties > 0) {
          replyText += `\n\n⚠️ Next week your post limit will be **${nextWeekLimit}/${config.defaultPostLimit}** because **${currentWeekPenalties}** of your post${currentWeekPenalties === 1 ? '' : 's'} didn't receive enough positive votes.`;
        }

        await message.reply(replyText);
      } catch (replyError) {
        console.error('Failed to reply to spam-blocked message:', replyError);
      }

      // Log to mod_log
      await modLogService.log(guildId, ModLogEventType.POST_BLOCKED_SPAM, {
        oderId: message.author.id,
        postLink: link,
        postLimit: postLimitCheck.limit,
        details: `User has ${postLimitCheck.penaltiesFromLastWeek} penalty(ies) from last week, ${currentWeekPenalties} penalty(ies) this week. Current posts: ${postLimitCheck.currentCount}/${postLimitCheck.limit}. Next week limit: ${nextWeekLimit}`,
      });

      return;
    }

    const post = await postService.createPost({
      link,
      authorId: message.author.id,
      monitoredChannelId: message.channelId,
      originalMessage: message.content,
    });

    // If no active voting period, notify user
    if (!post) {
      await message.reply({
        content: '🛑 **No active voting period.** An admin needs to start a new voting period with `/week start` before posts can be submitted.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    console.log(`Created post ${post.id} for link: ${link}`);
    console.log(`Post created in week ${post.weekId} for channel ${message.channelId}`);

    const upvoteButton = new ButtonBuilder()
      .setCustomId(`upvote_${post.id}`)
      .setLabel('Yes')
      .setStyle(ButtonStyle.Primary);

    const downvoteButton = new ButtonBuilder()
      .setCustomId(`downvote_${post.id}`)
      .setLabel('No')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(upvoteButton, downvoteButton);

    const reviewMessage = await message.reply({
      content: `Should this post by <@${message.author.id}> be featured among this week's contest winners? (Singularity role only)`,
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
    // Immediately acknowledge the interaction to prevent timeout
    await interaction.deferUpdate();

    const config = await guildConfigService.getConfig(guildId);
    if (!config) {
      await interaction.followUp({ content: 'Configuration not found.', ephemeral: true });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasVoterRole = config.voterRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

    if (config.voterRoleIds.length > 0 && !hasVoterRole) {
      await interaction.followUp({ content: '❌ You are not allowed to vote.', ephemeral: true });
      return;
    }

    const post = await postService.getPostByReviewMessageId(interaction.message.id);
    if (!post) {
      await interaction.followUp({ content: 'Post not found.', ephemeral: true });
      return;
    }

    // Check if the week is closed
    const week = await weekService.getWeekById(post.weekId);
    if (week && week.status === WeekStatus.CLOSED) {
      await interaction.followUp({ content: '❌ Cannot vote on posts from a closed week.', ephemeral: true });
      return;
    }

    if (post.status !== PostStatus.PENDING) {
      await interaction.followUp({ content: 'This post has already been decided.', ephemeral: true });
      return;
    }

    // Check cooldown for vote changes
    const cooldownCheck = await voteService.canUserChangeVote(post.id, interaction.user.id, 20);
    if (!cooldownCheck.canChange) {
      await interaction.followUp({
        content: `❌ You can change your vote again in ${cooldownCheck.secondsRemaining} second${cooldownCheck.secondsRemaining !== 1 ? 's' : ''}.`,
        ephemeral: true
      });
      return;
    }

    const voteType = customId.startsWith('upvote_') ? VoteType.UP : VoteType.DOWN;

    await voteService.recordVote(post.id, interaction.user.id, voteType);

    // Verify vote was actually recorded
    const verifyVote = await voteService.getUserVote(post.id, interaction.user.id);
    if (!verifyVote || verifyVote.type !== voteType) {
      console.error(`[Vote] VERIFICATION FAILED for user ${interaction.user.id} on post ${post.id}. Expected: ${voteType}, Got: ${verifyVote?.type || 'null'}`);
      await interaction.followUp({ content: '❌ Vote verification failed. Please try again.', ephemeral: true });
      return;
    }

    // Use weighted vote counts - boosted voters get x2 weight
    const weightedVoteCounts = await voteService.getWeightedVoteCounts(post.id, guildId);

    let statusChanged = false;
    let newStatus: PostStatus | null = null;

    // Check thresholds using weighted votes
    if (weightedVoteCounts.weightedDownvotes >= config.downvoteThreshold) {
      await postService.updateStatus(post.id, PostStatus.REJECTED);
      newStatus = PostStatus.REJECTED;
      statusChanged = true;

      const votersList = await voteService.getAllVotesWithUsers(post.id);

      // Check if this is low quality spam (0-2 upvotes, reached downvote threshold)
      // If so, add a penalty to the author (-1 post for next week)
      if (spamPenaltyService.isLowQualitySpam(
        weightedVoteCounts.weightedUpvotes,
        weightedVoteCounts.weightedDownvotes,
        config.downvoteThreshold
      )) {
        const penaltyCount = await spamPenaltyService.addPenalty(post.authorId, guildId, post.id, post.weekId);
        await modLogService.log(guildId, ModLogEventType.SPAM_PENALTY_ADDED, {
          oderId: post.authorId,
          postId: post.id,
          postLink: post.link,
          penaltyCount,
          details: `User received spam penalty #${penaltyCount} for low quality content (${weightedVoteCounts.weightedUpvotes} yes / ${weightedVoteCounts.weightedDownvotes} no). Next week post limit reduced.`,
        });
      }

      await modLogService.log(guildId, ModLogEventType.POST_REJECTED_AUTO, {
        postId: post.id,
        postLink: post.link,
        authorId: post.authorId,
        monitoredChannelId: post.monitoredChannelId || undefined,
        votes: { upvotes: weightedVoteCounts.weightedUpvotes, downvotes: weightedVoteCounts.weightedDownvotes },
        votersList,
      });
    } else if (weightedVoteCounts.weightedUpvotes >= config.upvoteThreshold) {
      await postService.updateStatus(post.id, PostStatus.SHORTLISTED);
      newStatus = PostStatus.SHORTLISTED;
      statusChanged = true;

      const votersList = await voteService.getAllVotesWithUsers(post.id);

      await modLogService.log(guildId, ModLogEventType.POST_SHORTLISTED_AUTO, {
        postId: post.id,
        postLink: post.link,
        authorId: post.authorId,
        monitoredChannelId: post.monitoredChannelId || undefined,
        votes: { upvotes: weightedVoteCounts.weightedUpvotes, downvotes: weightedVoteCounts.weightedDownvotes },
        votersList,
      });
    }

    if (statusChanged && newStatus) {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`upvote_${post.id}`)
          .setLabel('Yes')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`downvote_${post.id}`)
          .setLabel('No')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await interaction.message.edit({
        components: [disabledRow],
      });

      if (newStatus === PostStatus.SHORTLISTED && post.monitoredChannelId) {
        // Find the shortlist channel for this monitored channel
        const { channelPairService } = await import('./services/ChannelPairService');
        const shortlistChannelId = await channelPairService.getShortlistChannelId(guildId, post.monitoredChannelId);

        if (shortlistChannelId) {
          const shortlistChannel = await interaction.guild.channels.fetch(shortlistChannelId);
          if (shortlistChannel?.isTextBased()) {
          // Create star rating buttons (1-10)
          const rateRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`rate_${post.id}_1`).setLabel('1⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_2`).setLabel('2⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_3`).setLabel('3⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_4`).setLabel('4⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_5`).setLabel('5⭐').setStyle(ButtonStyle.Primary)
          );

          const rateRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`rate_${post.id}_6`).setLabel('6⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_7`).setLabel('7⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_8`).setLabel('8⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_9`).setLabel('9⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rate_${post.id}_10`).setLabel('10⭐').setStyle(ButtonStyle.Primary)
          );

            await shortlistChannel.send({
              content: `⭐ **Shortlisted Content** by <@${post.authorId}>\n👍 ${weightedVoteCounts.weightedUpvotes} | 👎 ${weightedVoteCounts.weightedDownvotes}\n\n${post.link}`,
              components: [rateRow1, rateRow2]
            });
            console.log(`Posted to shortlist channel: ${post.id}`);
          }
        }
      }

      // Show confirmation to voter
      const voteMessage = voteType === VoteType.UP ? 'You voted Yes.' : 'You voted No.';
      await interaction.followUp({
        content: voteMessage,
        ephemeral: true
      });
    } else {
      // Update buttons without vote counts (privacy)
      const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`upvote_${post.id}`)
          .setLabel('Yes')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`downvote_${post.id}`)
          .setLabel('No')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.message.edit({ components: [updatedRow] });

      // Show confirmation to voter
      const voteMessage = voteType === VoteType.UP ? 'You voted Yes.' : 'You voted No.';
      await interaction.followUp({
        content: voteMessage,
        ephemeral: true
      });
    }
    } catch (error) {
      console.error('Error processing vote:', error);
      // Don't try to reply if interaction already acknowledged
      try {
        await interaction.followUp({ content: 'Failed to process vote.', ephemeral: true });
      } catch (followUpError) {
        console.error('Failed to send error followUp:', followUpError);
      }
    }
  }

});

async function handleRateButton(interaction: ButtonInteraction, guildId: string) {
  try {
    // Immediately acknowledge the interaction to prevent timeout
    await interaction.deferUpdate();

    const config = await guildConfigService.getConfig(guildId);
    if (!config) {
      await interaction.followUp({ content: 'Configuration not found.', ephemeral: true });
      return;
    }

    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const hasJudgeRole = config.judgeRoleIds.length === 0 ||
      config.judgeRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

    if (!hasJudgeRole) {
      await interaction.followUp({ content: '❌ You are not allowed to rate posts.', ephemeral: true });
      return;
    }

    // Extract postId and rating from customId: rate_POSTID_RATING
    const parts = interaction.customId.split('_');
    if (parts.length < 3) {
      await interaction.followUp({ content: '❌ Invalid button format.', ephemeral: true });
      return;
    }

    const rating = parseInt(parts[parts.length - 1], 10);
    const postId = parts.slice(1, -1).join('_'); // Handle post IDs that might contain underscores

    if (isNaN(rating) || rating < 1 || rating > 10) {
      await interaction.followUp({ content: '❌ Invalid rating value.', ephemeral: true });
      return;
    }

    const post = await postService.getPostById(postId);

    if (!post) {
      await interaction.followUp({ content: 'Post not found.', ephemeral: true });
      return;
    }

    // Check if the week is closed
    const week = await weekService.getWeekById(post.weekId);
    if (week && week.status === WeekStatus.CLOSED) {
      await interaction.followUp({ content: '❌ Cannot rate posts from a closed week.', ephemeral: true });
      return;
    }

    // Check if ranking is open
    if (week && !week.rankingOpen) {
      await interaction.followUp({ content: 'Admin has not started ranking session yet.', ephemeral: true });
      return;
    }

    if (post.status !== PostStatus.SHORTLISTED) {
      await interaction.followUp({ content: 'Only shortlisted posts can be rated.', ephemeral: true });
      return;
    }

    // Check if user is trying to rate their own post
    if (post.authorId === interaction.user.id) {
      await interaction.followUp({ content: 'You cannot rate your own post.', ephemeral: true });
      return;
    }

    // Check if user already rated this post
    const existingRating = await ratingService.getUserRating(postId, interaction.user.id);

    // Save the rating
    await ratingService.upsertRating(postId, interaction.user.id, rating);

    // Show appropriate confirmation message
    let message: string;
    if (existingRating) {
      message = `You changed your rating to ${rating}/10`;
    } else {
      message = `You rated this post ${rating}/10`;
    }

    await interaction.followUp({
      content: message,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error processing rating:', error);
    try {
      await interaction.followUp({ content: 'Failed to save rating.', ephemeral: true });
    } catch (followUpError) {
      console.error('Failed to send error followUp:', followUpError);
    }
  }
}

async function handleSlashCommand(interaction: ChatInputCommandInteraction, guildId: string) {
  const { commandName } = interaction;

  try {
    if (commandName === 'ping') {
      await interaction.reply('Pong!');
      return;
    }

    if (commandName === 'help') {
      const config = await guildConfigService.getConfig(guildId);
      const { channelPairService } = await import('./services/ChannelPairService');
      const pairs = await channelPairService.getChannelPairs(guildId);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Bot Usage Guide')
        .setDescription('**Quick Start**\n\n1. Set up admin roles with `/config set-admin-roles`\n2. Create channel pairs with `/channel-pair add`\n3. Start voting period with `/week start`')
        .addFields(
          {
            name: 'Current Config',
            value: `• Thresholds: ${config?.upvoteThreshold || 3} to accept / ${config?.downvoteThreshold || 3} to remove\n• Voter roles: ${config?.voterRoleIds.length ? config.voterRoleIds.map(id => `<@&${id}>`).join(', ') : 'Everyone'}\n• Judge roles: ${config?.judgeRoleIds.length ? config.judgeRoleIds.map(id => `<@&${id}>`).join(', ') : 'Everyone'}\n• Monitored channels: ${pairs.length} pair${pairs.length !== 1 ? 's' : ''}`,
            inline: false
          },
          {
            name: 'Channel Management',
            value: '`/channel-pair add` - create monitored → shortlist channel pair\n`/channel-pair remove` - remove a channel pair',
            inline: false
          },
          {
            name: 'Week Management',
            value: '`/week start [channel]` - start accepting posts\n`/week close [channel]` - close voting period',
            inline: false
          },
          {
            name: 'Configuration',
            value: '`/config show` - view current configuration\n`/config set-mod-log` - set mod log channel\n`/config set-admin-roles` - set admin roles',
            inline: false
          },
          {
            name: 'Results & Export',
            value: '`/results [channel]` - view current rankings\n`/export results` - export last week to CSV',
            inline: false
          },
          {
            name: 'Post Moderation',
            value: '`/post approve` - manually approve a post\n`/post reject` - manually reject a post\n`/post reset_votes` - clear votes on a post',
            inline: false
          },
          {
            name: 'How It Works',
            value: '**Content Voting**\nWhen someone posts a link in a monitored channel, the bot creates a vote with Yes/No buttons.\n\n• Enough Yes votes → post shortlisted, appears in shortlist channel with rating buttons\n• Enough No votes → post rejected and deleted\n\n**Rating System**\nJudges rate shortlisted posts with 1-5 stars. Use `/results` to see rankings by average rating.\n\n**Duplicate Detection**\nIf someone posts the same link twice, it\'s automatically deleted.',
            inline: false
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
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

        const { channelPairService } = await import('./services/ChannelPairService');
        const pairs = await channelPairService.getChannelPairs(guildId);

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('⚙️ Server Configuration')
          .setDescription('Current bot settings for this server')
          .addFields(
            {
              name: '📢 Channel Pairs',
              value: pairs.length > 0
                ? pairs.map(pair => `<#${pair.monitoredChannelId}> → <#${pair.shortlistChannelId}>`).join('\n')
                : '*None set*\nUse `/channel-pair add` to create pairs.',
              inline: false
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
              value: `👍 Yes: **${config.upvoteThreshold}**\n👎 No: **${config.downvoteThreshold}**`,
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

    if (commandName === 'channel-pair') {
      const subcommand = interaction.options.getSubcommand();
      const { channelPairService } = await import('./services/ChannelPairService');

      if (subcommand === 'add') {
        const monitoredChannel = interaction.options.getChannel('monitored', true);
        const shortlistChannel = interaction.options.getChannel('shortlist', true);

        if (monitoredChannel?.type !== ChannelType.GuildText || shortlistChannel?.type !== ChannelType.GuildText) {
          await interaction.reply({ content: '❌ Both channels must be text channels.', ephemeral: true });
          return;
        }

        try {
          await channelPairService.addChannelPair(guildId, monitoredChannel.id, shortlistChannel.id);
          await interaction.reply({
            content: `✅ Channel pair created:\n📢 Monitored: <#${monitoredChannel.id}>\n⭐ Shortlist: <#${shortlistChannel.id}>`,
            ephemeral: true,
          });
        } catch (error) {
          await interaction.reply({
            content: `❌ ${error instanceof Error ? error.message : 'Failed to create channel pair'}`,
            ephemeral: true,
          });
        }
        return;
      }

      if (subcommand === 'remove') {
        const monitoredChannel = interaction.options.getChannel('monitored', true);

        try {
          await channelPairService.removeChannelPair(guildId, monitoredChannel.id);
          await interaction.reply({
            content: `✅ Channel pair removed for <#${monitoredChannel.id}>`,
            ephemeral: true,
          });
        } catch (error) {
          await interaction.reply({
            content: `❌ ${error instanceof Error ? error.message : 'Failed to remove channel pair'}`,
            ephemeral: true,
          });
        }
        return;
      }

      if (subcommand === 'list') {
        const pairs = await channelPairService.getChannelPairs(guildId);

        if (pairs.length === 0) {
          await interaction.reply({
            content: '📋 No channel pairs configured.\n\nUse `/channel-pair add` to create a pair.',
            ephemeral: true,
          });
          return;
        }

        const pairsList = pairs.map(pair =>
          `📢 <#${pair.monitoredChannelId}> → ⭐ <#${pair.shortlistChannelId}>`
        ).join('\n');

        await interaction.reply({
          content: `📋 **Channel Pairs:**\n\n${pairsList}`,
          ephemeral: true,
        });
        return;
      }
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
      // Defer reply immediately to prevent timeout
      await interaction.deferReply();

      const config = await guildConfigService.getConfig(guildId);
      if (!config) {
        await interaction.editReply({ content: 'Configuration not found.' });
        return;
      }

      const member = await interaction.guild!.members.fetch(interaction.user.id);
      const hasJudgeRole = config.judgeRoleIds.length === 0 ||
        config.judgeRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

      if (!hasJudgeRole) {
        await interaction.editReply({ content: '❌ You do not have permission to view results.' });
        return;
      }

      // Get optional monitored channel filter
      const monitoredChannel = interaction.options.getChannel('monitored', false);

      // Get active week for the specific channel (or global if no channel specified)
      const activeWeek = await (await import('./services/WeekService')).weekService.getActiveWeek(monitoredChannel?.id);
      if (!activeWeek) {
        await interaction.editReply({ content: 'No active voting period. Use `/week start` to begin accepting posts.' });
        return;
      }
      const shortlistedPosts = await postService.getPostsByStatus(PostStatus.SHORTLISTED);

      // Filter posts by week and channel
      let weekPosts = shortlistedPosts.filter(p => {
        // Must be in the active week
        if (p.weekId !== activeWeek.id) return false;

        // If channel specified, must match
        if (monitoredChannel && p.monitoredChannelId !== monitoredChannel.id) return false;

        return true;
      });

      // Check if we have posts
      if (monitoredChannel) {

        if (weekPosts.length === 0) {
          await interaction.editReply({ content: `No shortlisted posts found for <#${monitoredChannel.id}> this week.` });
          return;
        }
      } else if (weekPosts.length === 0) {
        await interaction.editReply({ content: 'No shortlisted posts found for this week.' });
        return;
      }

      // Fetch all ratings in a single query to avoid N+1 problem
      const postIds = weekPosts.map(p => p.id);
      const statsMap = await ratingService.getBulkPostRatingStats(postIds);

      const postsWithRatings = weekPosts.map((post) => {
        const stats = statsMap.get(post.id) || {
          postId: post.id,
          averageRating: 0,
          totalRatings: 0,
        };
        return {
          post,
          stats,
        };
      });

      // Sort by average rating (highest first), then by number of ratings as tiebreaker
      postsWithRatings.sort((a, b) => {
        if (b.stats.averageRating !== a.stats.averageRating) {
          return b.stats.averageRating - a.stats.averageRating;
        }
        return b.stats.totalRatings - a.stats.totalRatings;
      });

      const medals = ['🥇', '🥈', '🥉', '🏅', '🏅'];

      // Get channel name for title
      let channelName = 'Contest';
      if (monitoredChannel) {
        const channel = await interaction.guild?.channels.fetch(monitoredChannel.id);
        if (channel?.isTextBased()) {
          channelName = channel.name;
        }
      }

      // Build title with channel name
      const title = `${channelName.charAt(0).toUpperCase() + channelName.slice(1)} Challenge - Weekly Content Contest Winners 💫`;

      // Build description for embed
      const resultLines: string[] = [];

      // Helper function to get username
      const getUserDisplay = async (userId: string): Promise<string> => {
        try {
          const user = await interaction.client.users.fetch(userId);
          return `@${user.username}`;
        } catch {
          return `<@${userId}>`;
        }
      };

      // Top 5 winners
      for (let i = 0; i < Math.min(5, postsWithRatings.length); i++) {
        const item = postsWithRatings[i];
        const medal = medals[i];
        const avgRating = item.stats.averageRating > 0 ? item.stats.averageRating.toFixed(2) : 'N/A';
        const ratingCount = item.stats.totalRatings;
        const username = await getUserDisplay(item.post.authorId);
        resultLines.push(`${medal} ${username} • ⭐ ${avgRating} avg (${ratingCount} rating${ratingCount !== 1 ? 's' : ''})`);
        resultLines.push(item.post.link);
        resultLines.push('');
      }

      // Honorary Contributions (6+)
      if (postsWithRatings.length > 5) {
        resultLines.push('✨ Honorary Contributions');
        for (let i = 5; i < postsWithRatings.length; i++) {
          const item = postsWithRatings[i];
          const avgRating = item.stats.averageRating > 0 ? item.stats.averageRating.toFixed(2) : 'N/A';
          const ratingCount = item.stats.totalRatings;
          const username = await getUserDisplay(item.post.authorId);
          resultLines.push(`${username} ${item.post.link} • ⭐ ${avgRating} (${ratingCount})`);
        }
        resultLines.push('');
      }

      resultLines.push('Thank you all for your contributions ✨');

      // Split into multiple embeds if needed (Discord limit: 4096 chars per embed description)
      const embeds: EmbedBuilder[] = [];
      let currentLines: string[] = [];
      let currentLength = 0;
      const MAX_LENGTH = 4000; // Leave some buffer

      for (const line of resultLines) {
        const lineLength = line.length + 1; // +1 for newline

        if (currentLength + lineLength > MAX_LENGTH && currentLines.length > 0) {
          // Create embed with current lines
          const embed = new EmbedBuilder()
            .setColor(0xffd700)
            .setDescription(currentLines.join('\n'))
            .setTimestamp();

          if (embeds.length === 0) {
            embed.setTitle(title);
          }

          embeds.push(embed);
          currentLines = [];
          currentLength = 0;
        }

        currentLines.push(line);
        currentLength += lineLength;
      }

      // Add remaining lines
      if (currentLines.length > 0) {
        const embed = new EmbedBuilder()
          .setColor(0xffd700)
          .setDescription(currentLines.join('\n'))
          .setTimestamp();

        if (embeds.length === 0) {
          embed.setTitle(title);
        }

        embeds.push(embed);
      }

      await interaction.editReply({ embeds });
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
        if (post.reviewMessageId && post.monitoredChannelId) {
          try {
            const voteCounts = await voteService.getVoteCounts(postId);
            const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`upvote_${postId}`)
                .setLabel('Yes')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`downvote_${postId}`)
                .setLabel('No')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            );

            // Update the review message in the monitored channel
            try {
              const channel = await interaction.guild!.channels.fetch(post.monitoredChannelId);
              if (channel?.isTextBased()) {
                const reviewMessage = await channel.messages.fetch(post.reviewMessageId);
                await reviewMessage.edit({ components: [disabledRow] });
              }
            } catch (err) {
              console.error('Failed to update review message:', err);
            }
          } catch (error) {
            console.error('Failed to disable buttons:', error);
          }
        }

        // Find the shortlist channel for this monitored channel
        const { channelPairService } = await import('./services/ChannelPairService');
        const shortlistChannelId = post.monitoredChannelId ? await channelPairService.getShortlistChannelId(guildId, post.monitoredChannelId) : null;

        if (shortlistChannelId) {
          try {
            const shortlistChannel = await interaction.guild!.channels.fetch(shortlistChannelId);
            if (shortlistChannel?.isTextBased()) {
              const voteCounts = await voteService.getVoteCounts(postId);
              // Create star rating buttons (1-10)
              const rateRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`rate_${postId}_1`).setLabel('1⭐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_${postId}_2`).setLabel('2⭐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_${postId}_3`).setLabel('3⭐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_${postId}_4`).setLabel('4⭐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_${postId}_5`).setLabel('5⭐').setStyle(ButtonStyle.Primary)
              );

              const rateRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`rate_${postId}_6`).setLabel('6⭐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_${postId}_7`).setLabel('7⭐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_${postId}_8`).setLabel('8⭐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_${postId}_9`).setLabel('9⭐').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`rate_${postId}_10`).setLabel('10⭐').setStyle(ButtonStyle.Primary)
              );

              await shortlistChannel.send({
                content: `⭐ **Shortlisted Content (Admin Override)** by <@${post.authorId}>\n👍 ${voteCounts.upvotes} | 👎 ${voteCounts.downvotes}\n\n${post.link}`,
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
        if (post.reviewMessageId && post.monitoredChannelId) {
          try {
            const voteCounts = await voteService.getVoteCounts(postId);
            const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`upvote_${postId}`)
                .setLabel('Yes')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`downvote_${postId}`)
                .setLabel('No')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            );

            // Update the review message in the monitored channel
            try {
              const channel = await interaction.guild!.channels.fetch(post.monitoredChannelId);
              if (channel?.isTextBased()) {
                const reviewMessage = await channel.messages.fetch(post.reviewMessageId);
                await reviewMessage.edit({ components: [disabledRow] });
              }
            } catch (err) {
              console.error('Failed to update review message:', err);
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
        if (post.reviewMessageId && post.monitoredChannelId) {
          try {
            const enabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`upvote_${postId}`)
                .setLabel('Yes')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`downvote_${postId}`)
                .setLabel('No')
                .setStyle(ButtonStyle.Secondary)
            );

            // Update the review message in the monitored channel
            try {
              const channel = await interaction.guild!.channels.fetch(post.monitoredChannelId);
              if (channel?.isTextBased()) {
                const reviewMessage = await channel.messages.fetch(post.reviewMessageId);
                await reviewMessage.edit({ components: [enabledRow] });
              }
            } catch (err) {
              console.error('Failed to update review message:', err);
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

          // Get optional monitored channel parameter
          const monitoredChannel = interaction.options.getChannel('monitored', false);
          const monitoredChannelId = monitoredChannel?.id;

          // Get active week for this channel (or global if no channel specified)
          const activeWeek = await weekService.getActiveWeek(monitoredChannelId);
          if (!activeWeek) {
            await interaction.reply({ content: 'No active voting period to close.', ephemeral: true });
            return;
          }
          const allPosts = await postService.getPostsByWeek(activeWeek.id);

          // Close the week
          const closedWeek = await weekService.closeActiveWeek(monitoredChannelId);

          // Format dates for logging
          const startDate = closedWeek.startDate.toISOString().split('T')[0];
          const endDate = closedWeek.endDate.toISOString().split('T')[0];

          const channelInfo = monitoredChannel ? ` for <#${monitoredChannel.id}>` : '';
          const channelInfoLog = monitoredChannel ? ` for channel <#${monitoredChannel.id}>` : ' (all channels)';

          // Log to mod_log
          await modLogService.log(guildId, ModLogEventType.WEEK_CLOSED, {
            weekId: closedWeek.id,
            adminId: interaction.user.id,
            postsCount: allPosts.length,
            weekDates: `${startDate} to ${endDate}`,
            monitoredChannelId: monitoredChannelId,
            details: `Voting period closed${channelInfoLog} by <@${interaction.user.id}>. Bot will no longer accept posts until /week start is used.`,
          });

          await interaction.reply({
            content: `✅ **Voting period closed successfully**${channelInfo}\n\n**Period:** ${startDate} to ${endDate}\n**Total Posts:** ${allPosts.length}\n\n🛑 **Bot will no longer accept new posts${channelInfo}.**\nUse \`/week start\` to begin a new voting period.`,
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

      if (subcommand === 'start') {
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
            await interaction.reply({ content: '❌ You do not have permission to start voting periods. (Admin role required)', ephemeral: true });
            return;
          }

          // Get optional monitored channel parameter
          const monitoredChannel = interaction.options.getChannel('monitored', false);
          const monitoredChannelId = monitoredChannel?.id;

          const channelInfo = monitoredChannel ? ` for <#${monitoredChannel.id}>` : '';
          const channelInfoLog = monitoredChannel ? ` for channel <#${monitoredChannel.id}>` : ' (all channels)';

          // Start new voting period
          const newWeek = await weekService.startNewWeek(monitoredChannelId);

          // Format dates for logging
          const startDate = newWeek.startDate.toISOString().split('T')[0];
          const endDate = newWeek.endDate.toISOString().split('T')[0];

          // Log to mod_log
          await modLogService.log(guildId, ModLogEventType.WEEK_STARTED, {
            weekId: newWeek.id,
            adminId: interaction.user.id,
            postsCount: 0,
            weekDates: `${startDate} to ${endDate}`,
            monitoredChannelId: monitoredChannelId,
            details: `New voting period started${channelInfoLog} by <@${interaction.user.id}>. Bot is now accepting posts.`,
          });

          await interaction.reply({
            content: `✅ **New voting period started!**${channelInfo}\n\n**Started:** ${startDate}\n\n🎉 **Bot is now accepting posts${channelInfo}!**\nUsers can submit links and vote on them.`,
            ephemeral: true,
          });
        } catch (error) {
          console.error('Error starting week:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await modLogService.log(guildId, ModLogEventType.BOT_ERROR, {
            error: 'Failed to start week',
            details: errorMessage,
          });
          await interaction.reply({ content: `❌ Failed to start voting period: ${errorMessage}`, ephemeral: true });
        }
        return;
      }
    }

    if (commandName === 'ranking') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'start') {
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
            await interaction.reply({ content: '❌ You do not have permission to open ranking. (Admin role required)', ephemeral: true });
            return;
          }

          // Get optional monitored channel parameter
          const monitoredChannel = interaction.options.getChannel('monitored', false);
          const monitoredChannelId = monitoredChannel?.id;

          // Get active week for this channel (or global if no channel specified)
          const activeWeek = await weekService.getActiveWeek(monitoredChannelId);
          if (!activeWeek) {
            await interaction.reply({ content: 'No active voting period found. Use /week start first.', ephemeral: true });
            return;
          }

          if (activeWeek.rankingOpen) {
            const channelInfo = monitoredChannel ? ` for <#${monitoredChannel.id}>` : '';
            await interaction.reply({ content: `Ranking is already open${channelInfo}.`, ephemeral: true });
            return;
          }

          // Open ranking
          const updatedWeek = await prisma.week.update({
            where: { id: activeWeek.id },
            data: { rankingOpen: true },
          });

          const channelInfo = monitoredChannel ? ` for <#${monitoredChannel.id}>` : '';

          await interaction.reply({
            content: `✅ **Ranking session opened!**${channelInfo}\n\nJudges can now rate shortlisted content.`,
            ephemeral: true,
          });
        } catch (error) {
          console.error('Error opening ranking:', error);
          await interaction.reply({ content: '❌ Failed to open ranking session.', ephemeral: true });
        }
        return;
      }
    }

    if (commandName === 'export') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'logs') {
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
            await interaction.reply({ content: '❌ You do not have permission to export logs. (Admin role required)', ephemeral: true });
            return;
          }

          // Get optional monitored channel filter
          const monitoredChannel = interaction.options.getChannel('monitored', false);

          // Get active week for the specific channel (or global if no channel specified)
          const activeWeek = await weekService.getActiveWeek(monitoredChannel?.id);
          if (!activeWeek) {
            await interaction.reply({ content: 'No active voting period. Use `/week start` to begin.', ephemeral: true });
            return;
          }

          // Get all shortlisted posts for this week
          const shortlistedPosts = await postService.getPostsByStatus(PostStatus.SHORTLISTED);

          // Filter posts by week and channel
          let weekPosts = shortlistedPosts.filter(p => {
            if (p.weekId !== activeWeek.id) return false;
            if (monitoredChannel && p.monitoredChannelId !== monitoredChannel.id) return false;
            return true;
          });

          if (weekPosts.length === 0) {
            const channelInfo = monitoredChannel ? ` for <#${monitoredChannel.id}>` : '';
            await interaction.reply({ content: `No shortlisted posts found${channelInfo} in active week.`, ephemeral: true });
            return;
          }

          // Collect all ratings for these posts
          interface RatingLog {
            postAuthorId: string;
            postLink: string;
            judgeId: string;
            rating: number;
            ratedAt: Date;
          }

          const ratingLogs: RatingLog[] = [];

          for (const post of weekPosts) {
            const ratings = await prisma.rating.findMany({
              where: { postId: post.id },
              include: { user: true },
              orderBy: { createdAt: 'asc' },
            });

            for (const rating of ratings) {
              ratingLogs.push({
                postAuthorId: post.authorId,
                postLink: post.link,
                judgeId: rating.user.discordId,
                rating: rating.score,
                ratedAt: rating.createdAt,
              });
            }
          }

          if (ratingLogs.length === 0) {
            await interaction.reply({ content: 'No ratings found yet. Judges haven\'t started rating posts.', ephemeral: true });
            return;
          }

          // Generate CSV
          const csvRows: string[] = [];
          csvRows.push('Post Author,Post Link,Judge,Rating,Rated At');

          // Helper function to get username
          const getUsernameForCSV = async (userId: string): Promise<string> => {
            try {
              const user = await interaction.client.users.fetch(userId);
              return `@${user.username}`;
            } catch {
              return `<@${userId}>`;
            }
          };

          for (const log of ratingLogs) {
            const authorName = await getUsernameForCSV(log.postAuthorId);
            const judgeName = await getUsernameForCSV(log.judgeId);
            const timestamp = log.ratedAt.toISOString().replace('T', ' ').split('.')[0];
            csvRows.push(`"${authorName}","${log.postLink}","${judgeName}",${log.rating},"${timestamp}"`);
          }

          const csvContent = csvRows.join('\n');
          const csvBuffer = Buffer.from(csvContent, 'utf-8');

          // Create filename
          const startDate = activeWeek.startDate.toISOString().split('T')[0];
          const channelSuffix = monitoredChannel ? `_${monitoredChannel.id}` : '';
          const fileName = `rating_logs_${startDate}${channelSuffix}.csv`;

          const attachment = new AttachmentBuilder(csvBuffer, { name: fileName });

          // Log to mod_log
          await modLogService.log(guildId, ModLogEventType.EXPORT_RESULTS, {
            weekId: activeWeek.id,
            adminId: interaction.user.id,
            postsCount: weekPosts.length,
            details: `Exported ${ratingLogs.length} rating logs`,
          });

          const channelInfo = monitoredChannel ? ` for <#${monitoredChannel.id}>` : '';
          await interaction.reply({
            content: `📊 **Rating Logs Exported**${channelInfo}\n\nPosts: ${weekPosts.length}\nRatings: ${ratingLogs.length}`,
            files: [attachment],
            ephemeral: true,
          });
        } catch (error) {
          console.error('Error exporting logs:', error);
          await modLogService.log(guildId, ModLogEventType.BOT_ERROR, {
            error: 'Failed to export logs',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
          await interaction.reply({ content: '❌ Failed to export logs. Check mod log for details.', ephemeral: true });
        }
        return;
      }
    }

    if (commandName === 'reset-database') {
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
          await interaction.reply({ content: '❌ You do not have permission to use this command. (Admin role required)', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        const { prisma } = await import('./db');

        // Delete all data in correct order (respecting foreign keys)
        await prisma.rating.deleteMany({});
        await prisma.vote.deleteMany({});
        await prisma.post.deleteMany({});
        await prisma.week.deleteMany({});
        await prisma.channelPair.deleteMany({});
        await prisma.guildConfig.deleteMany({});

        await modLogService.log(guildId, ModLogEventType.BOT_ERROR, {
          error: 'Database Reset',
          details: `Admin <@${interaction.user.id}> reset the entire database. All data has been deleted.`,
        });

        await interaction.editReply({
          content: `✅ **Database reset complete!**\n\n**All data deleted:**\n• All ratings\n• All votes\n• All posts\n• All weeks\n• All channel pairs\n• All guild configs\n\n⚠️ **Please reconfigure the bot:**\n1. Use \`/config set-admin-roles\` to set admin roles\n2. Use \`/channel-pair add\` to create channel pairs\n3. Use \`/week start\` to begin accepting posts`,
        });
      } catch (error) {
        console.error('Error resetting database:', error);
        await interaction.editReply({ content: '❌ Failed to reset database. Check logs for details.' });
      }
      return;
    }

    if (commandName === 'watch-votes') {
      try {
        const config = await guildConfigService.getConfig(guildId);
        if (!config) {
          await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Get optional monitored channel filter and page number
        const monitoredChannel = interaction.options.getChannel('monitored', false);
        const page = interaction.options.getInteger('page', false) || 1;
        const postsPerPage = 10;

        // Get active week
        const activeWeek = await weekService.getActiveWeek(monitoredChannel?.id);
        if (!activeWeek) {
          await interaction.editReply({ content: 'No active voting period. Use `/week start` to begin accepting posts.' });
          return;
        }

        // Get all pending posts
        const pendingPosts = await postService.getPostsByStatus(PostStatus.PENDING);

        // Filter by week and channel
        let filteredPosts = pendingPosts.filter(p => {
          if (p.weekId !== activeWeek.id) return false;
          if (monitoredChannel && p.monitoredChannelId !== monitoredChannel.id) return false;
          return true;
        });

        const totalPosts = filteredPosts.length;
        const totalPages = Math.ceil(totalPosts / postsPerPage);

        if (totalPosts === 0) {
          const channelInfo = monitoredChannel ? ` in <#${monitoredChannel.id}>` : '';
          await interaction.editReply({ content: `No pending posts found${channelInfo} for this week.` });
          return;
        }

        // Validate page number
        if (page > totalPages) {
          await interaction.editReply({ content: `Page ${page} doesn't exist. Total pages: ${totalPages}` });
          return;
        }

        // Get posts for current page
        const startIndex = (page - 1) * postsPerPage;
        const endIndex = startIndex + postsPerPage;
        const pagePosts = filteredPosts.slice(startIndex, endIndex);

        // Build embeds for each post
        const embeds: EmbedBuilder[] = [];

        for (const post of pagePosts) {
          const votes = await voteService.getAllVotesWithUsers(post.id);
          const voteCounts = await voteService.getVoteCounts(post.id);

          const upvoters = votes
            .filter(v => v.voteType === 'UP')
            .map(v => `<@${v.userId}>`)
            .join(', ') || 'None';

          const downvoters = votes
            .filter(v => v.voteType === 'DOWN')
            .map(v => `<@${v.userId}>`)
            .join(', ') || 'None';

          const timeSincePost = Math.floor((Date.now() - new Date(post.createdAt).getTime()) / 1000 / 60);
          const timeStr = timeSincePost < 60
            ? `${timeSincePost}m ago`
            : `${Math.floor(timeSincePost / 60)}h ${timeSincePost % 60}m ago`;

          const embed = new EmbedBuilder()
            .setColor(voteCounts.upvotes > voteCounts.downvotes ? 0x00FF00 : voteCounts.downvotes > voteCounts.upvotes ? 0xFF0000 : 0x808080)
            .setTitle(`Post by <@${post.authorId}>`)
            .setDescription(`**Link:** ${post.link}\n**Post ID:** \`${post.id}\``)
            .addFields(
              {
                name: `👍 Yes (${voteCounts.upvotes}/${config.upvoteThreshold})`,
                value: upvoters,
                inline: true
              },
              {
                name: `👎 No (${voteCounts.downvotes}/${config.downvoteThreshold})`,
                value: downvoters,
                inline: true
              },
              {
                name: '⏱️ Posted',
                value: timeStr,
                inline: true
              }
            )
            .setFooter({ text: post.monitoredChannelId ? `Channel: #${interaction.guild!.channels.cache.get(post.monitoredChannelId)?.name || post.monitoredChannelId}` : 'Global' });

          embeds.push(embed);
        }

        const header = monitoredChannel
          ? `**Pending Posts in <#${monitoredChannel.id}>**`
          : `**All Pending Posts**`;

        const pageInfo = `\nPage ${page}/${totalPages} (${totalPosts} total posts)`;
        const navHint = totalPages > 1 ? `\n_Use \`/watch-votes page:${page < totalPages ? page + 1 : 1}\` for ${page < totalPages ? 'next' : 'first'} page_` : '';

        await interaction.editReply({
          content: header + pageInfo + navHint,
          embeds: embeds,
        });

      } catch (error) {
        console.error('Error in watch-votes:', error);
        await interaction.editReply({ content: '❌ Failed to fetch voting data. Check logs for details.' });
      }
      return;
    }

    if (commandName === 'stats') {
      try {
        const config = await guildConfigService.getConfig(guildId);
        if (!config) {
          await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Get optional monitored channel filter
        const monitoredChannel = interaction.options.getChannel('monitored', false);

        // Get active week
        const activeWeek = await weekService.getActiveWeek(monitoredChannel?.id);
        if (!activeWeek) {
          await interaction.editReply({ content: 'No active voting period. Use `/week start` to begin accepting posts.' });
          return;
        }

        // Get all posts for this week
        const allPosts = await postService.getPostsByWeek(activeWeek.id);

        // Filter by channel if specified
        const filteredPosts = monitoredChannel
          ? allPosts.filter(p => p.monitoredChannelId === monitoredChannel.id)
          : allPosts;

        // Count posts by status
        const pendingCount = filteredPosts.filter(p => p.status === PostStatus.PENDING).length;
        const shortlistedCount = filteredPosts.filter(p => p.status === PostStatus.SHORTLISTED).length;
        const rejectedCount = filteredPosts.filter(p => p.status === PostStatus.REJECTED).length;
        const totalCount = filteredPosts.length;

        // Get all votes for this week's posts
        const allVoterIds = new Set<string>();
        const votersThisWeek = new Set<string>();

        for (const post of filteredPosts) {
          const votes = await voteService.getAllVotesWithUsers(post.id);
          for (const vote of votes) {
            votersThisWeek.add(vote.userId);
          }
        }

        // Get all users with specified role (or voter roles from config)
        const guild = interaction.guild!;
        const specificRole = interaction.options.getRole('role', false);
        const roleIdsToCheck = specificRole ? [specificRole.id] : config.voterRoleIds;

        let eligibleVoters: string[] = [];
        let nonVoters: string[] = [];

        if (roleIdsToCheck.length > 0) {
          // Fetch members to ensure cache is complete
          await guild.members.fetch();

          for (const roleId of roleIdsToCheck) {
            const role = guild.roles.cache.get(roleId);
            if (role) {
              for (const [memberId, member] of role.members) {
                if (member.user.bot) continue;
                if (!eligibleVoters.includes(memberId)) {
                  eligibleVoters.push(memberId);
                }
              }
            }
          }

          // Filter: who voted and who didn't (only from eligible voters)
          for (const oderId of eligibleVoters) {
            if (!votersThisWeek.has(oderId)) {
              nonVoters.push(oderId);
            }
          }
        }

        // Build the embed
        const channelInfo = monitoredChannel ? ` (<#${monitoredChannel.id}>)` : '';

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`Statistics${channelInfo}`)
          .addFields(
            {
              name: 'Posts Overview',
              value: [
                `Total: **${totalCount}**`,
                `Pending: **${pendingCount}**`,
                `Shortlisted: **${shortlistedCount}**`,
                `Rejected: **${rejectedCount}**`
              ].join('\n'),
              inline: false
            }
          );

        // Add voter statistics
        if (roleIdsToCheck.length > 0) {
          // Voters who have voted (only eligible)
          const eligibleWhoVoted = eligibleVoters.filter(id => votersThisWeek.has(id));

          if (eligibleWhoVoted.length > 0) {
            const votersList = eligibleWhoVoted
              .slice(0, 25)
              .map(id => `<@${id}>`)
              .join(', ');

            const more = eligibleWhoVoted.length > 25 ? `\n... and ${eligibleWhoVoted.length - 25} more` : '';

            embed.addFields({
              name: `Voted (${eligibleWhoVoted.length})`,
              value: votersList + more,
              inline: false
            });
          } else {
            embed.addFields({
              name: 'Voted (0)',
              value: 'No one yet',
              inline: false
            });
          }

          // Voters who haven't voted
          if (nonVoters.length > 0) {
            const nonVotersList = nonVoters
              .slice(0, 25)
              .map(id => `<@${id}>`)
              .join(', ');

            const more = nonVoters.length > 25 ? `\n... and ${nonVoters.length - 25} more` : '';

            embed.addFields({
              name: `Not Voted Yet (${nonVoters.length})`,
              value: nonVotersList + more,
              inline: false
            });
          } else {
            embed.addFields({
              name: 'Not Voted Yet (0)',
              value: 'Everyone voted!',
              inline: false
            });
          }
        } else {
          // No voter roles configured - just show who voted
          if (votersThisWeek.size > 0) {
            const votersList = Array.from(votersThisWeek)
              .slice(0, 25)
              .map(id => `<@${id}>`)
              .join(', ');

            embed.addFields({
              name: `Voted (${votersThisWeek.size})`,
              value: votersList,
              inline: false
            });
          }

          embed.addFields({
            name: 'Note',
            value: '_Set voter roles with `/set-voter-roles` to track who hasn\'t voted._',
            inline: false
          });
        }

        // Add ranking statistics (who rated shortlisted posts)
        if (shortlistedCount > 0 && roleIdsToCheck.length > 0) {
          const ratersThisWeek = new Set<string>();
          const shortlistedPosts = filteredPosts.filter(p => p.status === PostStatus.SHORTLISTED);

          for (const post of shortlistedPosts) {
            const ratings = await prisma.rating.findMany({
              where: { postId: post.id },
              include: { user: true }
            });
            for (const rating of ratings) {
              ratersThisWeek.add(rating.user.discordId);
            }
          }

          const eligibleWhoRated = eligibleVoters.filter(id => ratersThisWeek.has(id));
          const nonRaters = eligibleVoters.filter(id => !ratersThisWeek.has(id));

          if (eligibleWhoRated.length > 0) {
            const ratersList = eligibleWhoRated
              .slice(0, 25)
              .map(id => `<@${id}>`)
              .join(', ');

            const more = eligibleWhoRated.length > 25 ? `\n... and ${eligibleWhoRated.length - 25} more` : '';

            embed.addFields({
              name: `Ranked Posts (${eligibleWhoRated.length})`,
              value: ratersList + more,
              inline: false
            });
          } else {
            embed.addFields({
              name: 'Ranked Posts (0)',
              value: 'No one yet',
              inline: false
            });
          }

          if (nonRaters.length > 0) {
            const nonRatersList = nonRaters
              .slice(0, 25)
              .map(id => `<@${id}>`)
              .join(', ');

            const more = nonRaters.length > 25 ? `\n... and ${nonRaters.length - 25} more` : '';

            embed.addFields({
              name: `Not Ranked Yet (${nonRaters.length})`,
              value: nonRatersList + more,
              inline: false
            });
          } else {
            embed.addFields({
              name: 'Not Ranked Yet (0)',
              value: 'Everyone ranked!',
              inline: false
            });
          }
        }

        // Add week info
        const startDate = activeWeek.startDate.toISOString().split('T')[0];
        embed.setFooter({ text: `Week started: ${startDate}` });
        embed.setTimestamp();

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error('Error in stats:', error);
        await interaction.editReply({ content: 'Failed to fetch statistics. Check logs for details.' });
      }
      return;
    }

    if (commandName === 'slopstats') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'voters') {
        try {
          const config = await guildConfigService.getConfig(guildId);
          if (!config) {
            await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
            return;
          }

          // Check if user has voter role (same permission as voting)
          const member = await interaction.guild!.members.fetch(interaction.user.id);
          const hasVoterRole = config.voterRoleIds.length === 0 ||
            config.voterRoleIds.some((roleId: string) => member.roles.cache.has(roleId));

          if (!hasVoterRole) {
            await interaction.reply({ content: '❌ You do not have permission to view voter stats.', ephemeral: true });
            return;
          }

          await interaction.deferReply();

          // Get leaderboard
          const leaderboard = await voterStatsService.getVoterLeaderboard();

          if (leaderboard.length === 0) {
            await interaction.editReply({ content: 'No voting data available yet. Votes are only counted after posts are decided (shortlisted or rejected).' });
            return;
          }

          // Build embed
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Top Voters')
            .setTimestamp();

          // Build leaderboard lines (top 10)
          const lines: string[] = [];
          const topVoters = leaderboard.slice(0, 10);

          for (let i = 0; i < topVoters.length; i++) {
            const voter = topVoters[i];
            const rank = i + 1;
            const accuracyStr = voter.accuracy.toFixed(0);
            lines.push(
              `${rank}. <@${voter.oderId}> — ${voter.correctVotes} correct (${accuracyStr}% of ${voter.totalVotes})`
            );
          }

          embed.setDescription(lines.join('\n'));

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error('Error in slopstats voters:', error);
          try {
            await interaction.editReply({ content: '❌ Failed to fetch voter statistics.' });
          } catch {
            await interaction.reply({ content: '❌ Failed to fetch voter statistics.', ephemeral: true });
          }
        }
        return;
      }
    }

    if (commandName === 'spam') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'check') {
        const targetUser = interaction.options.getUser('user', true);
        try {
          const config = await guildConfigService.getConfig(guildId);
          if (!config) {
            await interaction.reply({ content: 'Configuration not found.', ephemeral: true });
            return;
          }

          const { channelPairService } = await import('./services/ChannelPairService');
          const allChannelPairs = await channelPairService.getChannelPairs(guildId);

          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`Spam Status: ${targetUser.username}`)
            .setTimestamp();

          for (const pair of allChannelPairs) {
            const channelId = pair.monitoredChannelId;
            const channelName = interaction.guild!.channels.cache.get(channelId)?.name || channelId;

            const postLimitCheck = await spamPenaltyService.canUserPost(
              targetUser.id,
              guildId,
              channelId,
              config.defaultPostLimit
            );

            const currentWeekPenalties = await spamPenaltyService.getCurrentWeekPenalties(targetUser.id, guildId, channelId);
            const nextWeekLimit = Math.max(1, config.defaultPostLimit - currentWeekPenalties);

            let channelStatus = `Posts: **${postLimitCheck.currentCount}/${postLimitCheck.limit}**`;
            if (postLimitCheck.penaltiesFromLastWeek > 0) {
              channelStatus += `\nPenalties last week: **${postLimitCheck.penaltiesFromLastWeek}** (limit reduced)`;
            }
            if (currentWeekPenalties > 0) {
              channelStatus += `\nPenalties this week: **${currentWeekPenalties}** → next week limit: **${nextWeekLimit}/${config.defaultPostLimit}**`;
            }

            embed.addFields({ name: `#${channelName}`, value: channelStatus });
          }

          if (allChannelPairs.length === 0) {
            embed.setDescription('No monitored channels configured.');
          }

          await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
          console.error('Error in spam check:', error);
          await interaction.reply({ content: '❌ Failed to check spam status.', ephemeral: true });
        }
        return;
      }

      if (subcommand === 'reset') {
        const targetUser = interaction.options.getUser('user', true);
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
            await interaction.reply({ content: '❌ You do not have permission to reset spam penalties. (Admin role required)', ephemeral: true });
            return;
          }

          await spamPenaltyService.resetPenalties(targetUser.id, guildId);

          await modLogService.log(guildId, ModLogEventType.SPAM_PENALTY_RESET, {
            oderId: targetUser.id,
            adminId: interaction.user.id,
          });

          await interaction.reply({
            content: `✅ Spam penalties reset for <@${targetUser.id}>. Their post limit is now restored to default.`,
            ephemeral: true
          });
        } catch (error) {
          console.error('Error in spam reset:', error);
          await interaction.reply({ content: '❌ Failed to reset spam penalties.', ephemeral: true });
        }
        return;
      }

      if (subcommand === 'remove') {
        const postId = interaction.options.getString('post_id', true);
        try {
          const member = await interaction.guild!.members.fetch(interaction.user.id);
          const userRoleIds = Array.from(member.roles.cache.keys());

          const isAdmin = await guildConfigService.isUserAdmin(guildId, userRoleIds);
          if (!isAdmin) {
            await interaction.reply({ content: '❌ You do not have permission to remove spam penalties. (Admin role required)', ephemeral: true });
            return;
          }

          const removed = await spamPenaltyService.removePenaltyByPost(postId);

          if (!removed) {
            await interaction.reply({
              content: `❌ No spam penalty found for post \`${postId}\`.`,
              ephemeral: true
            });
            return;
          }

          await modLogService.log(guildId, ModLogEventType.SPAM_PENALTY_RESET, {
            postId,
            adminId: interaction.user.id,
            details: `Penalty removed for specific post ${postId}`,
          });

          await interaction.reply({
            content: `✅ Spam penalty removed for post \`${postId}\`.`,
            ephemeral: true
          });
        } catch (error) {
          console.error('Error in spam remove:', error);
          await interaction.reply({ content: '❌ Failed to remove spam penalty.', ephemeral: true });
        }
        return;
      }
    }
    if (commandName === 'weight') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'grant') {
        const targetUser = interaction.options.getUser('user', true);
        try {
          const granted = await weightBoostService.grantBoost(targetUser.id, guildId, interaction.user.id);
          if (granted) {
            await modLogService.log(guildId, ModLogEventType.WEIGHT_BOOST_GRANTED, {
              oderId: targetUser.id,
              adminId: interaction.user.id,
              details: `x2 vote weight granted to <@${targetUser.id}> by <@${interaction.user.id}>`,
            });
            await interaction.reply({ content: `✅ Granted x2 vote weight to <@${targetUser.id}>.`, ephemeral: true });
          } else {
            await interaction.reply({ content: `⚠️ <@${targetUser.id}> already has x2 vote weight.`, ephemeral: true });
          }
        } catch (error) {
          console.error('Error in weight grant:', error);
          await interaction.reply({ content: '❌ Failed to grant weight boost.', ephemeral: true });
        }
        return;
      }

      if (subcommand === 'revoke') {
        const targetUser = interaction.options.getUser('user', true);
        try {
          const revoked = await weightBoostService.revokeBoost(targetUser.id, guildId);
          if (revoked) {
            await modLogService.log(guildId, ModLogEventType.WEIGHT_BOOST_REVOKED, {
              oderId: targetUser.id,
              adminId: interaction.user.id,
              details: `x2 vote weight revoked from <@${targetUser.id}> by <@${interaction.user.id}>`,
            });
            await interaction.reply({ content: `✅ Revoked x2 vote weight from <@${targetUser.id}>.`, ephemeral: true });
          } else {
            await interaction.reply({ content: `⚠️ <@${targetUser.id}> does not have x2 vote weight.`, ephemeral: true });
          }
        } catch (error) {
          console.error('Error in weight revoke:', error);
          await interaction.reply({ content: '❌ Failed to revoke weight boost.', ephemeral: true });
        }
        return;
      }

      if (subcommand === 'list') {
        try {
          const boosts = await weightBoostService.getAllBoosts(guildId);

          if (boosts.length === 0) {
            await interaction.reply({ content: 'No users currently have x2 vote weight.', ephemeral: true });
            return;
          }

          const lines = boosts.map((b, i) =>
            `${i + 1}. <@${b.oderId}> — granted by <@${b.grantedBy}>`
          );

          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Users with x2 Vote Weight')
            .setDescription(lines.join('\n'))
            .setTimestamp();

          await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
          console.error('Error in weight list:', error);
          await interaction.reply({ content: '❌ Failed to list weight boosts.', ephemeral: true });
        }
        return;
      }
    }
  } catch (error) {
    console.error(`Error handling command ${commandName}:`, error);
    await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
  }
}
