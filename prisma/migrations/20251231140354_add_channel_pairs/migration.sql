-- CreateTable
CREATE TABLE "ChannelPair" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "monitoredChannelId" TEXT NOT NULL,
    "shortlistChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelPair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPair_guildConfigId_monitoredChannelId_key" ON "ChannelPair"("guildConfigId", "monitoredChannelId");

-- AddForeignKey
ALTER TABLE "ChannelPair" ADD CONSTRAINT "ChannelPair_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "GuildConfig" DROP COLUMN "monitoredChannelIds",
DROP COLUMN "reviewChannelId",
DROP COLUMN "shortlistChannelId";
