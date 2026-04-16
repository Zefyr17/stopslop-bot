# Discord Voting Bot — Project Reference

## Stack
- **Language:** TypeScript (Node.js, target ES2020)
- **Framework:** Discord.js v14
- **Database:** PostgreSQL + Prisma ORM
- **Build output:** `dist/`
- **Entry point:** `src/index.ts` → `src/bot.ts`

## Directory Structure

```
src/
  index.ts           # Entry: loads .env, registers commands, boots bot
  bot.ts             # 3000+ lines — all event handlers, command routing
  commands.ts        # Slash command definitions (400+ lines)
  db.ts              # Prisma client init
  services/
    VoteService.ts          # Vote recording & weighted counts
    PostService.ts          # Post creation & retrieval
    RatingService.ts        # Judge ratings 1–10 (upsert)
    SpamPenaltyService.ts   # Spam penalties & post-limit calc
    WeekService.ts          # Voting period management
    RaffleService.ts        # Raffle draws & QualityGuard tickets
    GuildConfigService.ts   # Guild settings CRUD
    ChannelPairService.ts   # monitoredChannel↔shortlistChannel pairs
    WeightBoostService.ts   # x2 vote weight grants
    ModLogService.ts        # 22-type moderation event logging
    VoterStatsService.ts    # Vote weight map for a list of userIds
    ExportService.ts        # CSV export logic
  utils/
    linkNormalizer.ts  # Strip UTM params, hash, areLinksSame()
    linkDetector.ts    # extractFirstLink(), hasLink()
prisma/
  schema.prisma        # DB schema
  migrations/          # Migration history
```

---

## Database Models

| Model | Key Fields | Notes |
|---|---|---|
| **User** | `discordId` (unique) | Created on first interaction |
| **PostFeedback** | `postId`, `voterId`, `voteType`, `feedback`, `weekId`, `guildId`, `sent` | One per (post, voter). Delivered via DM on `/week close` |
| **GuildConfig** | `guildId`, `voterRoleIds[]`, `judgeRoleIds[]`, `adminRoleIds[]`, `unlimitedRoleIds[]`, `upvoteThreshold`, `downvoteThreshold`, `defaultPostLimit`, `modLogChannelId`, `raffleRoleId` | One per guild, auto-created on join |
| **ChannelPair** | `guildConfigId`, `monitoredChannelId`, `shortlistChannelId` | Many per guild |
| **Week** | `monitoredChannelId`, `status` (ACTIVE/CLOSED), `rankingOpen`, `startDate`, `endDate` | Unique per (channel, startDate). Independent per channel |
| **Post** | `link`, `linkHash` (unique), `status` (PENDING/SHORTLISTED/REJECTED), `authorId`, `weekId`, `reviewMessageId` | reviewMessageId = shortlist channel message |
| **Vote** | `postId`, `userId`, `type` (UP/DOWN) | Unique (postId, userId). Supports update (vote change) |
| **Rating** | `postId`, `userId`, `score` (1–10) | Unique (postId, userId). Upsert supported |
| **WeightBoost** | `oderId` (userId), `guildId`, `grantedBy` | Grants x2 vote weight |
| **SpamPenalty** | `oderId`, `guildId`, `postId`, `weekId` | Reduces post limit by 1 per penalty |
| **Raffle** | `guildId`, `drawnAt`, `drawnBy` | One per draw event |
| **RaffleWinner** | `raffleId`, `oderId`, `tickets` | Winners of one draw |
| **QualityGuardTicket** | `oderId`, `guildId`, `tickets` | Accumulated across all draws |

---

## Enums
- `PostStatus`: PENDING | REJECTED | SHORTLISTED | FLAGGED_APPROVE | FLAGGED_REJECT
- `VoteType`: UP | DOWN
- `WeekStatus`: ACTIVE | CLOSED

---

## Complete Command Reference

### Config
| Command | Description |
|---|---|
| `/config show` | Show current guild settings |
| `/config set-mod-log <channel>` | Set mod log channel |
| `/config set-admin-roles <r1> [r2] [r3]` | Set admin roles |
| `/config set-post-limit <limit>` | Set default weekly post limit (1–10) |

### Channel Pairs
| Command | Description |
|---|---|
| `/channel-pair add <monitored> <shortlist>` | Create monitored↔shortlist pair |
| `/channel-pair remove <monitored>` | Remove pair by monitored channel |
| `/channel-pair list` | List all pairs |

