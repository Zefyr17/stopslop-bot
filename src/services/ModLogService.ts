import { EmbedBuilder, TextChannel } from 'discord.js';
import { guildConfigService } from './GuildConfigService';
import { bot } from '../bot';

export enum ModLogEventType {
  POST_REJECTED_AUTO = 'POST_REJECTED_AUTO',
  POST_SHORTLISTED_AUTO = 'POST_SHORTLISTED_AUTO',
  ADMIN_OVERRIDE_APPROVE = 'ADMIN_OVERRIDE_APPROVE',
  ADMIN_OVERRIDE_REJECT = 'ADMIN_OVERRIDE_REJECT',
  ADMIN_OVERRIDE_RESET = 'ADMIN_OVERRIDE_RESET',
  RATING_CHANGED = 'RATING_CHANGED',
  DUPLICATE_LINK_DELETED = 'DUPLICATE_LINK_DELETED',
  WEEK_STARTED = 'WEEK_STARTED',
  WEEK_CLOSED = 'WEEK_CLOSED',
  EXPORT_RESULTS = 'EXPORT_RESULTS',
  BOT_ERROR = 'BOT_ERROR',
  SPAM_PENALTY_ADDED = 'SPAM_PENALTY_ADDED',
  SPAM_PENALTY_RESET = 'SPAM_PENALTY_RESET',
  POST_BLOCKED_SPAM = 'POST_BLOCKED_SPAM',
  WEIGHT_BOOST_GRANTED = 'WEIGHT_BOOST_GRANTED',
  WEIGHT_BOOST_REVOKED = 'WEIGHT_BOOST_REVOKED',
}

interface ModLogData {
  postId?: string;
  postLink?: string;
  authorId?: string;
  oderId?: string;
  monitoredChannelId?: string;
  adminId?: string;
  oldStatus?: string;
  newStatus?: string;
  votes?: { upvotes: number; downvotes: number };
  votersList?: Array<{ userId: string; voteType: string }>;
  rating?: number;
  error?: string;
  details?: string;
  weekId?: string;
  weekDates?: string;
  postsCount?: number;
  penaltyCount?: number;
  postLimit?: number;
}

