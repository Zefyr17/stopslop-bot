import { prisma } from '../db';

export class SlotGrantService {
  async grantSlot(
    oderId: string,
    guildId: string,
    monitoredChannelId: string,
    weekId: string,
    grantedBy: string,
  ): Promise<void> {
    await prisma.slotGrant.create({
      data: { oderId, guildId, monitoredChannelId, weekId, grantedBy },
    });
  }

  async getGrantCount(oderId: string, guildId: string, monitoredChannelId: string, weekId: string): Promise<number> {
    return prisma.slotGrant.count({
      where: { oderId, guildId, monitoredChannelId, weekId },
    });
  }

  async getBulkGrantCounts(
    userIds: string[],
    guildId: string,
    monitoredChannelId: string,
    weekId: string,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>(userIds.map(id => [id, 0]));
    const rows = await prisma.slotGrant.groupBy({
      by: ['oderId'],
      where: { oderId: { in: userIds }, guildId, monitoredChannelId, weekId },
      _count: { id: true },
    });
    for (const row of rows) result.set(row.oderId, row._count.id);
    return result;
  }
}

export const slotGrantService = new SlotGrantService();
