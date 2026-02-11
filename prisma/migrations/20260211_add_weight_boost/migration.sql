-- CreateTable
CREATE TABLE "WeightBoost" (
    "id" TEXT NOT NULL,
    "oderId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightBoost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeightBoost_oderId_guildId_key" ON "WeightBoost"("oderId", "guildId");
