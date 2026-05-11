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
   * Get the post limit for a user based on their history.
   *
   * The limit evolves week by week:
   *   limit_this_week = clamp(limit_last_week - penalties_last_week + shortlisted_last_week, 1, default)
   *
   * If last week had no penalties and no shortlisted posts, the limit carries over unchanged.
   * Penalties reduce the limit, shortlisted posts recover it, clamped between 1 and defaultLimit.
   */
  async getPostLimit(discordUserId: string, guildId: string, monitoredChannelId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<number> {
    const details = await this.getPostLimitDetails(discordUserId, guildId, monitoredChannelId, defaultLimit);
    return details.limit;
  }

  async getPostLimitDetails(discordUserId: string, guildId: string, monitoredChannelId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<{
    limit: number;
    lastWeekPenalties: number;
    lastWeekShortlisted: number;
    closedWeeksCount: number;
  }> {
    // Get all closed weeks in chronological order
    const closedWeeks = await prisma.week.findMany({
      where: { status: WeekStatus.CLOSED, monitoredChannelId },
      orderBy: { endDate: 'asc' },
      select: { id: true },
    });

    if (closedWeeks.length === 0) {
      return { limit: defaultLimit, lastWeekPenalties: 0, lastWeekShortlisted: 0, closedWeeksCount: 0 };
    }

    // Walk through all closed weeks in order, applying each week's delta to the previous limit
    // This way: limit_week_N = clamp(limit_week_(N-1) + shortlisted_N - penalties_N, 1, default)
    let currentLimit = defaultLimit;
    let lastWeekPenalties = 0;
    let lastWeekShortlisted = 0;

    for (const week of closedWeeks) {
      const penalties = await prisma.spamPenalty.count({
        where: { oderId: discordUserId, guildId, weekId: week.id },
      });

      const shortlisted = await prisma.post.count({
        where: {
          authorId: discordUserId,
          monitoredChannelId,
          weekId: week.id,
          status: PostStatus.SHORTLISTED,
        },
      });

      // 3+ penalties in a week → hard ban next week (limit = 0)
      if (penalties >= 3) {
        currentLimit = 0;
      } else {
        currentLimit = Math.min(defaultLimit, Math.max(1, currentLimit - penalties + shortlisted));
      }
      lastWeekPenalties = penalties;
      lastWeekShortlisted = shortlisted;
    }

    return { limit: currentLimit, lastWeekPenalties, lastWeekShortlisted, closedWeeksCount: closedWeeks.length };
  }

  /**
   * Batch version of getPostLimit for multiple users at once.
   * Makes 3 total queries regardless of user count.
   */
  async getBulkPostLimits(userIds: string[], guildId: string, monitoredChannelId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<Map<string, number>> {
    const result = new Map<string, number>(userIds.map(id => [id, defaultLimit]));

    const closedWeeks = await prisma.week.findMany({
      where: { status: WeekStatus.CLOSED, monitoredChannelId },
      orderBy: { endDate: 'asc' },
      select: { id: true },
    });

    if (closedWeeks.length === 0) return result;

    const weekIds = closedWeeks.map(w => w.id);

    // Fetch all penalties for all users across all closed weeks in one query
    const allPenalties = await prisma.spamPenalty.groupBy({
      by: ['oderId', 'weekId'],
      where: { oderId: { in: userIds }, guildId, weekId: { in: weekIds } },
      _count: { id: true },
    });

    // Fetch all shortlisted posts for all users across all closed weeks in one query
    const allShortlisted = await prisma.post.groupBy({
      by: ['authorId', 'weekId'],
      where: { authorId: { in: userIds }, monitoredChannelId, weekId: { in: weekIds }, status: PostStatus.SHORTLISTED },
      _count: { id: true },
    });

    // Index by userId+weekId for O(1) lookup
    const penaltyMap = new Map<string, number>();
    for (const row of allPenalties) penaltyMap.set(`${row.oderId}:${row.weekId}`, row._count.id);

    const shortlistedMap = new Map<string, number>();
    for (const row of allShortlisted) shortlistedMap.set(`${row.authorId}:${row.weekId}`, row._count.id);

    // Walk weeks in order for each user
    for (const userId of userIds) {
      let currentLimit = defaultLimit;
      for (const week of closedWeeks) {
        const penalties = penaltyMap.get(`${userId}:${week.id}`) ?? 0;
        const shortlisted = shortlistedMap.get(`${userId}:${week.id}`) ?? 0;
        if (penalties >= 3) {
          currentLimit = 0;
        } else {
          currentLimit = Math.min(defaultLimit, Math.max(1, currentLimit - penalties + shortlisted));
        }
      }
      result.set(userId, currentLimit);
    }

    return result;
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
      totalPenalties: details.lastWeekPenalties,
      totalShortlisted: details.lastWeekShortlisted,
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
