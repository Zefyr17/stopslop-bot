-- CreateTable
CREATE TABLE "SpamCooldown" (
    "id" TEXT NOT NULL,
    "oderId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "monitoredChannelId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpamCooldown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpamCooldown_oderId_guildId_monitoredChannelId_key" ON "SpamCooldown"("oderId", "guildId", "monitoredChannelId");
