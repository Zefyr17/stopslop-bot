-- Clear existing penalties (they reference weekStartDate which no longer exists)
DELETE FROM "SpamPenalty";

-- Drop old weekStartDate column
ALTER TABLE "SpamPenalty" DROP COLUMN "weekStartDate";

-- Add weekId column
ALTER TABLE "SpamPenalty" ADD COLUMN "weekId" TEXT NOT NULL;
