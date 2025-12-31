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

    // Check if a week with this startDate already exists (might be CLOSED)
    const existingWeek = await prisma.week.findFirst({
      where: {
        monitoredChannelId: monitoredChannelId || null,
        startDate: startDate,
      },
    });

    if (existingWeek) {
      // If week exists but is CLOSED, we need to update its startDate to avoid conflicts
      if (existingWeek.status === WeekStatus.CLOSED) {
        console.log(`Found existing closed week${channelInfo}, updating to new startDate`);

        // Update the old week's startDate to 1 second earlier to avoid unique constraint
        await prisma.week.update({
          where: { id: existingWeek.id },
          data: {
            startDate: new Date(startDate.getTime() - 1000) // 1 second earlier
          },
        });

        // Now create a fresh new week
        console.log(`Creating new week${channelInfo}: ${startDate.toISOString()} - ${endDate.toISOString()}`);
        return prisma.week.create({
          data: {
            startDate,
            endDate,
            monitoredChannelId: monitoredChannelId || null,
          },
        });
      }
      // If it's already ACTIVE, just return it
      console.log(`Returning existing active week${channelInfo}: ${existingWeek.id}`);
      return existingWeek;
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

    const closedWeek = await prisma.week.update({
      where: { id: activeWeek.id },
      data: { status: WeekStatus.CLOSED },
    });

    // Create new active week for the same channel
    await this.createNewWeek(monitoredChannelId);

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
