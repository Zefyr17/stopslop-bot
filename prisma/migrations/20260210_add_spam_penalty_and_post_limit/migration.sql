-- AlterTable
ALTER TABLE "GuildConfig" ADD COLUMN "defaultPostLimit" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "SpamPenalty" (
    "id" TEXT NOT NULL,
    "oderId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "penaltyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpamPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpamPenalty_oderId_guildId_weekStartDate_key" ON "SpamPenalty"("oderId", "guildId", "weekStartDate");
