# Discord Content Voting Bot

A Discord bot for managing content submissions with voting and rating systems.

## Features

- 📝 Monitor channels for content submissions
- 👍👎 Community voting system
- ⭐ Judge rating system (1-10)
- 🏆 Weekly rankings
- 🗃️ PostgreSQL database with Prisma ORM

## Setup

### Environment Variables

- `DISCORD_TOKEN` - Your Discord bot token
- `DATABASE_URL` - PostgreSQL connection string

### Local Development

```bash
npm install
npm run db:migrate
npm run dev
```

### Production Deployment

See deployment instructions for your platform.

## Commands

- `!ping` - Test bot responsiveness
- `!config` - View current guild configuration
- `!results` - View weekly rankings (judges only)

## Configuration

Configure via database `GuildConfig` table:
- `monitoredChannelIds` - Channels to monitor for content
- `reviewChannelId` - Channel for voting
- `shortlistChannelId` - Channel for approved content
- `voterRoleIds` - Roles allowed to vote
- `judgeRoleIds` - Roles allowed to rate
- `upvoteThreshold` - Votes needed to approve (default: 5)
- `downvoteThreshold` - Votes needed to reject (default: 5)
