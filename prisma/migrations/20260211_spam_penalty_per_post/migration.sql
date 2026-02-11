-- Clear old penalty records (they have no postId and can't be migrated)
DELETE FROM "SpamPenalty";

-- Drop old unique index and penaltyCount column
DROP INDEX "SpamPenalty_oderId_guildId_weekStartDate_key";
ALTER TABLE "SpamPenalty" DROP COLUMN "penaltyCount";

-- Add postId column
ALTER TABLE "SpamPenalty" ADD COLUMN "postId" TEXT NOT NULL;

-- Add unique constraint on postId (one penalty per post)
CREATE UNIQUE INDEX "SpamPenalty_postId_key" ON "SpamPenalty"("postId");
