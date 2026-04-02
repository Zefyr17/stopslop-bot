import { prisma } from '../db';
import { PostStatus, WeekStatus } from '@prisma/client';

const DEFAULT_POST_LIMIT = 4;

export class SpamPenaltyService {
  /**
   * Check if a rejected post qualifies as "low quality spam".
   * A post is considered spam if:
   * - It was rejected (status = REJECTED)
   * - Upvotes are 0 (nobody voted Yes)
   * - Downvotes reached the threshold (5 by default)
   */
  isLowQualitySpam(upvotes: number, downvotes: number, downvoteThreshold: number): boolean {
    return upvotes === 0 && downvotes >= downvoteThreshold;
  }

  /**
   * Add a spam penalty for a user, linked to a specific post and its week.
   */
  async addPenalty(discordUserId: string, guildId: string, postId: string, weekId: string): Promise<number> {
    await prisma.spamPenalty.create({
      data: {
        oderId: discordUserId,
        guildId,
        postId,
        weekId,
      },
    });

    // Count total penalties in this week
    const count = await prisma.spamPenalty.count({
      where: {
        oderId: discordUserId,
        guildId,
        weekId,
      },
    });

    console.log(`[SpamPenalty] Added penalty for user ${discordUserId} on post ${postId} in week ${weekId}. Total penalties this week: ${count}`);
    return count;
  }

  /**
   * Get the cumulative post limit for a user.
   *
   * The limit is calculated across ALL closed weeks:
   * - Each penalty (spam post) gives -1
   * - Each shortlisted post gives +1 (recovery)
   * - Result: defaultLimit - totalPenalties + totalShortlisted, clamped to [1, defaultLimit]
   *
   * This means a user must earn back their post slots by getting posts shortlisted.
   */
  async getPostLimit(discordUserId: string, guildId: string, monitoredChannelId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<number> {
    const details = await this.getPostLimitDetails(discordUserId, guildId, monitoredChannelId, defaultLimit);
    return details.limit;
  }

  async getPostLimitDetails(discordUserId: string, guildId: string, monitoredChannelId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<{
    limit: number;
    totalPenalties: number;
    totalShortlisted: number;
    closedWeeksCount: number;
  }> {
    const closedWeeks = await prisma.week.findMany({
      where: {
        status: WeekStatus.CLOSED,
        monitoredChannelId,
      },
      select: { id: true },
    });

    if (closedWeeks.length === 0) {
      return { limit: defaultLimit, totalPenalties: 0, totalShortlisted: 0, closedWeeksCount: 0 };
    }

    const closedWeekIds = closedWeeks.map(w => w.id);

    const totalPenalties = await prisma.spamPenalty.count({
      where: {
        oderId: discordUserId,
        guildId,
        weekId: { in: closedWeekIds },
      },
    });

    const totalShortlisted = await prisma.post.count({
      where: {
        authorId: discordUserId,
        monitoredChannelId,
        weekId: { in: closedWeekIds },
        status: PostStatus.SHORTLISTED,
      },
    });

    const limit = Math.min(defaultLimit, Math.max(1, defaultLimit - totalPenalties + totalShortlisted));
    return { limit, totalPenalties, totalShortlisted, closedWeeksCount: closedWeeks.length };
  }

  /**
   * Get user's current post count for the active week of a specific channel.
   */
  async getUserPostCount(discordUserId: string, monitoredChannelId: string): Promise<number> {
    const activeWeek = await prisma.week.findFirst({
      where: {
        status: WeekStatus.ACTIVE,
        monitoredChannelId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeWeek) {
      return 0;
    }

    return prisma.post.count({
      where: {
        authorId: discordUserId,
        weekId: activeWeek.id,
        monitoredChannelId,
      },
    });
  }

  /**
   * Check if user can post (hasn't exceeded their limit) in a specific channel.
   */
  async canUserPost(
    discordUserId: string,
    guildId: string,
    monitoredChannelId: string,
    defaultLimit: number = DEFAULT_POST_LIMIT
  ): Promise<{ canPost: boolean; currentCount: number; limit: number; penaltyBalance: number; totalPenalties: number; totalShortlisted: number; closedWeeksCount: number }> {
    const details = await this.getPostLimitDetails(discordUserId, guildId, monitoredChannelId, defaultLimit);
    const currentCount = await this.getUserPostCount(discordUserId, monitoredChannelId);

    return {
      canPost: currentCount < details.limit,
      currentCount,
      limit: details.limit,
      penaltyBalance: defaultLimit - details.limit,
      totalPenalties: details.totalPenalties,
      totalShortlisted: details.totalShortlisted,
      closedWeeksCount: details.closedWeeksCount,
    };
  }

  /**
   * Get penalties and shortlisted counts for the current active week of a channel.
   */
  async getCurrentWeekStats(discordUserId: string, guildId: string, monitoredChannelId: string): Promise<{ penalties: number; shortlisted: number }> {
    const activeWeek = await prisma.week.findFirst({
      where: {
        status: WeekStatus.ACTIVE,
        monitoredChannelId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeWeek) {
      return { penalties: 0, shortlisted: 0 };
    }

    const penalties = await prisma.spamPenalty.count({
      where: {
        oderId: discordUserId,
        guildId,
        weekId: activeWeek.id,
      },
    });

    const shortlisted = await prisma.post.count({
      where: {
        authorId: discordUserId,
        monitoredChannelId,
        weekId: activeWeek.id,
        status: PostStatus.SHORTLISTED,
      },
    });

    return { penalties, shortlisted };
  }

  /**
   * Reset all penalties for a user (admin command).
   */
  async resetPenalties(discordUserId: string, guildId: string): Promise<void> {
    await prisma.spamPenalty.deleteMany({
      where: {
        oderId: discordUserId,
        guildId,
      },
    });
    console.log(`[SpamPenalty] Reset all penalties for user ${discordUserId} in guild ${guildId}`);
  }

  /**
   * Remove one penalty from a user, giving them +1 post slot.
   * Returns true if a penalty was found and removed, false if user has no penalties.
   */
  async removeOnePenalty(discordUserId: string, guildId: string, monitoredChannelId?: string): Promise<boolean> {
    let weekIds: string[] | undefined;
    if (monitoredChannelId) {
      const weeks = await prisma.week.findMany({
        where: { monitoredChannelId },
        select: { id: true },
      });
      weekIds = weeks.map(w => w.id);
      if (weekIds.length === 0) return false;
    }

    const penalty = await prisma.spamPenalty.findFirst({
      where: {
        oderId: discordUserId,
        guildId,
        ...(weekIds ? { weekId: { in: weekIds } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!penalty) return false;
    await prisma.spamPenalty.delete({ where: { id: penalty.id } });
    console.log(`[SpamPenalty] Removed one penalty for user ${discordUserId} in guild ${guildId}${monitoredChannelId ? ` for channel ${monitoredChannelId}` : ''}`);
    return true;
  }

  /**
   * Remove penalty for a specific post.
   * Returns true if a penalty was found and removed, false otherwise.
   */
  async removePenaltyByPost(postId: string): Promise<boolean> {
    const penalty = await prisma.spamPenalty.findUnique({
      where: { postId },
    });

    if (!penalty) return false;

    await prisma.spamPenalty.delete({
      where: { postId },
    });

    console.log(`[SpamPenalty] Removed penalty for post ${postId}`);
    return true;
  }
}

export const spamPenaltyService = new SpamPenaltyService();
