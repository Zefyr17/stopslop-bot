import { prisma } from '../db';
import { WeekStatus } from '@prisma/client';

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
   * Get the post limit for a user based on penalties from the previous closed week
   * for the same monitored channel.
   */
  async getPostLimit(discordUserId: string, guildId: string, monitoredChannelId: string, defaultLimit: number = DEFAULT_POST_LIMIT): Promise<number> {
    const previousWeek = await this.getPreviousClosedWeek(monitoredChannelId);

    if (!previousWeek) {
      return defaultLimit;
    }

    const penaltyCount = await prisma.spamPenalty.count({
      where: {
        oderId: discordUserId,
        guildId,
        weekId: previousWeek.id,
      },
    });

    return Math.max(1, defaultLimit - penaltyCount);
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
  ): Promise<{ canPost: boolean; currentCount: number; limit: number; penaltiesFromLastWeek: number }> {
    const limit = await this.getPostLimit(discordUserId, guildId, monitoredChannelId, defaultLimit);
    const currentCount = await this.getUserPostCount(discordUserId, monitoredChannelId);

    const previousWeek = await this.getPreviousClosedWeek(monitoredChannelId);
    let penaltiesFromLastWeek = 0;

    if (previousWeek) {
      penaltiesFromLastWeek = await prisma.spamPenalty.count({
        where: {
          oderId: discordUserId,
          guildId,
          weekId: previousWeek.id,
        },
      });
    }

    return {
      canPost: currentCount < limit,
      currentCount,
      limit,
      penaltiesFromLastWeek,
    };
  }

  /**
   * Get penalties for the current active week of a channel (will affect next week).
   */
  async getCurrentWeekPenalties(discordUserId: string, guildId: string, monitoredChannelId: string): Promise<number> {
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

    return prisma.spamPenalty.count({
      where: {
        oderId: discordUserId,
        guildId,
        weekId: activeWeek.id,
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
   * Get the most recent CLOSED week for a specific monitored channel.
   */
  private async getPreviousClosedWeek(monitoredChannelId: string) {
    return prisma.week.findFirst({
      where: {
        status: WeekStatus.CLOSED,
        monitoredChannelId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const spamPenaltyService = new SpamPenaltyService();
