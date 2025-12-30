import { prisma } from '../db';
import { Vote, VoteType } from '@prisma/client';

export interface VoteCounts {
  upvotes: number;
  downvotes: number;
}

export class VoteService {
  async recordVote(postId: string, userId: string, type: VoteType): Promise<Vote> {
    const user = await prisma.user.findUnique({
      where: { discordId: userId },
    });

    let dbUser = user;
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: { discordId: userId },
      });
    }

    return prisma.vote.create({
      data: {
        postId,
        userId: dbUser.id,
        type,
      },
    });
  }

  async getVoteCounts(postId: string): Promise<VoteCounts> {
    const votes = await prisma.vote.findMany({
      where: { postId },
    });

    const upvotes = votes.filter((v) => v.type === VoteType.UP).length;
    const downvotes = votes.filter((v) => v.type === VoteType.DOWN).length;

    return { upvotes, downvotes };
  }

  async hasUserVoted(postId: string, discordUserId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { discordId: discordUserId },
    });

    if (!user) return false;

    const vote = await prisma.vote.findFirst({
      where: {
        postId,
        userId: user.id,
      },
    });

    return !!vote;
  }

  async getUserVote(postId: string, discordUserId: string): Promise<Vote | null> {
    const user = await prisma.user.findUnique({
      where: { discordId: discordUserId },
    });

    if (!user) return null;

    return prisma.vote.findFirst({
      where: {
        postId,
        userId: user.id,
      },
    });
  }

  async deleteAllVotesForPost(postId: string): Promise<number> {
    const result = await prisma.vote.deleteMany({
      where: { postId },
    });
    return result.count;
  }
}

export const voteService = new VoteService();
