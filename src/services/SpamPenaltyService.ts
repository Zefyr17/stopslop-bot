import { prisma } from '../db';
import { PostStatus, WeekStatus } from '@prisma/client';
import { spamCooldownService } from './SpamCooldownService';
import { slotGrantService } from './SlotGrantService';

const DEFAULT_POST_LIMIT = 3;

export class SpamPenaltyService {
  /**
   * A post qualifies as "low quality" if it was rejected with 0 YES votes.
   */
  isLowQualitySpam(upvotes: number, _downvotes: number, _downvoteThreshold: number): boolean {
    return upvotes === 0;
  }

  async addPenalty(discordUserId: string, guildId: string, postId: string, weekId: string): Promise<number> {
    await prisma.spamPenalty.create({
      data: { oderId: discordUserId, guildId, postId, weekId },
    });

    const count = await prisma.spamPenalty.count({
      where: { oderId: discordUserId, guildId, weekId },
    });

    console.log(`[SpamPenalty] Added penalty for user ${discordUserId} on post ${postId} in week ${weekId}. Total this week: ${count}`);
    return count;
  }

  async getPostLimit(discordUserId: string, guildId: string, monitoredChannelId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<number> {
    const details = await this.getPostLimitDetails(discordUserId, guildId, monitoredChannelId, defaultLimit);
    return details.limit;
  }

  /**
   * Cumulative penalty logic:
   *
   * Each closed week:
   *   limit = clamp(limit - badPosts + shortlisted, 0, defaultLimit)
   *
   * "bad post" = rejected with 0 YES votes = one SpamPenalty record
   * "shortlisted" = post with SHORTLISTED status
   *
   * When limit reaches 0 → 2-week cooldown is set automatically on /week close.
   * After cooldown expires → limit resets to defaultLimit.
   */
  async getPostLimitDetails(
    discordUserId: string,
    guildId: string,
    monitoredChannelId: string,
    defaultLimit: number = DEFAULT_POST_LIMIT,
  ): Promise<{
    limit: number;
    lastWeekPenalties: number;
    lastWeekShortlisted: number;
    closedWeeksCount: number;
  }> {
    const closedWeeks = await prisma.week.findMany({
      where: { status: WeekStatus.CLOSED, monitoredChannelId },
      orderBy: { endDate: 'asc' },
      select: { id: true },
    });

    if (closedWeeks.length === 0) {
      return { limit: defaultLimit, lastWeekPenalties: 0, lastWeekShortlisted: 0, closedWeeksCount: 0 };
    }

    let currentLimit = defaultLimit;
    let lastWeekPenalties = 0;
    let lastWeekShortlisted = 0;

    for (const week of closedWeeks) {
      const penalties = await prisma.spamPenalty.count({
        where: { oderId: discordUserId, guildId, weekId: week.id },
      });

      const shortlisted = await prisma.post.count({
        where: { authorId: discordUserId, monitoredChannelId, weekId: week.id, status: { in: [PostStatus.SHORTLISTED, 'RANKED' as PostStatus] } },
      });

      if (currentLimit === 0) {
        // Was at 0 last week (sat out cooldown) → reset to full
        currentLimit = defaultLimit;
      } else {
        currentLimit = Math.min(defaultLimit, Math.max(0, currentLimit - penalties + shortlisted));
      }

      lastWeekPenalties = penalties;
      lastWeekShortlisted = shortlisted;
    }

    return { limit: currentLimit, lastWeekPenalties, lastWeekShortlisted, closedWeeksCount: closedWeeks.length };
  }

  /**
   * Batch version for multiple users at once.
   */
  async getBulkPostLimits(
    userIds: string[],
    guildId: string,
    monitoredChannelId: string,
    defaultLimit: number = DEFAULT_POST_LIMIT,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>(userIds.map(id => [id, defaultLimit]));

    const closedWeeks = await prisma.week.findMany({
      where: { status: WeekStatus.CLOSED, monitoredChannelId },
      orderBy: { endDate: 'asc' },
      select: { id: true },
    });

    if (closedWeeks.length === 0) return result;

    const weekIds = closedWeeks.map(w => w.id);

    const allPenalties = await prisma.spamPenalty.groupBy({
      by: ['oderId', 'weekId'],
      where: { oderId: { in: userIds }, guildId, weekId: { in: weekIds } },
      _count: { id: true },
    });

    const allShortlisted = await prisma.post.groupBy({
      by: ['authorId', 'weekId'],
      where: { authorId: { in: userIds }, monitoredChannelId, weekId: { in: weekIds }, status: { in: [PostStatus.SHORTLISTED, 'RANKED' as PostStatus] } },
      _count: { id: true },
    });

    const penaltyMap = new Map<string, number>();
    for (const row of allPenalties) penaltyMap.set(`${row.oderId}:${row.weekId}`, row._count.id);

    const shortlistedMap = new Map<string, number>();
    for (const row of allShortlisted) shortlistedMap.set(`${row.authorId}:${row.weekId}`, row._count.id);

    for (const userId of userIds) {
      let currentLimit = defaultLimit;
      for (const week of closedWeeks) {
        const penalties = penaltyMap.get(`${userId}:${week.id}`) ?? 0;
        const shortlisted = shortlistedMap.get(`${userId}:${week.id}`) ?? 0;
        if (currentLimit === 0) {
          currentLimit = defaultLimit;
        } else {
          currentLimit = Math.min(defaultLimit, Math.max(0, currentLimit - penalties + shortlisted));
        }
      }
      result.set(userId, currentLimit);
    }

    return result;
  }

  async getUserPostCount(discordUserId: string, monitoredChannelId: string): Promise<number> {
    const activeWeek = await prisma.week.findFirst({
      where: { status: WeekStatus.ACTIVE, monitoredChannelId },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeWeek) return 0;
    return prisma.post.count({
      where: { authorId: discordUserId, weekId: activeWeek.id, monitoredChannelId },
    });
  }

  async canUserPost(
    discordUserId: string,
    guildId: string,
    monitoredChannelId: string,
    defaultLimit: number = DEFAULT_POST_LIMIT,
  ): Promise<{ canPost: boolean; currentCount: number; limit: number; penaltyBalance: number; totalPenalties: number; totalShortlisted: number; closedWeeksCount: number }> {
    const details = await this.getPostLimitDetails(discordUserId, guildId, monitoredChannelId, defaultLimit);
    const currentCount = await this.getUserPostCount(discordUserId, monitoredChannelId);

    // Add bonus slots from admin grants for the active week
    const activeWeek = await prisma.week.findFirst({
      where: { status: WeekStatus.ACTIVE, monitoredChannelId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const grants = activeWeek
      ? await slotGrantService.getGrantCount(discordUserId, guildId, monitoredChannelId, activeWeek.id)
      : 0;
    const effectiveLimit = details.limit + grants;

    return {
      canPost: currentCount < effectiveLimit,
      currentCount,
      limit: effectiveLimit,
      penaltyBalance: defaultLimit - details.limit,
      totalPenalties: details.lastWeekPenalties,
      totalShortlisted: details.lastWeekShortlisted,
      closedWeeksCount: details.closedWeeksCount,
    };
  }

  async getCurrentWeekStats(discordUserId: string, guildId: string, monitoredChannelId: string): Promise<{ penalties: number; shortlisted: number }> {
    const activeWeek = await prisma.week.findFirst({
      where: { status: WeekStatus.ACTIVE, monitoredChannelId },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeWeek) return { penalties: 0, shortlisted: 0 };

    const penalties = await prisma.spamPenalty.count({
      where: { oderId: discordUserId, guildId, weekId: activeWeek.id },
    });
    const shortlisted = await prisma.post.count({
      where: { authorId: discordUserId, monitoredChannelId, weekId: activeWeek.id, status: PostStatus.SHORTLISTED },
    });
    return { penalties, shortlisted };
  }

  async resetPenalties(discordUserId: string, guildId: string): Promise<void> {
    await prisma.spamPenalty.deleteMany({ where: { oderId: discordUserId, guildId } });
    console.log(`[SpamPenalty] Reset all penalties for user ${discordUserId} in guild ${guildId}`);
  }

  async removeOnePenalty(discordUserId: string, guildId: string, monitoredChannelId?: string): Promise<boolean> {
    // Find the most recent closed week for this channel — that's the one affecting current limit
    const lastClosedWeek = await prisma.week.findFirst({
      where: {
        status: WeekStatus.CLOSED,
        ...(monitoredChannelId ? { monitoredChannelId } : {}),
      },
      orderBy: { endDate: 'desc' },
      select: { id: true },
    });

    if (!lastClosedWeek) return false;

    const penalty = await prisma.spamPenalty.findFirst({
      where: { oderId: discordUserId, guildId, weekId: lastClosedWeek.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!penalty) return false;
    await prisma.spamPenalty.delete({ where: { id: penalty.id } });
    console.log(`[SpamPenalty] Removed one penalty for user ${discordUserId} in guild ${guildId}${monitoredChannelId ? ` for channel ${monitoredChannelId}` : ''}`);
    return true;
  }

  async removePenaltyByPost(postId: string): Promise<boolean> {
    const penalty = await prisma.spamPenalty.findUnique({ where: { postId } });
    if (!penalty) return false;
    await prisma.spamPenalty.delete({ where: { postId } });
    console.log(`[SpamPenalty] Removed penalty for post ${postId}`);
    return true;
  }

  /**
   * Called on /week close. Sets 2-week cooldown for users who just hit limit=0.
   */
  async applyWeekCloseCooldowns(guildId: string, monitoredChannelId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<void> {
    const authorRows = await prisma.post.findMany({
      where: { monitoredChannelId },
      select: { authorId: true },
      distinct: ['authorId'],
    });

    if (authorRows.length === 0) return;

    const userIds = authorRows.map(r => r.authorId);

    // Single batched query for all users instead of N×M individual queries
    const limitsMap = await this.getBulkPostLimits(userIds, guildId, monitoredChannelId, defaultLimit);

    // Fetch all existing active cooldowns for this channel in one query
    const existingCooldowns = await prisma.spamCooldown.findMany({
      where: {
        oderId: { in: userIds },
        guildId,
        monitoredChannelId,
        expiresAt: { gt: new Date() },
      },
      select: { oderId: true },
    });
    const usersWithCooldown = new Set(existingCooldowns.map(c => c.oderId));

    for (const userId of userIds) {
      const limit = limitsMap.get(userId) ?? defaultLimit;
      if (limit === 0 && !usersWithCooldown.has(userId)) {
        await spamCooldownService.setCooldown(userId, guildId, monitoredChannelId, 'system', 7);
        console.log(`[SpamPenalty] Auto-cooldown set for user ${userId} in channel ${monitoredChannelId} (limit=0)`);
      }
    }
  }
}

export const spamPenaltyService = new SpamPenaltyService();
