-- CreateTable
CREATE TABLE "SlotGrant" (
    "id" TEXT NOT NULL,
    "oderId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "monitoredChannelId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotGrant_pkey" PRIMARY KEY ("id")
);
