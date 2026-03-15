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
      modLogChannelId: string | null;
      voterRoleIds: string[];
      judgeRoleIds: string[];
      adminRoleIds: string[];
      unlimitedRoleIds: string[];
      upvoteThreshold: number;
      downvoteThreshold: number;
      raffleRoleId: string | null;
    }>
  ): Promise<GuildConfig> {
    return prisma.guildConfig.update({
      where: { guildId },
      data,
    });
  }

  async setVoterRoles(guildId: string, roleIds: string[]): Promise<GuildConfig> {
    return this.updateConfig(guildId, { voterRoleIds: roleIds });
  }

  async setJudgeRoles(guildId: string, roleIds: string[]): Promise<GuildConfig> {
    return this.updateConfig(guildId, { judgeRoleIds: roleIds });
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

  async setModLogChannel(guildId: string, channelId: string | null): Promise<GuildConfig> {
    return this.updateConfig(guildId, { modLogChannelId: channelId });
  }

  async setRaffleRole(guildId: string, roleId: string): Promise<GuildConfig> {
    return this.updateConfig(guildId, { raffleRoleId: roleId });
  }

  async setAdminRoles(guildId: string, roleIds: string[]): Promise<GuildConfig> {
    return this.updateConfig(guildId, { adminRoleIds: roleIds });
  }

  async isUserAdmin(guildId: string, userRoleIds: string[]): Promise<boolean> {
    const config = await this.getConfig(guildId);
    if (!config) return false;

    if (config.adminRoleIds.length === 0) {
      return false;
    }

    return config.adminRoleIds.some((roleId: string) => userRoleIds.includes(roleId));
  }
}

export const guildConfigService = new GuildConfigService();
