import { prisma } from '../db';
import { PostStatus } from '@prisma/client';
import { ratingService } from './RatingService';

export interface WeeklyResult {
  rank: number;
  postId: string;
  link: string;
  authorId: string;
  averageRating: number;
  ratingsCount: number;
}

export class ExportService {
  /**
   * Fetches and calculates results for a specific week
   * Returns sorted results (highest rating first)
   */
  async getWeekResults(weekId: string): Promise<WeeklyResult[]> {
    // Get all shortlisted posts for the week
    const posts = await prisma.post.findMany({
      where: {
        weekId,
        status: PostStatus.SHORTLISTED,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate ratings for each post
    const resultsWithRatings = await Promise.all(
      posts.map(async (post) => {
        const stats = await ratingService.getPostRatingStats(post.id);
        return {
          postId: post.id,
          link: post.link,
          authorId: post.authorId,
          averageRating: stats.averageRating,
          ratingsCount: stats.totalRatings,
        };
      })
    );

    // Sort by average rating (DESC), then by ratings count (DESC)
    resultsWithRatings.sort((a, b) => {
      if (b.averageRating !== a.averageRating) {
        return b.averageRating - a.averageRating;
      }
      return b.ratingsCount - a.ratingsCount;
    });

    // Assign ranks
    const rankedResults: WeeklyResult[] = resultsWithRatings.map((result, index) => ({
      rank: index + 1,
      ...result,
    }));

    return rankedResults;
  }

  /**
   * Generates CSV content from weekly results
   */
  generateCSV(results: WeeklyResult[]): string {
    // CSV header
    const header = 'Rank,AvgRating,RatingsCount,Link,AuthorDiscordId,PostId\n';

    // CSV rows
    const rows = results.map((result) => {
      const escapedLink = `"${result.link.replace(/"/g, '""')}"`;
      return `${result.rank},${result.averageRating.toFixed(2)},${result.ratingsCount},${escapedLink},${result.authorId},${result.postId}`;
    }).join('\n');

    return header + rows;
  }

  /**
   * Creates a Buffer from CSV string for attachment
   */
  createCSVBuffer(csvContent: string): Buffer {
    return Buffer.from(csvContent, 'utf-8');
  }
}

export const exportService = new ExportService();
