import { prisma } from '../db';

const DEFAULT_COOLDOWN_DAYS = 7;

export class SpamCooldownService {
  async setCooldown(
    oderId: string,
    guildId: string,
    monitoredChannelId: string,
    grantedBy: string,
    days: number = DEFAULT_COOLDOWN_DAYS,
  ): Promise<{ expiresAt: Date }> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await prisma.spamCooldown.upsert({
      where: { oderId_guildId_monitoredChannelId: { oderId, guildId, monitoredChannelId } },
      create: { oderId, guildId, monitoredChannelId, expiresAt, grantedBy },
      update: { expiresAt, grantedBy },
    });

    return { expiresAt };
  }

  async liftCooldown(oderId: string, guildId: string, monitoredChannelId: string): Promise<boolean> {
    const existing = await prisma.spamCooldown.findUnique({
      where: { oderId_guildId_monitoredChannelId: { oderId, guildId, monitoredChannelId } },
    });
    if (!existing) return false;

    await prisma.spamCooldown.delete({
      where: { oderId_guildId_monitoredChannelId: { oderId, guildId, monitoredChannelId } },
    });
    return true;
  }

  async getActiveCooldown(
    oderId: string,
    guildId: string,
    monitoredChannelId: string,
  ): Promise<{ expiresAt: Date } | null> {
    const record = await prisma.spamCooldown.findUnique({
      where: { oderId_guildId_monitoredChannelId: { oderId, guildId, monitoredChannelId } },
    });
    if (!record) return null;
    if (record.expiresAt <= new Date()) {
      // Auto-clean expired cooldown
      await prisma.spamCooldown.delete({
        where: { oderId_guildId_monitoredChannelId: { oderId, guildId, monitoredChannelId } },
      });
      return null;
    }
    return { expiresAt: record.expiresAt };
  }

  async getAllCooldownsForUser(
    oderId: string,
    guildId: string,
  ): Promise<{ monitoredChannelId: string; expiresAt: Date }[]> {
    const now = new Date();
    const records = await prisma.spamCooldown.findMany({
      where: { oderId, guildId, expiresAt: { gt: now } },
    });
    return records.map(r => ({ monitoredChannelId: r.monitoredChannelId, expiresAt: r.expiresAt }));
  }
}

export const spamCooldownService = new SpamCooldownService();
