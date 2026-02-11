import { prisma } from '../db';

const DEFAULT_POST_LIMIT = 3;

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
   * Add a spam penalty for a user, linked to a specific post.
   * Each post can only have one penalty.
   */
  async addPenalty(discordUserId: string, guildId: string, postId: string): Promise<number> {
    const now = new Date();
    const weekStart = this.getWeekStart(now);

    await prisma.spamPenalty.create({
      data: {
        oderId: discordUserId,
        guildId,
        postId,
        weekStartDate: weekStart,
      },
    });

    // Count total penalties this week
    const count = await prisma.spamPenalty.count({
      where: {
        oderId: discordUserId,
        guildId,
        weekStartDate: weekStart,
      },
    });

    console.log(`[SpamPenalty] Added penalty for user ${discordUserId} on post ${postId}. Total penalties this week: ${count}`);
    return count;
  }

  /**
   * Get the post limit for a user for the current week.
   * Post limit = defaultLimit - penalties from PREVIOUS week
   */
  async getPostLimit(discordUserId: string, guildId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<number> {
    const now = new Date();
    const currentWeekStart = this.getWeekStart(now);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const penaltyCount = await prisma.spamPenalty.count({
      where: {
        oderId: discordUserId,
        guildId,
        weekStartDate: previousWeekStart,
      },
    });

    return Math.max(1, defaultLimit - penaltyCount);
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
   */
  async canUserPost(
    discordUserId: string,
    guildId: string,
    monitoredChannelIds: string[],
    defaultLimit: number = DEFAULT_POST_LIMIT
  ): Promise<{ canPost: boolean; currentCount: number; limit: number; penaltiesFromLastWeek: number }> {
    const limit = await this.getPostLimit(discordUserId, guildId, defaultLimit);
    const currentCount = await this.getUserPostCount(discordUserId, guildId, monitoredChannelIds);

    const now = new Date();
    const currentWeekStart = this.getWeekStart(now);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const penaltiesFromLastWeek = await prisma.spamPenalty.count({
      where: {
        oderId: discordUserId,
        guildId,
        weekStartDate: previousWeekStart,
      },
    });

    return {
      canPost: currentCount < limit,
      currentCount,
      limit,
      penaltiesFromLastWeek,
    };
  }

  /**
   * Get penalties for current week (will affect next week).
   */
  async getCurrentWeekPenalties(discordUserId: string, guildId: string): Promise<number> {
    const now = new Date();
    const weekStart = this.getWeekStart(now);

    return prisma.spamPenalty.count({
      where: {
        oderId: discordUserId,
        guildId,
        weekStartDate: weekStart,
      },
    });
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

  /**
   * Get the start of the week (Monday 00:00:00 UTC).
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}

export const spamPenaltyService = new SpamPenaltyService();
