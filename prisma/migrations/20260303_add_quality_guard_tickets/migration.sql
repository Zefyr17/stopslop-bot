-- CreateTable
CREATE TABLE "QualityGuardTicket" (
    "id" TEXT NOT NULL,
    "oderId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "tickets" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityGuardTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityGuardTicket_oderId_guildId_key" ON "QualityGuardTicket"("oderId", "guildId");
