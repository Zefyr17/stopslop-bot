-- Drop old unique constraint and penaltyCount column
ALTER TABLE "SpamPenalty" DROP CONSTRAINT "SpamPenalty_oderId_guildId_weekStartDate_key";
ALTER TABLE "SpamPenalty" DROP COLUMN "penaltyCount";

-- Add postId column
ALTER TABLE "SpamPenalty" ADD COLUMN "postId" TEXT NOT NULL DEFAULT '';

-- Add unique constraint on postId (one penalty per post)
CREATE UNIQUE INDEX "SpamPenalty_postId_key" ON "SpamPenalty"("postId");
