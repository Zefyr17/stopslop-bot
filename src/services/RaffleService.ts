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
  winners: Array<{ oderId: string; ticketsAwarded: number }>;
  totalParticipants: number;
  ticketsPerWinner: number;
  totalPosts: number;
}

export class RaffleService {
  async getLastRaffle(guildId: string) {
    return prisma.raffle.findFirst({
      where: { guildId },
      orderBy: { drawnAt: 'desc' },
    });
  }

  /**
   * Count correct votes (successful votes) per user since the last raffle.
   * Scoped to this guild's monitored channels.
   */
  async getTicketHolders(guildId: string): Promise<TicketHolder[]> {
    const lastRaffle = await this.getLastRaffle(guildId);
    const cutoffDate = lastRaffle?.drawnAt ?? null;

    const channelPairs = await prisma.channelPair.findMany({
      where: { guildConfig: { guildId } },
      select: { monitoredChannelId: true },
    });
    const monitoredChannelIds = channelPairs.map(cp => cp.monitoredChannelId);

    if (monitoredChannelIds.length === 0) return [];

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
   * Count total posts this week across all monitored channels for this guild.
   * Used to calculate the quality guard ticket pool.
   */
  async getTotalPostsThisWeek(guildId: string): Promise<number> {
    const channelPairs = await prisma.channelPair.findMany({
      where: { guildConfig: { guildId } },
      select: { monitoredChannelId: true },
    });
    const monitoredChannelIds = channelPairs.map(cp => cp.monitoredChannelId);

    if (monitoredChannelIds.length === 0) return 0;

    // Find active weeks for these channels
    const activeWeeks = await prisma.week.findMany({
      where: {
        status: 'ACTIVE',
        monitoredChannelId: { in: monitoredChannelIds },
      },
      select: { id: true },
    });

    if (activeWeeks.length === 0) return 0;

    return prisma.post.count({
      where: {
        weekId: { in: activeWeeks.map(w => w.id) },
        monitoredChannelId: { in: monitoredChannelIds },
      },
    });
  }

  /**
   * Draw up to 5 random winners (unweighted) from users with successful votes.
   * Each winner receives an equal share of the quality guard ticket pool.
   * Pool = totalPosts / winnerCount (rounded, min 1 per winner).
   * Tickets are accumulated in QualityGuardTicket table.
   */
  async drawWinners(guildId: string, drawnBy: string, winnerCount: number = 5): Promise<RaffleResult> {
    const holders = await this.getTicketHolders(guildId);

    if (holders.length === 0) {
      throw new Error('No users have successful votes for the raffle.');
    }

    const totalPosts = await this.getTotalPostsThisWeek(guildId);
    const actualWinnerCount = Math.min(winnerCount, holders.length);
    const ticketsPerWinner = Math.max(1, Math.round(totalPosts / actualWinnerCount));

    // Pick winners randomly (unweighted) — shuffle and take first N
    const pool = [...holders];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selectedWinners = pool.slice(0, actualWinnerCount);

    // Persist raffle draw record
    const raffle = await prisma.raffle.create({
      data: {
        guildId,
        drawnBy,
        winners: {
          create: selectedWinners.map(w => ({
            oderId: w.oderId,
            tickets: ticketsPerWinner,
          })),
        },
      },
      include: { winners: true },
    });

    // Accumulate quality guard tickets for each winner
    for (const winner of selectedWinners) {
      await prisma.qualityGuardTicket.upsert({
        where: { oderId_guildId: { oderId: winner.oderId, guildId } },
        update: { tickets: { increment: ticketsPerWinner } },
        create: { oderId: winner.oderId, guildId, tickets: ticketsPerWinner },
      });
    }

    return {
      raffleId: raffle.id,
      winners: selectedWinners.map(w => ({ oderId: w.oderId, ticketsAwarded: ticketsPerWinner })),
      totalParticipants: holders.length,
      ticketsPerWinner,
      totalPosts,
    };
  }

  /**
   * Get accumulated quality guard tickets per user for /raffle badges.
   */
  async getQualityGuardTickets(guildId: string): Promise<Array<{ oderId: string; tickets: number; wins: number }>> {
    const ticketRows = await prisma.qualityGuardTicket.findMany({
      where: { guildId },
      orderBy: { tickets: 'desc' },
    });

    // Also count raffle wins per user
    const allWinners = await prisma.raffleWinner.findMany({
      where: { raffle: { guildId } },
      select: { oderId: true },
    });
    const winMap = new Map<string, number>();
    for (const w of allWinners) {
      winMap.set(w.oderId, (winMap.get(w.oderId) ?? 0) + 1);
    }

    return ticketRows.map(row => ({
      oderId: row.oderId,
      tickets: row.tickets,
      wins: winMap.get(row.oderId) ?? 0,
    }));
  }
}

export const raffleService = new RaffleService();
