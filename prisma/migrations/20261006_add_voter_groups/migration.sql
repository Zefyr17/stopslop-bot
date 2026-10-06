-- Add voter groups and announcement channel to GuildConfig
ALTER TABLE "GuildConfig" ADD COLUMN IF NOT EXISTS "announcementChannelId" TEXT;
ALTER TABLE "GuildConfig" ADD COLUMN IF NOT EXISTS "voterGroupA" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "GuildConfig" ADD COLUMN IF NOT EXISTS "voterGroupB" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Add active voter group tracking to Week
ALTER TABLE "Week" ADD COLUMN IF NOT EXISTS "activeVoterGroup" TEXT;
