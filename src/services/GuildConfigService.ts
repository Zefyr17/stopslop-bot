import { prisma } from '../db';
import { GuildConfig } from '@prisma/client';

export class GuildConfigService {
  async getOrCreateConfig(guildId: string): Promise<GuildConfig> {
    let config = await prisma.guildConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      console.log(`Creating default config for guild ${guildId}`);
      config = await prisma.guildConfig.create({
        data: {
          guildId,
          monitoredChannelIds: [],
          voterRoleIds: [],
          upvoteThreshold: 5,
          downvoteThreshold: 5,
        },
      });
    }

    return config;
  }

  async getConfig(guildId: string): Promise<GuildConfig | null> {
    return prisma.guildConfig.findUnique({
      where: { guildId },
    });
  }

  async updateConfig(
    guildId: string,
    data: Partial<{
      monitoredChannelIds: string[];
      reviewChannelId: string | null;
      shortlistChannelId: string | null;
      voterRoleIds: string[];
      upvoteThreshold: number;
      downvoteThreshold: number;
    }>
  ): Promise<GuildConfig> {
    return prisma.guildConfig.update({
      where: { guildId },
      data,
    });
  }

  async setMonitoredChannels(guildId: string, channelIds: string[]): Promise<GuildConfig> {
    return this.updateConfig(guildId, { monitoredChannelIds: channelIds });
  }

  async setReviewChannel(guildId: string, channelId: string | null): Promise<GuildConfig> {
    return this.updateConfig(guildId, { reviewChannelId: channelId });
  }

  async setShortlistChannel(guildId: string, channelId: string | null): Promise<GuildConfig> {
    return this.updateConfig(guildId, { shortlistChannelId: channelId });
  }

  async setVoterRoles(guildId: string, roleIds: string[]): Promise<GuildConfig> {
    return this.updateConfig(guildId, { voterRoleIds: roleIds });
  }

  async setThresholds(
    guildId: string,
    upvote: number,
    downvote: number
  ): Promise<GuildConfig> {
    return this.updateConfig(guildId, {
      upvoteThreshold: upvote,
      downvoteThreshold: downvote,
    });
  }
}

export const guildConfigService = new GuildConfigService();
