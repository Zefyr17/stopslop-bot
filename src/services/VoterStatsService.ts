import { prisma } from '../db';
import { PostStatus, VoteType } from '@prisma/client';
import { weightBoostService } from './WeightBoostService';

export interface VoterStats {
  oderId: string;
  correctVotes: number;
  totalVotes: number;
  accuracy: number;
}

export class VoterStatsService {
  /**
   * Calculate voting accuracy for all users.
   * A vote is "correct" if:
   * - User voted UP (Yes) and post became SHORTLISTED
   * - User voted DOWN (No) and post became REJECTED
   *
   * Posts with PENDING status are not counted (not yet decided).
   */
  async getVoterLeaderboard(): Promise<VoterStats[]> {
    // Get all votes with their post status
    const votes = await prisma.vote.findMany({
      include: {
        user: true,
        post: {
          select: {
            status: true,
          },
        },
      },
    });

    // Only count votes on decided posts (not PENDING)
    const decidedVotes = votes.filter(
      vote => vote.post.status === PostStatus.SHORTLISTED || vote.post.status === PostStatus.REJECTED
    );

    // Group by user and calculate stats
    const userStatsMap = new Map<string, { oderId: string; correct: number; total: number }>();

    for (const vote of decidedVotes) {
      const oderId = vote.user.discordId;

      if (!userStatsMap.has(oderId)) {
        userStatsMap.set(oderId, { oderId, correct: 0, total: 0 });
      }

      const stats = userStatsMap.get(oderId)!;
      stats.total++;

      // Check if vote was correct
      const isCorrect =
        (vote.type === VoteType.UP && vote.post.status === PostStatus.SHORTLISTED) ||
        (vote.type === VoteType.DOWN && vote.post.status === PostStatus.REJECTED);

      if (isCorrect) {
        stats.correct++;
      }
    }

    // Convert to array and calculate accuracy
    const leaderboard: VoterStats[] = Array.from(userStatsMap.values()).map(stats => ({
      oderId: stats.oderId,
      correctVotes: stats.correct,
      totalVotes: stats.total,
      accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
    }));

    // Sort by correct votes descending, then by accuracy as tiebreaker
    leaderboard.sort((a, b) => {
      if (b.correctVotes !== a.correctVotes) {
        return b.correctVotes - a.correctVotes;
      }
      return b.accuracy - a.accuracy;
    });

    return leaderboard;
  }

  /**
   * Get the vote weight for a user based on manual boost grants.
   * Users with a WeightBoost get x2 weight, everyone else gets x1.
   */
  async getVoteWeight(discordUserId: string, guildId: string): Promise<number> {
    const hasBoosted = await weightBoostService.hasBoost(discordUserId, guildId);
    return hasBoosted ? 2 : 1;
  }

  /**
   * Get vote weights for multiple users at once (more efficient for batch operations).
   * Returns a Map of oderId -> weight
   */
  async getVoteWeights(oderIds: string[], guildId: string): Promise<Map<string, number>> {
    const boostedIds = new Set(await weightBoostService.getBoostedUserIds(guildId));
    const weights = new Map<string, number>();

    for (const oderId of oderIds) {
      weights.set(oderId, boostedIds.has(oderId) ? 2 : 1);
    }

    return weights;
  }
}

export const voterStatsService = new VoterStatsService();
