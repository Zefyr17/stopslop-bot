import { prisma } from '../db';
import { Week, WeekStatus } from '@prisma/client';

export class WeekService {
  /**
   * Gets the current ACTIVE week for a specific channel
   * Returns null if no active period exists (bot should reject posts)
   */
  async getActiveWeek(monitoredChannelId?: string): Promise<Week | null> {
    const activeWeek = await prisma.week.findFirst({
      where: {
        status: WeekStatus.ACTIVE,
        monitoredChannelId: monitoredChannelId || null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return activeWeek;
  }

  /**
   * Gets the current ACTIVE week for a specific channel
   * Throws error if no active period exists
   */
  async getActiveWeekOrThrow(monitoredChannelId?: string): Promise<Week> {
    const activeWeek = await this.getActiveWeek(monitoredChannelId);

    if (!activeWeek) {
      const channelInfo = monitoredChannelId ? ` for this channel` : '';
      throw new Error(`No active voting period${channelInfo}. Use /week start to begin accepting posts.`);
    }

    return activeWeek;
  }

  async createNewWeek(monitoredChannelId?: string): Promise<Week> {
    const channelInfo = monitoredChannelId ? ` for channel ${monitoredChannelId}` : '';

    // Check if an ACTIVE week already exists for this channel
    const existingActiveWeek = await prisma.week.findFirst({
      where: {
        monitoredChannelId: monitoredChannelId || null,
        status: WeekStatus.ACTIVE,
      },
    });

    if (existingActiveWeek) {
      console.log(`Returning existing active period${channelInfo}: ${existingActiveWeek.id}`);
      return existingActiveWeek;
    }

    // Create new voting period (not tied to calendar dates)
    // Just use current timestamp to ensure uniqueness
    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days for reference only

    console.log(`Creating new voting period${channelInfo}: ${startDate.toISOString()}`);

    return prisma.week.create({
      data: {
        startDate,
        endDate,
        monitoredChannelId: monitoredChannelId || null,
      },
    });
  }

  async getWeekById(weekId: string): Promise<Week | null> {
    return prisma.week.findUnique({
      where: { id: weekId },
    });
  }

  async getAllWeeks(): Promise<Week[]> {
    return prisma.week.findMany({
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * Closes the current ACTIVE voting period for a specific channel
   * Does NOT create a new period - use startNewWeek() for that
   * Returns the closed period
   */
  async closeActiveWeek(monitoredChannelId?: string): Promise<Week> {
    const activeWeek = await this.getActiveWeekOrThrow(monitoredChannelId);

    const channelInfo = monitoredChannelId ? ` for channel ${monitoredChannelId}` : '';

    // Close the current voting period
    const closedWeek = await prisma.week.update({
      where: { id: activeWeek.id },
      data: {
        status: WeekStatus.CLOSED,
        endDate: new Date() // Set actual end date to now
      },
    });

    console.log(`Closed voting period${channelInfo}: ${activeWeek.id} - bot will no longer accept posts`);

    return closedWeek;
  }

  /**
   * Starts a new voting period for a specific channel
   * Returns the new period
   */
  async startNewWeek(monitoredChannelId?: string): Promise<Week> {
    const channelInfo = monitoredChannelId ? ` for channel ${monitoredChannelId}` : '';

    // Check if there's already an active period
    const existingActiveWeek = await prisma.week.findFirst({
      where: {
        monitoredChannelId: monitoredChannelId || null,
        status: WeekStatus.ACTIVE,
      },
    });

    if (existingActiveWeek) {
      throw new Error(`There is already an active voting period${channelInfo}. Close it first with /week close.`);
    }

    // Create new voting period
    return this.createNewWeek(monitoredChannelId);
  }

  /**
   * Gets the most recent CLOSED week for a specific channel
   */
  async getLastClosedWeek(monitoredChannelId?: string): Promise<Week | null> {
    return prisma.week.findFirst({
      where: {
        status: WeekStatus.CLOSED,
        monitoredChannelId: monitoredChannelId || null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const weekService = new WeekService();
