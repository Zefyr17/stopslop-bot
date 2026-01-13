# 🤖 Discord Content Voting Bot

A Discord bot for managing community content with a voting system and judge rating capabilities.

## 📋 Table of Contents

- [Description](#description)
- [Features](#features)
- [Installation & Setup](#installation--setup)
- [Bot Commands](#bot-commands)
- [Workflow](#workflow)
- [Architecture](#architecture)

---

## 🎯 Description

This Discord bot is designed to manage the content selection process in communities. It automatically monitors messages with links in specified channels, allows members to vote for the best content, and enables judges to rate selected submissions.

### Main Workflow:

1. **Submission** - users post links in monitored channels
2. **Voting** - community votes yes/no (👍/👎)
3. **Shortlist** - approved content moves to the shortlist channel
4. **Rating** - judges rate posts from 1 to 10 stars
5. **Results** - top 5 posts by average rating

---

## ✨ Features

### 🔍 Content Monitoring
- Automatic link detection in messages
- Duplicate protection (smart link normalization)
- Support for multiple monitored channels
- Channel pairing (monitored → shortlist)

### 🗳️ Voting System
- Binary voting: Yes (👍) / No (👎)
- Configurable approval/rejection thresholds
- Private vote counting
- Vote change cooldown (20 seconds)
- Role-based voting restrictions

### ⭐ Rating System
- 1-10 star rating for shortlisted posts
- Judge-only access (configurable roles)
- Cannot rate own posts
- Rating updates allowed
- Average rating calculation with author bias normalization

### 📊 Weekly Periods
- Week-based voting management
- Independent periods per channel
- Open/close voting periods
- Judge rating sessions

### 🛡️ Moderation
- Manual post approval/rejection by admins
- Vote reset capability
- Detailed logging to mod log channel
- 11 event types with colored embeds

### 📈 Data Export
- Export rating logs to CSV
- Filter by channels and periods
- Includes: author, link, judge, rating, timestamp

### 🔐 Access Control
- **Voter Roles** - who can vote
- **Judge Roles** - who can rate
- **Admin Roles** - manual post management
- Server administrators have full access

---

## 🚀 Installation & Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Discord bot token

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Create a `.env` file in the project root:

```env
DISCORD_TOKEN=your_discord_bot_token_here
DATABASE_URL=postgresql://user:password@host:port/database
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Apply migrations
npm run db:migrate

# Or for production
npm run db:deploy
```

### 4. Run the Bot

**Development mode:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

### 5. Discord Server Configuration

After adding the bot to your server, use configuration commands:

```
/channel-pair add <monitored-channel> <shortlist-channel>
/config set-mod-log <log-channel>
/set-voter-roles <role1> [role2] [role3]
/set-judge-roles <role1> [role2] [role3]
/set-thresholds <upvotes> <downvotes>
```

---

## 📜 Bot Commands

### 🔧 Utility Commands

#### `/ping`
Check bot responsiveness.
```
/ping
```

#### `/help`
Shows comprehensive bot usage guide, current configuration, and list of all commands.
```
/help
```

---

### ⚙️ Configuration Commands (require Administrator permission)

#### `/config show`
Displays current server settings:
- Channel pairs
- Mod log channel
- Voter/judge/admin roles
- Voting thresholds

```
/config show
```

#### `/config set-mod-log`
Sets the channel for moderation logs.
```
/config set-mod-log channel:#mod-logs
```

#### `/config set-admin-roles`
Assigns admin roles (up to 3 roles).
```
/config set-admin-roles role1:@Admin role2:@Moderator
```

---

### 📢 Channel Management (Administrator)

#### `/channel-pair add`
Creates a monitored → shortlist channel pair.
```
/channel-pair add monitored:#submissions shortlist:#approved
```

#### `/channel-pair remove`
Removes a channel pair.
```
/channel-pair remove monitored:#submissions
```

#### `/channel-pair list`
Shows all configured channel pairs.
```
/channel-pair list
```

---

### 👥 Role Configuration (Administrator)

#### `/set-voter-roles`
Specifies which roles can vote (empty = everyone).
```
/set-voter-roles role1:@Member role2:@Contributor
```

#### `/set-judge-roles`
Specifies which roles can rate (empty = everyone).
```
/set-judge-roles role1:@Judge role2:@Expert
```

#### `/set-thresholds`
Sets voting thresholds.
```
/set-thresholds upvotes:5 downvotes:5
```
- **upvotes** - votes needed to approve
- **downvotes** - votes needed to reject

---

### 📅 Voting Period Management (Administrator)

#### `/week start`
Starts a new voting period.
```
/week start [monitored:#channel]
```
- Without parameter: starts for all channels
- With channel: starts only for specified channel

#### `/week close`
Closes the current voting period.
```
/week close [monitored:#channel]
```
- Without parameter: closes for all channels
- With channel: closes only for specified channel

---

### 🏆 Ranking Management (Administrator)

#### `/ranking start`
Opens rating session for judges.
```
/ranking start [monitored:#channel]
```
- Allows judges to rate shortlisted posts (1-10 stars)

---

### 📊 Results & Export

#### `/results`
Shows top 5 posts of the current week (judges only).
```
/results [monitored:#channel]
```
- Displays:
  - 🥇🥈🥉 Medals for top 3
  - Average rating
  - Vote counts
  - Normalized score (accounting for author bias)

#### `/export logs`
Exports rating logs to CSV (admins only).
```
/export logs [monitored:#channel]
```
- Contains: author, link, judge, rating, timestamp
- Filename: `rating_logs_YYYY-MM-DD[_CHANNELID].csv`

---

### 🛠️ Post Moderation (Admins/Judges)

#### `/post approve`
Manually approve a post (bypass voting).
```
/post approve postid:abc123
```
- Changes status: PENDING → SHORTLISTED
- Disables voting buttons
- Posts to shortlist channel with rating buttons

#### `/post reject`
Manually reject a post.
```
/post reject postid:abc123
```
- Changes status: PENDING/SHORTLISTED → REJECTED
- Disables buttons

#### `/post reset_votes`
Clears all votes on a post.
```
/post reset_votes postid:abc123
```
- Changes status: REJECTED/SHORTLISTED → PENDING
- Re-enables voting buttons

---

### 🗑️ Database Management (Administrator)

#### `/reset-database`
⚠️ **DANGER**: Completely wipes the database.
```
/reset-database
```
- Deletes ALL data: ratings, votes, posts, weeks, channel pairs, configurations
- Requires manual reconfiguration afterward

---

### 💬 Legacy Text Commands

#### `!ping`
Legacy ping command.

#### `!config`
Legacy configuration display.

#### `!results`
Legacy results display (requires judge role).

---

## 🔄 Workflow

### Post Lifecycle

```
┌─────────────────────────────────────────────────────┐
│  1. User posts a link                               │
│     in monitored channel                            │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  2. Bot checks for duplicates                       │
│     (link normalization, hashing)                   │
└────────────┬────────────────────────┬────────────────┘
             │                        │
     Duplicate│                        │ New link
             ▼                        ▼
┌─────────────────────┐   ┌──────────────────────────┐
│  Delete message     │   │  Create post             │
│  + DM notification  │   │  Status: PENDING         │
│  + Log to mod log   │   │  + Voting buttons        │
└─────────────────────┘   └────────────┬─────────────┘
                                       │
                                       ▼
                     ┌─────────────────────────────────┐
                     │  3. Community voting            │
                     │     👍 Yes / 👎 No              │
                     └──┬──────────────────────────┬───┘
                        │                          │
   Rejection threshold  │                          │  Approval threshold
   reached              │                          │  reached
                        ▼                          ▼
          ┌──────────────────────┐    ┌───────────────────────┐
          │  Status: REJECTED    │    │  Status: SHORTLISTED  │
          │  Buttons disabled    │    │  Post to shortlist    │
          └──────────────────────┘    │  + Rating buttons 1-10│
                                      └───────────┬───────────┘
                                                  │
                                                  ▼
                                      ┌───────────────────────┐
                                      │  4. Judge rating      │
                                      │     ⭐ 1-10 stars     │
                                      └───────────┬───────────┘
                                                  │
                                                  ▼
                                      ┌───────────────────────┐
                                      │  5. Results           │
                                      │     Top 5 by rating   │
                                      │     🥇🥈🥉            │
                                      └───────────────────────┘
```

### Post Statuses

- **PENDING** - awaiting votes
- **SHORTLISTED** - approved by community, awaiting rating
- **REJECTED** - rejected by community

### Duplicate Protection

The bot normalizes links before saving, removing tracking parameters:
- UTM tags: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- Tracking codes: `fbclid`, `gclid`, `ref`, `source`, `_ga`, `mc_cid`, `mc_eid`

A hash is then created from the normalized link. When attempting to add a duplicate:
1. Bot deletes the message
2. Sends DM notification to user
3. Logs event to mod channel

---

## 🏗️ Architecture

### Tech Stack

- **Language**: TypeScript 5.3.3
- **Framework**: discord.js 14.14.1
- **Database**: PostgreSQL
- **ORM**: Prisma 7.2.0
- **Runtime**: Node.js 18+

### Project Structure

```
discordbot/
├── src/
│   ├── bot.ts              # Main file with event handlers (1,637 lines)
│   ├── index.ts            # Entry point
│   ├── commands.ts         # Slash command definitions
│   ├── db.ts               # Prisma client
│   ├── services/           # Business logic
│   │   ├── PostService.ts
│   │   ├── VoteService.ts
│   │   ├── RatingService.ts
│   │   ├── WeekService.ts
│   │   ├── GuildConfigService.ts
│   │   ├── ChannelPairService.ts
│   │   ├── ModLogService.ts
│   │   └── ExportService.ts
│   └── utils/              # Utilities
│       ├── linkNormalizer.ts
│       └── linkDetector.ts
├── prisma/
│   └── schema.prisma       # Database schema
├── package.json
├── tsconfig.json
└── .env                    # Environment variables (not in repo)
```

### Database Models

#### User
```prisma
model User {
  id        String   @id @default(cuid())
  discordId String   @unique
  votes     Vote[]
  ratings   Rating[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

#### Week
```prisma
model Week {
  id                   String     @id @default(cuid())
  monitoredChannelId   String?
  startDate            DateTime
  endDate              DateTime
  status               WeekStatus @default(ACTIVE)
  rankingOpen          Boolean    @default(false)
  posts                Post[]
  createdAt            DateTime   @default(now())
  updatedAt            DateTime   @updatedAt

  @@unique([monitoredChannelId, startDate])
}
```

#### Post
```prisma
model Post {
  id                  String     @id @default(cuid())
  link                String
  linkHash            String     @unique  // Duplicate protection
  status              PostStatus @default(PENDING)
  weekId              String
  authorId            String
  monitoredChannelId  String?
  originalMessage     String?
  reviewMessageId     String?
  week                Week       @relation(fields: [weekId], references: [id])
  votes               Vote[]
  ratings             Rating[]
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt
}
```

#### Vote
```prisma
model Vote {
  id        String   @id @default(cuid())
  postId    String
  userId    String
  type      VoteType
  post      Post     @relation(fields: [postId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([postId, userId])  // One vote per user
}
```

#### Rating
```prisma
model Rating {
  id        String   @id @default(cuid())
  postId    String
  userId    String
  score     Int      // 1-10
  post      Post     @relation(fields: [postId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([postId, userId])  // One rating per user
}
```

#### GuildConfig
```prisma
model GuildConfig {
  id                  String        @id @default(cuid())
  guildId             String        @unique
  channelPairs        ChannelPair[]
  modLogChannelId     String?
  voterRoleIds        String[]      @default([])
  judgeRoleIds        String[]      @default([])
  adminRoleIds        String[]      @default([])
  upvoteThreshold     Int           @default(5)
  downvoteThreshold   Int           @default(5)
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
}
```

#### ChannelPair
```prisma
model ChannelPair {
  id                  String      @id @default(cuid())
  guildConfigId       String
  monitoredChannelId  String
  shortlistChannelId  String
  guildConfig         GuildConfig @relation(fields: [guildConfigId], references: [id], onDelete: Cascade)
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  @@unique([guildConfigId, monitoredChannelId])
}
```

### Service Architecture

The bot uses **Service Layer** architecture to separate business logic:

- **PostService** - post management
- **VoteService** - vote processing
- **RatingService** - rating management
- **WeekService** - period management
- **GuildConfigService** - server configuration
- **ChannelPairService** - channel pairs
- **ModLogService** - event logging
- **ExportService** - data export

### Discord Events

The bot responds to the following events:

1. **ClientReady** - initialization on startup
2. **GuildCreate** - added to new server
3. **MessageCreate** - processing messages with links
4. **InteractionCreate** - handling commands and buttons

### Moderation Log Event Types

| Event | Color | Description |
|-------|-------|-------------|
| POST_REJECTED_AUTO | 🔴 Red | Automatic rejection |
| POST_SHORTLISTED_AUTO | 🟢 Green | Automatic approval |
| ADMIN_OVERRIDE_APPROVE | 🟡 Yellow | Manual approval by admin |
| ADMIN_OVERRIDE_REJECT | 🟡 Yellow | Manual rejection by admin |
| ADMIN_OVERRIDE_RESET | 🟡 Yellow | Vote reset by admin |
| DUPLICATE_LINK_DELETED | 🟠 Orange | Duplicate deleted |
| WEEK_STARTED | 🔵 Blue | New period started |
| WEEK_CLOSED | 🔵 Blue | Period closed |
| EXPORT_RESULTS | 🟣 Purple | Data export |
| BOT_ERROR | 🔴 Red | Bot error |
| RATING_CHANGED | 🟢 Green | Rating changed |

---

## 📊 Project Statistics

- **Total lines of code**: 1,637+ lines
- **Slash commands**: 20
- **Database models**: 7
- **Event types**: 11
- **Services**: 8
- **Role types**: 3 (Voter, Judge, Administrator)
- **Post statuses**: 3 (PENDING, SHORTLISTED, REJECTED)
- **Rating scale**: 1-10 stars

---

## 🔒 Security

- Private vote counting (not shown publicly)
- Vote spam protection (20-second cooldown)
- Race-condition protection for duplicates (unique constraint on linkHash)
- Role-based access control
- Logging of all administrative actions
- SQL injection protection (via Prisma ORM)

---

## 🤝 Contributing

This bot is designed for managing content in Discord communities with a transparent voting and rating system.

---

## 📝 License

ISC

---

## 🆘 Support

If you encounter issues, check:
1. Discord token and DATABASE_URL correctness in `.env`
2. Database migrations applied (`npm run db:migrate`)
3. Bot has necessary permissions on Discord server
4. Channel pairs configured via `/channel-pair add`

For additional help, refer to console logs or mod logs on the server.
