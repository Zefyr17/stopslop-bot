-- Add FLAGGED_APPROVE and FLAGGED_REJECT to PostStatus enum
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'FLAGGED_APPROVE';
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'FLAGGED_REJECT';

-- Create PostFeedback table
CREATE TABLE IF NOT EXISTS "PostFeedback" (
    "id"        TEXT NOT NULL,
    "postId"    TEXT NOT NULL,
    "voterId"   TEXT NOT NULL,
    "voteType"  "VoteType" NOT NULL,
    "feedback"  TEXT NOT NULL,
    "weekId"    TEXT NOT NULL,
    "guildId"   TEXT NOT NULL,
    "sent"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PostFeedback_postId_voterId_key" UNIQUE ("postId", "voterId"),
    CONSTRAINT "PostFeedback_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
