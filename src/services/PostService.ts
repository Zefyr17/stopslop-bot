import { prisma } from '../db';
import { Post, PostStatus } from '@prisma/client';
import { weekService } from './WeekService';
import { createLinkHash } from '../utils/linkNormalizer';

export class PostService {
  async createPost(data: {
    link: string;
    authorId: string;
    monitoredChannelId?: string;
    originalMessage?: string;
  }): Promise<Post> {
    // Get the active week for this specific channel
    const activeWeek = await weekService.getActiveWeek(data.monitoredChannelId);
    console.log(`Using active week ${activeWeek.id} (monitoredChannelId: ${activeWeek.monitoredChannelId || 'null'}) for channel ${data.monitoredChannelId || 'null'}`);
    const linkHash = createLinkHash(data.link);

    return prisma.post.create({
      data: {
        link: data.link,
        linkHash,
        authorId: data.authorId,
        monitoredChannelId: data.monitoredChannelId,
        originalMessage: data.originalMessage,
        weekId: activeWeek.id,
        status: PostStatus.PENDING,
      },
    });
  }

  async updateReviewMessageId(postId: string, reviewMessageId: string): Promise<Post> {
    return prisma.post.update({
      where: { id: postId },
      data: { reviewMessageId },
    });
  }

  async updateStatus(postId: string, status: PostStatus): Promise<Post> {
    return prisma.post.update({
      where: { id: postId },
      data: { status },
    });
  }

  async getPostById(postId: string): Promise<Post | null> {
    return prisma.post.findUnique({
      where: { id: postId },
      include: {
        week: true,
        votes: true,
        ratings: true,
      },
    });
  }

  async getPostByReviewMessageId(reviewMessageId: string): Promise<Post | null> {
    return prisma.post.findFirst({
      where: { reviewMessageId },
      include: {
        votes: true,
      },
    });
  }

  async getPostsByWeek(weekId: string): Promise<Post[]> {
    return prisma.post.findMany({
      where: { weekId },
      include: {
        votes: true,
        ratings: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPostsByStatus(status: PostStatus): Promise<Post[]> {
    return prisma.post.findMany({
      where: { status },
      include: {
        votes: true,
        ratings: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find duplicate post using atomic linkHash lookup
   * This is race-condition safe thanks to unique constraint
   */
  async findDuplicatePost(link: string): Promise<Post | null> {
    const linkHash = createLinkHash(link);

    return prisma.post.findUnique({
      where: { linkHash },
    });
  }
}

export const postService = new PostService();