### Roles & Thresholds
| Command | Description |
|---|---|
| `/set-voter-roles <r1> [r2] [r3]` | Who can vote (empty = everyone) |
| `/set-judge-roles <r1> [r2] [r3]` | Who can rate (empty = everyone) |
| `/set-unlimited-roles <r1> [r2] [r3]` | Bypass post limits |
| `/set-thresholds <up> <down>` | Set vote thresholds |

### Voting Periods
| Command | Description |
|---|---|
| `/week start <monitored>` | Start ACTIVE week for channel |
| `/week close <monitored>` | Close week, stop accepting posts |
| `/ranking start [monitored]` | Open rating phase for judges |

### Post Moderation
| Command | Description |
|---|---|
| `/post approve <postid>` | Manually approve PENDING post |
| `/post reject <postid>` | Manually reject post |
| `/post reset_votes <postid>` | Clear all votes, back to PENDING |

### Results & Analytics
| Command | Description |
|---|---|
| `/results [monitored] [week_id]` | Top 5 shortlisted by avg rating |
| `/watch-votes [monitored] [page]` | All pending posts with vote details (10/page) |
| `/stats [monitored] [role] [week_id] [period]` | Voting participation stats |
| `/export logs [monitored]` | Export ratings to CSV |
| `/leaderboard stats` | Raffle ticket leaderboard (top 10) |

### Raffle
| Command | Description |
|---|---|
| `/raffle draw` | Draw 5 random winners, award QG tickets |
| `/raffle badges [user]` | Show user tickets & wins, or top-15 list |

### Spam / Post Limit Management
| Command | Description |
|---|---|
| `/spam check <user>` | Show penalties & post counts per channel |
| `/spam reset <user>` | Clear all penalties for user |
| `/spam grant-slot <user> [channel]` | Remove one penalty (+1 slot) |
| `/spam remove <post_id>` | Remove penalty for specific post |
| `/spam remove-post <post_id>` | Delete post from DB (restores slot) |
| `/spam list` | All active penalties grouped by user |
| `/spam clear-link <link>` | Unblock duplicate link |
| `/spam add-penalty <user> <channel>` | Manually add penalty |

### Vote Weight
| Command | Description |
|---|---|
| `/weight grant <user>` | Grant x2 vote weight |
| `/weight revoke <user>` | Revoke x2 vote weight |
| `/weight list` | List all boosted users |

### Utility
| Command | Description |
|---|---|
| `/ping` | Bot alive check |
| `/help` | Comprehensive guide embed |
| `/parse-message <text>` | Parse announcement → /give-xp commands |
| `/reset-database` | DANGER: delete ALL data |

---

## Permission Levels

1. **Discord Server Admin** — Full access if no admin roles configured
2. **Admin Roles** (via `/config set-admin-roles`) — Override commands, spam management, raffle draws
3. **Judge Roles** — View `/results`, rate shortlisted posts
4. **Voter Roles** — Vote on posts (empty = everyone can vote)
5. **Unlimited Roles** — Bypass post limits

---

## Full Voting Cycle (Step-by-Step)

### 1. Setup
```
/config set-admin-roles → /config set-mod-log → /channel-pair add
/set-voter-roles → /set-judge-roles → /set-thresholds
```

### 2. Submission Phase
- Admin runs `/week start <channel>`
- User posts a link in the monitored channel
- Bot:
  1. Detects link via `linkDetector.ts`
  2. Normalizes link (strips UTM params) и хеширует
  3. Checks for duplicate (linkHash unique constraint)
  4. Checks user's post limit (default 3, reduced by penalties, boosted by shortlisted posts)
  5. If unlimited role → bypass limit
  6. Creates `Post` as PENDING
  7. Posts Yes/No voting buttons in same channel (vote counts hidden to prevent pressure)
  8. Warns user if they have 1 slot left

### 3. Voting Phase
- Community clicks 👍 (Yes) or 👎 (No) buttons — a **modal popup** appears asking for optional feedback (max 500 chars), with a "Send without feedback" option (just submit empty)
- Vote + optional feedback are recorded on modal submit
- Vote change allowed with **20-second cooldown**
- Weighted votes: default weight = 1, boosted = 2 (via `/weight grant`)
- **Auto-flag for review** when either threshold is reached — no automatic status change
  - Upvote threshold reached → status → `FLAGGED_APPROVE`, embed sent to mod log with ✅ Approve / ❌ Reject buttons
  - Downvote threshold reached → status → `FLAGGED_REJECT`, embed sent to mod log with ✅ Approve / ❌ Reject buttons
  - Admin presses **Approve** → post moves to `SHORTLISTED`, appears in shortlist channel with rating buttons
  - Admin presses **Reject** → post moves to `REJECTED`; spam penalty applied if low quality (0 upvotes)

