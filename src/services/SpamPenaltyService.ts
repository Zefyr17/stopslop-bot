import { prisma } from '../db';

const DEFAULT_POST_LIMIT = 3;

export class SpamPenaltyService {
  /**
   * Check if a rejected post qualifies as "low quality spam".
   * A post is considered spam if:
   * - It was rejected (status = REJECTED)
   * - Upvotes are between 0-2 (no significant support)
   * - Downvotes reached the threshold (5 by default)
   */
  isLowQualitySpam(upvotes: number, downvotes: number, downvoteThreshold: number): boolean {
    return upvotes <= 2 && downvotes >= downvoteThreshold;
  }

  /**
   * Add a spam penalty for a user.
   * Penalties are tracked per week - they affect the NEXT week's post limit.
   */
  async addPenalty(discordUserId: string, guildId: string): Promise<number> {
    // Get the start of current week (Monday)
    const now = new Date();
    const weekStart = this.getWeekStart(now);

    const penalty = await prisma.spamPenalty.upsert({
      where: {
        oderId_guildId_weekStartDate: {
          oderId: discordUserId,
          guildId,
          weekStartDate: weekStart,
        },
      },
      update: {
        penaltyCount: { increment: 1 },
      },
      create: {
        oderId: discordUserId,
        guildId,
        weekStartDate: weekStart,
        penaltyCount: 1,
      },
    });

    console.log(`[SpamPenalty] Added penalty for user ${discordUserId} in guild ${guildId}. Total penalties this week: ${penalty.penaltyCount}`);
    return penalty.penaltyCount;
  }

  /**
   * Get the post limit for a user for the current week.
   * Post limit = defaultLimit - penalties from PREVIOUS week
   */
  async getPostLimit(discordUserId: string, guildId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<number> {
    // Get start of PREVIOUS week to check penalties
    const now = new Date();
    const currentWeekStart = this.getWeekStart(now);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const penalty = await prisma.spamPenalty.findUnique({
      where: {
        oderId_guildId_weekStartDate: {
          oderId: discordUserId,
          guildId,
          weekStartDate: previousWeekStart,
        },
      },
    });

    const penaltyCount = penalty?.penaltyCount || 0;
    const limit = Math.max(0, defaultLimit - penaltyCount);

    return limit;
  }

  /**
   * Get user's current post count for this week in monitored channels.
   */
  async getUserPostCount(discordUserId: string, guildId: string, monitoredChannelIds: string[]): Promise<number> {
    const now = new Date();
    const weekStart = this.getWeekStart(now);

    const count = await prisma.post.count({
      where: {
        authorId: discordUserId,
        monitoredChannelId: { in: monitoredChannelIds },
        createdAt: { gte: weekStart },
      },
    });

    return count;
  }

  /**
   * Check if user can post (hasn't exceeded their limit).
   * Returns { canPost, currentCount, limit, penaltiesFromLastWeek }
   */
  async canUserPost(
    discordUserId: string,
    guildId: string,
    monitoredChannelIds: string[],
    defaultLimit: number = DEFAULT_POST_LIMIT
  ): Promise<{ canPost: boolean; currentCount: number; limit: number; penaltiesFromLastWeek: number }> {
    const limit = await this.getPostLimit(discordUserId, guildId, defaultLimit);
    const currentCount = await this.getUserPostCount(discordUserId, guildId, monitoredChannelIds);

    // Get penalties from last week for info
    const now = new Date();
    const currentWeekStart = this.getWeekStart(now);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const penalty = await prisma.spamPenalty.findUnique({
      where: {
        oderId_guildId_weekStartDate: {
          oderId: discordUserId,
          guildId,
          weekStartDate: previousWeekStart,
        },
      },
    });

    return {
      canPost: currentCount < limit,
      currentCount,
      limit,
      penaltiesFromLastWeek: penalty?.penaltyCount || 0,
    };
  }

  /**
   * Get penalties for current week (will affect next week).
   */
  async getCurrentWeekPenalties(discordUserId: string, guildId: string): Promise<number> {
    const now = new Date();
    const weekStart = this.getWeekStart(now);

    const penalty = await prisma.spamPenalty.findUnique({
      where: {
        oderId_guildId_weekStartDate: {
          oderId: discordUserId,
          guildId,
          weekStartDate: weekStart,
        },
      },
    });

    return penalty?.penaltyCount || 0;
  }

  /**
   * Reset penalties for a user (admin command).
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
   * Get the start of the week (Monday 00:00:00 UTC).
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    d.setUTCDate(diff);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}

export const spamPenaltyService = new SpamPenaltyService();
