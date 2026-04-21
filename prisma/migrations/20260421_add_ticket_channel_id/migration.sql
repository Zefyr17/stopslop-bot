-- Add ticketChannelId to GuildConfig
ALTER TABLE "GuildConfig" ADD COLUMN IF NOT EXISTS "ticketChannelId" TEXT;
