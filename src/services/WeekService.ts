import { prisma } from '../db';
import { Week } from '@prisma/client';

export class WeekService {
  async getActiveWeek(): Promise<Week> {
    const now = new Date();

    const activeWeek = await prisma.week.findFirst({
      where: {
        startDate: { lte: now },
        endDate: { gte: now },
      },
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
}

export const weekService = new WeekService();
