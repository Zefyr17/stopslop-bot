-- AlterTable
ALTER TABLE "Week" ADD COLUMN "monitoredChannelId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Week_monitoredChannelId_startDate_key" ON "Week"("monitoredChannelId", "startDate");
