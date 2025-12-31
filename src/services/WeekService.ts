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

    // Close the week
    const closedWeek = await prisma.week.update({
      where: { id: activeWeek.id },
      data: { status: WeekStatus.CLOSED },
    });

    console.log(`Closed week${channelInfo}: ${activeWeek.id}`);

    // Create new active week starting from the endDate of the closed week
    const newStartDate = new Date(activeWeek.endDate);
    newStartDate.setHours(0, 0, 0, 0);

    const newEndDate = new Date(newStartDate);
    newEndDate.setDate(newEndDate.getDate() + 7);

    const newWeek = await prisma.week.create({
      data: {
        startDate: newStartDate,
        endDate: newEndDate,
        monitoredChannelId: monitoredChannelId || null,
      },
    });

    console.log(`Created new week${channelInfo}: ${newWeek.id} (${newStartDate.toISOString()} - ${newEndDate.toISOString()})`);

    return closedWeek;
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
