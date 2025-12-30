import { prisma } from '../db';
import { Week, WeekStatus } from '@prisma/client';

export class WeekService {
  /**
   * Gets the current ACTIVE week, creates one if none exists
   */
  async getActiveWeek(): Promise<Week> {
    const activeWeek = await prisma.week.findFirst({
      where: {
        status: WeekStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeWeek) {
      return activeWeek;
    }

    return this.createNewWeek();
  }

  async createNewWeek(): Promise<Week> {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    console.log(`Creating new week: ${startDate.toISOString()} - ${endDate.toISOString()}`);

    return prisma.week.create({
      data: {
        startDate,
        endDate,
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
   * Closes the current ACTIVE week and creates a new one
   * Returns the closed week
   */
  async closeActiveWeek(): Promise<Week> {
    const activeWeek = await this.getActiveWeek();

    const closedWeek = await prisma.week.update({
      where: { id: activeWeek.id },
      data: { status: WeekStatus.CLOSED },
    });

    // Create new active week
    await this.createNewWeek();

    return closedWeek;
  }

  /**
   * Gets the most recent CLOSED week
   */
  async getLastClosedWeek(): Promise<Week | null> {
    return prisma.week.findFirst({
      where: { status: WeekStatus.CLOSED },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const weekService = new WeekService();
