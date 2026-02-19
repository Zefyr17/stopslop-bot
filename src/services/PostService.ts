import { prisma } from '../db';
import { Post, PostStatus } from '@prisma/client';
import { weekService } from './WeekService';
import { createLinkHash, normalizeLink } from '../utils/linkNormalizer';

export class PostService {
  async createPost(data: {
    link: string;
    authorId: string;
    monitoredChannelId?: string;
    originalMessage?: string;
  }): Promise<Post | null> {
    // Get the active week for this specific channel
    const activeWeek = await weekService.getActiveWeek(data.monitoredChannelId);

    // If no active period, reject the post
    if (!activeWeek) {
      console.log(`Rejected post - no active voting period for channel ${data.monitoredChannelId || 'global'}`);
      return null;
    }

    console.log(`Using active week ${activeWeek.id} (monitoredChannelId: ${activeWeek.monitoredChannelId || 'null'}) for channel ${data.monitoredChannelId || 'null'}`);
    const linkHash = createLinkHash(data.link);
    console.log(`[PostCreate] Storing link: ${data.link} | hash: ${linkHash}`);

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
    const normalized = normalizeLink(link);
    const linkHash = createLinkHash(link);

    console.log(`[DuplicateCheck] Incoming link: ${link}`);
    console.log(`[DuplicateCheck] Normalized:    ${normalized}`);
    console.log(`[DuplicateCheck] Hash:          ${linkHash}`);

    const existing = await prisma.post.findUnique({
      where: { linkHash },
    });

    if (existing) {
      console.log(`[DuplicateCheck] MATCH FOUND — existing post ID: ${existing.id}`);
      console.log(`[DuplicateCheck] Existing link:       ${existing.link}`);
      console.log(`[DuplicateCheck] Existing linkHash:   ${existing.linkHash}`);
      console.log(`[DuplicateCheck] Same link? ${existing.link.trim().toLowerCase() === link.trim().toLowerCase()}`);
    } else {
      console.log(`[DuplicateCheck] No duplicate found.`);
    }

    return existing;
  }
}

export const postService = new PostService();
