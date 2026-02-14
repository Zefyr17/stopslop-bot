import { prisma } from '../db';
import { PostStatus, VoteType } from '@prisma/client';

export interface TicketHolder {
  oderId: string;
  tickets: number;
  totalVotes: number;
  accuracy: number;
}

export interface RaffleResult {
  raffleId: string;
  winners: Array<{ oderId: string; tickets: number }>;
  totalParticipants: number;
  totalTickets: number;
}

export class RaffleService {
  async getLastRaffle(guildId: string) {
    return prisma.raffle.findFirst({
      where: { guildId },
      orderBy: { drawnAt: 'desc' },
    });
  }

  /**
   * Count correct votes per user since the last raffle.
   * Scoped to this guild's monitored channels.
   */
  async getTicketHolders(guildId: string): Promise<TicketHolder[]> {
    const lastRaffle = await this.getLastRaffle(guildId);
    const cutoffDate = lastRaffle?.drawnAt ?? null;

    // Get monitored channel IDs for this guild
    const channelPairs = await prisma.channelPair.findMany({
      where: { guildConfig: { guildId } },
      select: { monitoredChannelId: true },
    });
    const monitoredChannelIds = channelPairs.map(cp => cp.monitoredChannelId);

    if (monitoredChannelIds.length === 0) return [];

    // Query votes on decided posts in this guild's channels, since cutoff
    const whereClause: any = {
      post: {
        status: { in: [PostStatus.SHORTLISTED, PostStatus.REJECTED] },
        monitoredChannelId: { in: monitoredChannelIds },
      },
    };
    if (cutoffDate) {
      whereClause.createdAt = { gt: cutoffDate };
    }

    const votes = await prisma.vote.findMany({
      where: whereClause,
      include: {
        user: true,
        post: { select: { status: true } },
      },
    });

    // Group by user and count correct votes
    const userMap = new Map<string, { correct: number; total: number }>();
    for (const vote of votes) {
      const oderId = vote.user.discordId;
      if (!userMap.has(oderId)) {
        userMap.set(oderId, { correct: 0, total: 0 });
      }
      const stats = userMap.get(oderId)!;
      stats.total++;

      const isCorrect =
        (vote.type === VoteType.UP && vote.post.status === PostStatus.SHORTLISTED) ||
        (vote.type === VoteType.DOWN && vote.post.status === PostStatus.REJECTED);
      if (isCorrect) stats.correct++;
    }

    return Array.from(userMap.entries())
      .map(([oderId, stats]) => ({
        oderId,
        tickets: stats.correct,
        totalVotes: stats.total,
        accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
      }))
      .filter(h => h.tickets > 0)
      .sort((a, b) => b.tickets - a.tickets || b.accuracy - a.accuracy);
  }

  /**
   * Draw weighted-random winners. More tickets = higher chance.
   * Persists Raffle + RaffleWinner records. Ticket window resets implicitly.
   */
  async drawWinners(guildId: string, drawnBy: string, winnerCount: number = 5): Promise<RaffleResult> {
    const holders = await this.getTicketHolders(guildId);

    if (holders.length === 0) {
      throw new Error('No users have tickets for the raffle.');
    }

    const actualWinnerCount = Math.min(winnerCount, holders.length);
    const winners: Array<{ oderId: string; tickets: number }> = [];
    const pool = [...holders];

    for (let i = 0; i < actualWinnerCount; i++) {
      const totalTickets = pool.reduce((sum, h) => sum + h.tickets, 0);
      let random = Math.floor(Math.random() * totalTickets);

      let winnerIndex = 0;
      for (let j = 0; j < pool.length; j++) {
        random -= pool[j].tickets;
        if (random < 0) {
          winnerIndex = j;
          break;
        }
      }

      const winner = pool.splice(winnerIndex, 1)[0];
      winners.push({ oderId: winner.oderId, tickets: winner.tickets });
    }

    const raffle = await prisma.raffle.create({
      data: {
        guildId,
        drawnBy,
        winners: {
          create: winners.map(w => ({
            oderId: w.oderId,
            tickets: w.tickets,
          })),
        },
      },
      include: { winners: true },
    });

    return {
      raffleId: raffle.id,
      winners,
      totalParticipants: holders.length,
      totalTickets: holders.reduce((sum, h) => sum + h.tickets, 0),
    };
  }

  /**
   * Get total raffle wins per user across all raffles in this guild.
   */
  async getWinCounts(guildId: string): Promise<Array<{ oderId: string; wins: number }>> {
    const winners = await prisma.raffleWinner.findMany({
      where: { raffle: { guildId } },
      select: { oderId: true },
    });

    const countMap = new Map<string, number>();
    for (const w of winners) {
      countMap.set(w.oderId, (countMap.get(w.oderId) ?? 0) + 1);
    }

    return Array.from(countMap.entries())
      .map(([oderId, wins]) => ({ oderId, wins }))
      .sort((a, b) => b.wins - a.wins);
  }
}

export const raffleService = new RaffleService();
