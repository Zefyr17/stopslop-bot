import { prisma } from '../db';

export class WeightBoostService {
  async grantBoost(discordUserId: string, guildId: string, grantedBy: string): Promise<boolean> {
    const existing = await prisma.weightBoost.findUnique({
      where: {
        oderId_guildId: {
          oderId: discordUserId,
          guildId,
        },
      },
    });

    if (existing) {
      return false; // Already has boost
    }

    await prisma.weightBoost.create({
      data: {
        oderId: discordUserId,
        guildId,
        grantedBy,
      },
    });

    return true;
  }

  async revokeBoost(discordUserId: string, guildId: string): Promise<boolean> {
    const existing = await prisma.weightBoost.findUnique({
      where: {
        oderId_guildId: {
          oderId: discordUserId,
          guildId,
        },
      },
    });

    if (!existing) {
      return false; // No boost to revoke
    }

    await prisma.weightBoost.delete({
      where: {
        oderId_guildId: {
          oderId: discordUserId,
          guildId,
        },
      },
    });

    return true;
  }

  async hasBoost(discordUserId: string, guildId: string): Promise<boolean> {
    const boost = await prisma.weightBoost.findUnique({
      where: {
        oderId_guildId: {
          oderId: discordUserId,
          guildId,
        },
      },
    });

    return !!boost;
  }

  async getBoostedUserIds(guildId: string): Promise<string[]> {
    const boosts = await prisma.weightBoost.findMany({
      where: { guildId },
    });

    return boosts.map(b => b.oderId);
  }

  async getAllBoosts(guildId: string): Promise<Array<{ oderId: string; grantedBy: string; createdAt: Date }>> {
    const boosts = await prisma.weightBoost.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' },
    });

    return boosts.map(b => ({
      oderId: b.oderId,
      grantedBy: b.grantedBy,
      createdAt: b.createdAt,
    }));
  }
}

export const weightBoostService = new WeightBoostService();
