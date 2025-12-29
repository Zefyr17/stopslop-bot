import { prisma } from '../db';
import { Post, PostStatus } from '@prisma/client';
import { weekService } from './WeekService';

export class PostService {
  async createPost(data: {
    link: string;
    authorId: string;
    originalMessage?: string;
  }): Promise<Post> {
    const activeWeek = await weekService.getActiveWeek();

    return prisma.post.create({
      data: {
        link: data.link,
        authorId: data.authorId,
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
}

export const postService = new PostService();
