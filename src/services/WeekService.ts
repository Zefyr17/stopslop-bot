import { prisma } from '../db';
import { Week, WeekStatus } from '@prisma/client';

export class WeekService {
  /**
   * Gets the current ACTIVE week for a specific channel, creates one if none exists
   */
  async getActiveWeek(monitoredChannelId?: string): Promise<Week> {
    const activeWeek = await prisma.week.findFirst({
      where: {
        status: WeekStatus.ACTIVE,
        monitoredChannelId: monitoredChannelId || null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeWeek) {
      return activeWeek;
    }

    return this.createNewWeek(monitoredChannelId);
  }

  async createNewWeek(monitoredChannelId?: string): Promise<Week> {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    const channelInfo = monitoredChannelId ? ` for channel ${monitoredChannelId}` : '';

    // Check if an ACTIVE week already exists for this channel
    const existingActiveWeek = await prisma.week.findFirst({
      where: {
        monitoredChannelId: monitoredChannelId || null,
        status: WeekStatus.ACTIVE,
      },
    });

    if (existingActiveWeek) {
      console.log(`Returning existing active week${channelInfo}: ${existingActiveWeek.id}`);
      return existingActiveWeek;
    }

    // Create new week if none exists
    console.log(`Creating new week${channelInfo}: ${startDate.toISOString()} - ${endDate.toISOString()}`);

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
   * Closes the current ACTIVE week for a specific channel and creates a new one
   * Returns the closed week
   */
  async closeActiveWeek(monitoredChannelId?: string): Promise<Week> {
    const activeWeek = await this.getActiveWeek(monitoredChannelId);

    const channelInfo = monitoredChannelId ? ` for channel ${monitoredChannelId}` : '';

    // First, update the startDate to avoid unique constraint when creating new week
    // Move it 1 second earlier
    const updatedWeek = await prisma.week.update({
      where: { id: activeWeek.id },
      data: {
        startDate: new Date(activeWeek.startDate.getTime() - 1000),
        status: WeekStatus.CLOSED
      },
    });

    console.log(`Closed week${channelInfo}: ${activeWeek.id}`);

    // Create new active week for the same channel
    await this.createNewWeek(monitoredChannelId);

    return updatedWeek;
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
