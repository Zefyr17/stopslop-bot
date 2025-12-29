import { prisma } from '../db';
import { Rating } from '@prisma/client';

export interface PostRatingStats {
  postId: string;
  averageRating: number;
  totalRatings: number;
}

export class RatingService {
  async upsertRating(postId: string, discordUserId: string, score: number): Promise<Rating> {
    const user = await prisma.user.findUnique({
      where: { discordId: discordUserId },
    });

    let dbUser = user;
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: { discordId: discordUserId },
      });
    }

    const existingRating = await prisma.rating.findUnique({
      where: {
        postId_userId: {
          postId,
          userId: dbUser.id,
        },
      },
    });

    if (existingRating) {
      return prisma.rating.update({
        where: {
          postId_userId: {
            postId,
            userId: dbUser.id,
          },
        },
        data: { score },
      });
    }

    return prisma.rating.create({
      data: {
        postId,
        userId: dbUser.id,
        score,
      },
    });
  }

  async getUserRating(postId: string, discordUserId: string): Promise<Rating | null> {
    const user = await prisma.user.findUnique({
      where: { discordId: discordUserId },
    });

    if (!user) return null;

    return prisma.rating.findUnique({
      where: {
        postId_userId: {
          postId,
          userId: user.id,
        },
      },
    });
  }

  async getAverageRating(postId: string): Promise<number> {
    const ratings = await prisma.rating.findMany({
      where: { postId },
    });

    if (ratings.length === 0) return 0;

    const sum = ratings.reduce((acc, r) => acc + r.score, 0);
    return sum / ratings.length;
  }

  async getPostRatingStats(postId: string): Promise<PostRatingStats> {
    const ratings = await prisma.rating.findMany({
      where: { postId },
    });

    const totalRatings = ratings.length;
    const averageRating = totalRatings > 0
      ? ratings.reduce((acc, r) => acc + r.score, 0) / totalRatings
      : 0;

    return {
      postId,
      averageRating,
      totalRatings,
    };
  }
}

export const ratingService = new RatingService();