export class ModLogService {
  /**
   * Log an event to the mod log channel
   */
  async log(guildId: string, eventType: ModLogEventType, data: ModLogData = {}): Promise<void> {
    try {
      const config = await guildConfigService.getConfig(guildId);
      if (!config?.modLogChannelId) {
        return;
      }

      const channel = await bot.channels.fetch(config.modLogChannelId);
      if (!channel || !channel.isTextBased()) {
        console.warn(`Mod log channel ${config.modLogChannelId} not found or not text-based`);
        return;
      }

      const embed = this.createLogEmbed(eventType, data);
      await (channel as TextChannel).send({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to send mod log:', error);
    }
  }

  private createLogEmbed(eventType: ModLogEventType, data: ModLogData): EmbedBuilder {
    const embed = new EmbedBuilder().setTimestamp();

    switch (eventType) {
      case ModLogEventType.POST_REJECTED_AUTO:
        embed
          .setColor(0xff0000)
          .setTitle('❌ Post Rejected (Auto)')
          .setDescription(`Post was automatically rejected due to reaching downvote threshold.`)
          .addFields(
            { name: 'Post ID', value: data.postId || 'Unknown', inline: true },
            { name: 'Author', value: data.authorId ? `<@${data.authorId}>` : 'Unknown', inline: true },
            { name: 'Votes', value: `👍 ${data.votes?.upvotes || 0} | 👎 ${data.votes?.downvotes || 0}`, inline: true }
          );
        if (data.monitoredChannelId) {
          embed.addFields({ name: 'Channel', value: `<#${data.monitoredChannelId}>`, inline: true });
        }
        if (data.postLink) {
          embed.addFields({ name: 'Link', value: data.postLink });
        }
        if (data.votersList && data.votersList.length > 0) {
          const upvoters = data.votersList.filter(v => v.voteType === 'UP').map(v => `<@${v.userId}>`);
          const downvoters = data.votersList.filter(v => v.voteType === 'DOWN').map(v => `<@${v.userId}>`);

          let votersText = '';
          if (upvoters.length > 0) {
            votersText += `**👍 Yes (${upvoters.length}):** ${upvoters.join(', ')}\n`;
          }
          if (downvoters.length > 0) {
            votersText += `**👎 No (${downvoters.length}):** ${downvoters.join(', ')}`;
          }

          if (votersText) {
            embed.addFields({ name: 'Details', value: votersText });
          }
        }
        break;

      case ModLogEventType.POST_SHORTLISTED_AUTO:
        embed
          .setColor(0x00ff00)
          .setTitle('✅ Post Shortlisted (Auto)')
          .setDescription(`Post was automatically shortlisted due to reaching upvote threshold.`)
          .addFields(
            { name: 'Post ID', value: data.postId || 'Unknown', inline: true },
            { name: 'Author', value: data.authorId ? `<@${data.authorId}>` : 'Unknown', inline: true },
            { name: 'Votes', value: `👍 ${data.votes?.upvotes || 0} | 👎 ${data.votes?.downvotes || 0}`, inline: true }
          );
        if (data.monitoredChannelId) {
          embed.addFields({ name: 'Channel', value: `<#${data.monitoredChannelId}>`, inline: true });
        }
        if (data.postLink) {
          embed.addFields({ name: 'Link', value: data.postLink });
        }
        if (data.votersList && data.votersList.length > 0) {
          const upvoters = data.votersList.filter(v => v.voteType === 'UP').map(v => `<@${v.userId}>`);
          const downvoters = data.votersList.filter(v => v.voteType === 'DOWN').map(v => `<@${v.userId}>`);

          let votersText = '';
          if (upvoters.length > 0) {
            votersText += `**👍 Yes (${upvoters.length}):** ${upvoters.join(', ')}\n`;
          }
          if (downvoters.length > 0) {
            votersText += `**👎 No (${downvoters.length}):** ${downvoters.join(', ')}`;
          }

          if (votersText) {
            embed.addFields({ name: 'Details', value: votersText });
          }
        }
        break;

      case ModLogEventType.ADMIN_OVERRIDE_APPROVE:
        embed
          .setColor(0x00aaff)
          .setTitle('🔐 Admin Override: Approve')
          .setDescription(`An admin manually approved this post.`)
          .addFields(
            { name: 'Post ID', value: data.postId || 'Unknown', inline: true },
            { name: 'Admin', value: data.adminId ? `<@${data.adminId}>` : 'Unknown', inline: true },
            { name: 'Previous Status', value: data.oldStatus || 'Unknown', inline: true }
          );
        if (data.postLink) {
          embed.addFields({ name: 'Link', value: data.postLink });
        }
        break;

      case ModLogEventType.ADMIN_OVERRIDE_REJECT:
        embed
          .setColor(0xffa500)
          .setTitle('🔐 Admin Override: Reject')
          .setDescription(`An admin manually rejected this post.`)
          .addFields(
            { name: 'Post ID', value: data.postId || 'Unknown', inline: true },
            { name: 'Admin', value: data.adminId ? `<@${data.adminId}>` : 'Unknown', inline: true },
            { name: 'Previous Status', value: data.oldStatus || 'Unknown', inline: true }
          );
        if (data.postLink) {
          embed.addFields({ name: 'Link', value: data.postLink });
        }
        break;

      case ModLogEventType.ADMIN_OVERRIDE_RESET:
        embed
          .setColor(0xffff00)
          .setTitle('♻️ Admin Override: Reset Votes')
          .setDescription(`An admin reset all votes for this post.`)
          .addFields(
            { name: 'Post ID', value: data.postId || 'Unknown', inline: true },
            { name: 'Admin', value: data.adminId ? `<@${data.adminId}>` : 'Unknown', inline: true },
            { name: 'Previous Status', value: data.oldStatus || 'Unknown', inline: true }
          );
        if (data.postLink) {
          embed.addFields({ name: 'Link', value: data.postLink });
        }
        if (data.details) {
          embed.addFields({ name: 'Details', value: data.details });
        }
        break;

      case ModLogEventType.RATING_CHANGED:
        embed
          .setColor(0xffd700)
          .setTitle('⭐ Rating Changed')
          .setDescription(`A judge updated their rating for this post.`)
          .addFields(
            { name: 'Post ID', value: data.postId || 'Unknown', inline: true },
            { name: 'Rating', value: data.rating ? `${data.rating}/10` : 'Unknown', inline: true }
          );
        break;

      case ModLogEventType.DUPLICATE_LINK_DELETED:
        embed
          .setColor(0xff6600)
          .setTitle('🚫 Duplicate Link Deleted')
          .setDescription(`A duplicate post was detected and removed.`)
          .addFields(
            { name: 'Post ID', value: data.postId || 'Unknown', inline: true }
          );
        if (data.postLink) {
          embed.addFields({ name: 'Link', value: data.postLink });
        }
        if (data.details) {
          embed.addFields({ name: 'Details', value: data.details });
        }
        break;

      case ModLogEventType.WEEK_STARTED:
        embed
          .setColor(0x00ff00)
          .setTitle('🎉 Week Started')
          .setDescription(`A new voting period has been started.`)
          .addFields(
            { name: 'Week ID', value: data.weekId || 'Unknown', inline: true },
            { name: 'Admin', value: data.adminId ? `<@${data.adminId}>` : 'System', inline: true },
            { name: 'Posts Count', value: data.postsCount?.toString() || '0', inline: true }
          );
        if (data.weekDates) {
          embed.addFields({ name: 'Period', value: data.weekDates });
        }
        if (data.details) {
          embed.addFields({ name: 'Details', value: data.details });
        }
        break;

      case ModLogEventType.WEEK_CLOSED:
        embed
          .setColor(0x5865F2)
          .setTitle('📅 Week Closed')
          .setDescription(`A week has been closed and results archived.`)
          .addFields(
            { name: 'Week ID', value: data.weekId || 'Unknown', inline: true },
            { name: 'Admin', value: data.adminId ? `<@${data.adminId}>` : 'System', inline: true },
            { name: 'Posts Count', value: data.postsCount?.toString() || '0', inline: true }
          );
        if (data.weekDates) {
          embed.addFields({ name: 'Period', value: data.weekDates });
        }
        if (data.details) {
          embed.addFields({ name: 'Details', value: data.details });
        }
        break;

      case ModLogEventType.EXPORT_RESULTS:
        embed
          .setColor(0x00aa00)
          .setTitle('📊 Results Exported')
          .setDescription(`Weekly results were exported to CSV.`)
          .addFields(
            { name: 'Week ID', value: data.weekId || 'Unknown', inline: true },
            { name: 'Admin', value: data.adminId ? `<@${data.adminId}>` : 'Unknown', inline: true },
            { name: 'Posts Exported', value: data.postsCount?.toString() || '0', inline: true }
          );
        break;

      case ModLogEventType.BOT_ERROR:
        embed
          .setColor(0xaa0000)
          .setTitle('⚠️ Critical Bot Error')
          .setDescription(data.error || 'An unexpected error occurred.')
          .addFields(
            { name: 'Error Details', value: data.details || 'No additional details' }
          );
        break;

      case ModLogEventType.SPAM_PENALTY_ADDED:
        embed
          .setColor(0xff4500)
          .setTitle('🚨 Spam Penalty Added')
          .setDescription(`User received a spam penalty for low quality content.`)
          .addFields(
            { name: 'User', value: data.oderId ? `<@${data.oderId}>` : 'Unknown', inline: true },
            { name: 'Penalty #', value: data.penaltyCount?.toString() || '1', inline: true },
            { name: 'Post ID', value: data.postId || 'Unknown', inline: true }
          );
        if (data.postLink) {
          embed.addFields({ name: 'Link', value: data.postLink });
        }
        if (data.details) {
          embed.addFields({ name: 'Details', value: data.details });
        }
        break;

      case ModLogEventType.SPAM_PENALTY_RESET:
        embed
          .setColor(0x00ff00)
          .setTitle('✅ Spam Penalties Reset')
          .setDescription(`Admin reset spam penalties for a user.`)
          .addFields(
            { name: 'User', value: data.oderId ? `<@${data.oderId}>` : 'Unknown', inline: true },
            { name: 'Admin', value: data.adminId ? `<@${data.adminId}>` : 'Unknown', inline: true }
          );
        break;

      case ModLogEventType.POST_BLOCKED_SPAM:
        embed
          .setColor(0xff0000)
          .setTitle('🛑 Post Blocked (Spam Limit)')
          .setDescription(`User attempted to post but was blocked due to spam penalties.`)
          .addFields(
            { name: 'User', value: data.oderId ? `<@${data.oderId}>` : 'Unknown', inline: true },
            { name: 'Post Limit', value: data.postLimit?.toString() || '0', inline: true }
          );
        if (data.postLink) {
          embed.addFields({ name: 'Attempted Link', value: data.postLink });
        }
        if (data.details) {
          embed.addFields({ name: 'Details', value: data.details });
        }
        break;

      case ModLogEventType.WEIGHT_BOOST_GRANTED:
        embed
          .setColor(0x00ff00)
          .setTitle('⚖️ Vote Weight x2 Granted')
          .addFields(
            { name: 'User', value: data.oderId ? `<@${data.oderId}>` : 'Unknown', inline: true },
            { name: 'Granted By', value: data.adminId ? `<@${data.adminId}>` : 'Unknown', inline: true }
          );
        break;

      case ModLogEventType.WEIGHT_BOOST_REVOKED:
        embed
          .setColor(0xff6600)
          .setTitle('⚖️ Vote Weight x2 Revoked')
          .addFields(
            { name: 'User', value: data.oderId ? `<@${data.oderId}>` : 'Unknown', inline: true },
            { name: 'Revoked By', value: data.adminId ? `<@${data.adminId}>` : 'Unknown', inline: true }
          );
        break;

      default:
        embed
          .setColor(0x888888)
          .setTitle('📋 Mod Log Event')
          .setDescription('An event was logged.');
    }

    return embed;
  }
}

export const modLogService = new ModLogService();
