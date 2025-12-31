import { prisma } from '../db';

export class ChannelPairService {
  /**
   * Add a new channel pair (monitored -> shortlist)
   */
  async addChannelPair(
    guildId: string,
    monitoredChannelId: string,
    shortlistChannelId: string
  ): Promise<void> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      throw new Error('Guild config not found');
    }

    // Check if this monitored channel already exists in a pair
    const existing = await prisma.channelPair.findUnique({
      where: {
        guildConfigId_monitoredChannelId: {
          guildConfigId: config.id,
          monitoredChannelId,
        },
      },
    });

    if (existing) {
      throw new Error('This monitored channel already has a shortlist channel assigned');
    }

    await prisma.channelPair.create({
      data: {
        guildConfigId: config.id,
        monitoredChannelId,
        shortlistChannelId,
      },
    });
  }

  /**
   * Remove a channel pair by monitored channel ID
   */
  async removeChannelPair(guildId: string, monitoredChannelId: string): Promise<void> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      throw new Error('Guild config not found');
    }

    await prisma.channelPair.deleteMany({
      where: {
        guildConfigId: config.id,
        monitoredChannelId,
      },
    });
  }

  /**
   * Get all channel pairs for a guild
   */
  async getChannelPairs(guildId: string) {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
      include: {
        channelPairs: true,
      },
    });

    if (!config) {
      return [];
    }

    return config.channelPairs;
  }

  /**
   * Get shortlist channel ID for a monitored channel
   */
  async getShortlistChannelId(
    guildId: string,
    monitoredChannelId: string
  ): Promise<string | null> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      return null;
    }

    const pair = await prisma.channelPair.findUnique({
      where: {
        guildConfigId_monitoredChannelId: {
          guildConfigId: config.id,
          monitoredChannelId,
        },
      },
    });

    return pair?.shortlistChannelId || null;
  }

  /**
   * Check if a channel is being monitored
   */
  async isMonitoredChannel(guildId: string, channelId: string): Promise<boolean> {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      return false;
    }

    const pair = await prisma.channelPair.findUnique({
      where: {
        guildConfigId_monitoredChannelId: {
          guildConfigId: config.id,
          monitoredChannelId: channelId,
        },
      },
    });

    return !!pair;
  }
}

export const channelPairService = new ChannelPairService();