### 4. Shortlist Phase
- Post moves to shortlist channel with embed:
  - `⭐ Shortlisted Content by @author`
  - Vote counts shown (👍 X | 👎 Y)
  - Link
  - Star rating buttons 1–10 (5 rows of 2)
  - Reject button (admin only)
- Admin can reject from shortlist → removes post, disables buttons

### 5. Ranking Phase
- Admin runs `/ranking start [channel]` → sets `week.rankingOpen = true`
- Judges click star buttons to rate (1–10)
- Cannot rate own posts
- Can update rating (upsert)

### 6. Results & Export
- `/results [channel]` → top 5 by average rating, medals 🥇🥈🥉
- `/export logs` → CSV with: Author, Link, Judge, Rating, Timestamp

### 7. Raffle Draw
- `/raffle draw`:
  1. Find all users who voted correctly since last raffle (YES on SHORTLISTED, NO on REJECTED)
  2. Pick up to 5 random winners
  3. Ticket pool = `max(1, round(totalPosts / winnerCount))`
  4. Award equal tickets to each winner
  5. Accumulate in QualityGuardTicket
- `/leaderboard stats` → top 10 by tickets + accuracy %

### 8. Close Phase
- Admin runs `/week close <channel>`
- Bot sends feedback DMs to post authors: all collected feedback grouped by author, delivered as one DM per author
- Penalties from closed week now affect next week's post limit
- Shortlisted posts from closed week give +1 recovery slot

---

## Post Limit Calculation

```
limit = min(defaultLimit, max(1, defaultLimit - penalties + shortlisted_in_closed_weeks))
```

- `penalties` = SpamPenalty count for user in CLOSED weeks for that channel
- `shortlisted` = Posts with SHORTLISTED status in CLOSED weeks for that channel
- Minimum: 1, Maximum: defaultPostLimit (from GuildConfig)
- Unlimited roles bypass this entirely

---

## Spam Penalty — When Added

A spam penalty is automatically added when:
- Post reaches downvote threshold (auto-rejected)
- **AND** post has 0 upvotes at time of rejection

Manual penalties: `/spam add-penalty <user> <channel>`

---

## Duplicate Link Detection

1. Extract first HTTP(S) URL from message
2. Normalize: lowercase, parse URL, remove UTM/tracking params (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `fbclid`, `gclid`, `ref`, `source`, `_ga`, `mc_cid`, `mc_eid`), sort remaining params
3. Create hash: `link_{jsHash}_{length}`
4. Unique constraint on `Post.linkHash` — race-safe
5. If duplicate found:
   - Delete user's message
   - DM user about original post
   - Log to mod log
   - Do NOT consume post slot

---

## Moderation Log Events (22 types)

| Event | Color |
|---|---|
| POST_REJECTED_AUTO | 🔴 Red |
| POST_SHORTLISTED_AUTO | 🟢 Green |
| CONTENT_FLAGGED | 🟠 Orange (with Approve/Reject buttons) |
| ADMIN_OVERRIDE_APPROVE | 🔵 Blue |
| ADMIN_OVERRIDE_REJECT | 🟠 Orange |
| ADMIN_OVERRIDE_RESET | 🟡 Yellow |
| DUPLICATE_LINK_DELETED | — |
| WEEK_STARTED / WEEK_CLOSED | — |
| EXPORT_RESULTS | — |
| BOT_ERROR | — |
| SPAM_PENALTY_ADDED / SPAM_PENALTY_RESET / POST_BLOCKED_SPAM | — |
| WEIGHT_BOOST_GRANTED / WEIGHT_BOOST_REVOKED | — |
| RAFFLE_DRAWN | — |
| RATING_CHANGED | 🟡 Yellow |

---

## Key Implementation Notes

- **Weeks are per-channel** — each monitored channel has independent voting periods
- **Vote counts hidden** on buttons — only visible in mod log / admin commands
- **Vote change cooldown** — 20 seconds via `Vote.updatedAt`
- **Author cannot rate own post** — checked via `post.authorId === userId`
- **No race condition on duplicates** — unique DB constraint handles it atomically
- **Multi-guild** — all data scoped to guildId, separate configs per guild
- **Bot intents:** Guilds, GuildMessages, MessageContent, GuildMembers
