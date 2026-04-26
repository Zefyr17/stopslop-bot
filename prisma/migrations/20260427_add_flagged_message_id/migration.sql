-- Add flaggedMessageId to Post to track sent mod-log embeds
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "flaggedMessageId" TEXT;
