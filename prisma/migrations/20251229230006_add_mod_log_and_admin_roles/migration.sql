-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN "modLogChannelId" TEXT,
ADD COLUMN "adminRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
