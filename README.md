# 🤖 Discord Content Voting Bot

Бот для управления контентом на Discord-сервере с системой голосования сообщества и оценки судей.

## 📋 Оглавление

- [Описание](#описание)
- [Возможности](#возможности)
- [Установка и настройка](#установка-и-настройка)
- [Команды бота](#команды-бота)
- [Рабочий процесс](#рабочий-процесс)
- [Архитектура](#архитектура)

---

## 🎯 Описание

Этот Discord-бот создан для управления процессом отбора контента в сообществе. Он автоматически отслеживает сообщения с ссылками в указанных каналах, позволяет участникам голосовать за лучший контент, а судьям - оценивать отобранные работы.

### Основные этапы работы:

1. **Публикация** - пользователи постят ссылки в отслеживаемых каналах
2. **Голосование** - сообщество голосует за/против (👍/👎)
3. **Шорт-лист** - одобренный контент попадает в канал шорт-листа
4. **Оценка** - судьи ставят оценки от 1 до 10 звезд
5. **Результаты** - топ-5 работ по средней оценке

---

## ✨ Возможности

### 🔍 Отслеживание контента
- Автоматическое обнаружение ссылок в сообщениях
- Защита от дубликатов (умная нормализация ссылок)
- Поддержка нескольких отслеживаемых каналов
- Связывание каналов (отслеживаемый → шорт-лист)

### 🗳️ Система голосования
- Бинарное голосование: Да (👍) / Нет (👎)
- Настраиваемые пороги одобрения/отклонения
- Приватный подсчет голосов
- Защита от частой смены голоса (кулдаун 20 секунд)
- Ограничение голосования по ролям

### ⭐ Система оценок
- Оценка от 1 до 10 звезд для шорт-листа
- Доступ только для судей (настраиваемые роли)
- Запрет на оценку собственных работ
- Возможность изменения оценки
- Расчет средней оценки с учетом предвзятости авторов

### 📊 Недельные периоды
- Управление голосованием по неделям
- Независимые периоды для каждого канала
- Открытие/закрытие периодов голосования
- Сессии рейтинга для судей

### 🛡️ Модерация
- Ручное одобрение/отклонение постов администраторами
- Сброс голосов
- Детальное логирование в канал мод-логов
- 11 типов событий с цветными embed-сообщениями

### 📈 Экспорт данных
- Экспорт логов оценок в CSV
- Фильтрация по каналам и периодам
- Включает: автора, ссылку, судью, оценку, время

### 🔐 Управление доступом
- **Роли избирателей** - кто может голосовать
- **Роли судей** - кто может оценивать
- **Роли администраторов** - ручное управление постами
- Администраторы сервера имеют полный доступ

---

## 🚀 Установка и настройка

### Предварительные требования

- Node.js 18+
- PostgreSQL база данных
- Discord бот токен

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка окружения

Создайте файл `.env` в корне проекта:

```env
DISCORD_TOKEN=your_discord_bot_token_here
DATABASE_URL=postgresql://user:password@host:port/database
```

### 3. Настройка базы данных

```bash
# Генерация Prisma клиента
npm run db:generate

# Применение миграций
npm run db:migrate

# Или для продакшена
npm run db:deploy
```

### 4. Запуск бота

**Режим разработки:**
```bash
npm run dev
```

**Продакшен:**
```bash
npm run build
npm start
```

### 5. Настройка на сервере Discord

После добавления бота на сервер используйте команды конфигурации:

```
/channel-pair add <отслеживаемый-канал> <канал-шорт-листа>
/config set-mod-log <канал-для-логов>
/set-voter-roles <роль1> [роль2] [роль3]
/set-judge-roles <роль1> [роль2] [роль3]
/set-thresholds <за> <против>
```

---

## 📜 Команды бота

### 🔧 Служебные команды

#### `/ping`
Проверка работоспособности бота.
```
/ping
```

#### `/help`
Показывает полное руководство по использованию бота, текущую конфигурацию и список всех команд.
```
/help
```

---

### ⚙️ Команды конфигурации (требуют права администратора)

#### `/config show`
Отображает текущие настройки сервера:
- Пары каналов
- Канал мод-логов
- Роли избирателей/судей/администраторов
- Пороги голосования

```
/config show
```

#### `/config set-mod-log`
Устанавливает канал для логов модерации.
```
/config set-mod-log channel:#mod-logs
```

#### `/config set-admin-roles`
Назначает роли администраторов (до 3 ролей).
```
/config set-admin-roles role1:@Admin role2:@Moderator
```

---

### 📢 Управление каналами (администратор)

#### `/channel-pair add`
Создает связку: отслеживаемый канал → канал шорт-листа.
```
/channel-pair add monitored:#submissions shortlist:#approved
```

#### `/channel-pair remove`
Удаляет связку каналов.
```
/channel-pair remove monitored:#submissions
```

#### `/channel-pair list`
Показывает все настроенные пары каналов.
```
/channel-pair list
```

---

### 👥 Настройка ролей (администратор)

#### `/set-voter-roles`
Указывает, какие роли могут голосовать (пусто = все).
```
/set-voter-roles role1:@Member role2:@Contributor
```

#### `/set-judge-roles`
Указывает, какие роли могут оценивать (пусто = все).
```
/set-judge-roles role1:@Judge role2:@Expert
```

#### `/set-thresholds`
Устанавливает пороги голосования.
```
/set-thresholds upvotes:5 downvotes:5
```
- **upvotes** - количество голосов "за" для одобрения
- **downvotes** - количество голосов "против" для отклонения

---

### 📅 Управление периодами голосования (администратор)

#### `/week start`
Начинает новый период голосования.
```
/week start [monitored:#channel]
```
- Без параметра: запускает для всех каналов
- С каналом: запускает только для указанного канала

#### `/week close`
Закрывает текущий период голосования.
```
/week close [monitored:#channel]
```
- Без параметра: закрывает для всех каналов
- С каналом: закрывает только для указанного канала

---

### 🏆 Управление рейтингом (администратор)

#### `/ranking start`
Открывает сессию оценки для судей.
```
/ranking start [monitored:#channel]
```
- Позволяет судьям оценивать шорт-лист (1-10 звезд)

---

### 📊 Результаты и экспорт

#### `/results`
Показывает топ-5 работ текущей недели (только для судей).
```
/results [monitored:#channel]
```
- Отображает:
  - 🥇🥈🥉 Медали для топ-3
  - Среднюю оценку
  - Количество голосов
  - Нормализованный счет (учитывает предвзятость авторов)

#### `/export logs`
Экспортирует логи оценок в CSV (только администраторы).
```
/export logs [monitored:#channel]
```
- Содержит: автор, ссылка, судья, оценка, время
- Имя файла: `rating_logs_YYYY-MM-DD[_CHANNELID].csv`

---

### 🛠️ Модерация постов (администраторы/судьи)

#### `/post approve`
Ручное одобрение поста (обход голосования).
```
/post approve postid:abc123
```
- Меняет статус: PENDING → SHORTLISTED
- Отключает кнопки голосования
- Публикует в канал шорт-листа с кнопками оценки

#### `/post reject`
Ручное отклонение поста.
```
/post reject postid:abc123
```
- Меняет статус: PENDING/SHORTLISTED → REJECTED
- Отключает кнопки

#### `/post reset_votes`
Сбрасывает все голоса по посту.
```
/post reset_votes postid:abc123
```
- Меняет статус: REJECTED/SHORTLISTED → PENDING
- Включает кнопки голосования заново

---

### 🗑️ Управление базой данных (администратор)

#### `/reset-database`
⚠️ **ОПАСНО**: Полностью очищает базу данных.
```
/reset-database
```
- Удаляет ВСЕ данные: оценки, голоса, посты, недели, пары каналов, конфигурации
- Требуется ручная переконфигурация после выполнения

---

### 💬 Устаревшие текстовые команды

#### `!ping`
Устаревшая команда проверки.

#### `!config`
Устаревший просмотр конфигурации.

#### `!results`
Устаревший просмотр результатов (требуется роль судьи).

---

## 🔄 Рабочий процесс

### Жизненный цикл поста

```
┌─────────────────────────────────────────────────────┐
│  1. Пользователь постит ссылку                      │
│     в отслеживаемом канале                          │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  2. Бот проверяет на дубликаты                      │
│     (нормализация ссылок, хеширование)              │
└────────────┬────────────────────────┬────────────────┘
             │                        │
     Дубликат │                        │ Новая ссылка
             ▼                        ▼
┌─────────────────────┐   ┌──────────────────────────┐
│  Удаление сообщения │   │  Создание поста          │
│  + DM уведомление   │   │  Статус: PENDING         │
│  + Лог в мод-канал  │   │  + Кнопки голосования    │
└─────────────────────┘   └────────────┬─────────────┘
                                       │
                                       ▼
                     ┌─────────────────────────────────┐
                     │  3. Голосование сообщества      │
                     │     👍 За / 👎 Против           │
                     └──┬──────────────────────────┬───┘
                        │                          │
      Достигнут порог   │                          │  Достигнут порог
      отклонения        │                          │  одобрения
                        ▼                          ▼
          ┌──────────────────────┐    ┌───────────────────────┐
          │  Статус: REJECTED    │    │  Статус: SHORTLISTED  │
          │  Кнопки отключены    │    │  Пост в шорт-листе    │
          └──────────────────────┘    │  + Кнопки оценки 1-10 │
                                      └───────────┬───────────┘
                                                  │
                                                  ▼
                                      ┌───────────────────────┐
                                      │  4. Оценка судьями    │
                                      │     ⭐ 1-10 звезд     │
                                      └───────────┬───────────┘
                                                  │
                                                  ▼
                                      ┌───────────────────────┐
                                      │  5. Результаты        │
                                      │     Топ-5 по оценкам  │
                                      │     🥇🥈🥉            │
                                      └───────────────────────┘
```

### Статусы постов

- **PENDING** - ожидает голосования
- **SHORTLISTED** - одобрено сообществом, ожидает оценки
- **REJECTED** - отклонено сообществом

### Защита от дубликатов

Бот нормализует ссылки перед сохранением, удаляя параметры отслеживания:
- UTM метки: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- Tracking коды: `fbclid`, `gclid`, `ref`, `source`, `_ga`, `mc_cid`, `mc_eid`

Затем создается хеш нормализованной ссылки. При попытке добавить дубликат:
1. Бот удаляет сообщение
2. Отправляет DM пользователю с уведомлением
3. Логирует событие в мод-канал

---

## 🏗️ Архитектура

### Технологический стек

- **Язык**: TypeScript 5.3.3
- **Framework**: discord.js 14.14.1
- **База данных**: PostgreSQL
- **ORM**: Prisma 7.2.0
- **Runtime**: Node.js 18+

### Структура проекта

```
discordbot/
├── src/
│   ├── bot.ts              # Главный файл с обработчиками событий (1,637 строк)
│   ├── index.ts            # Точка входа
│   ├── commands.ts         # Определения slash-команд
│   ├── db.ts               # Prisma клиент
│   ├── services/           # Бизнес-логика
│   │   ├── PostService.ts
│   │   ├── VoteService.ts
│   │   ├── RatingService.ts
│   │   ├── WeekService.ts
│   │   ├── GuildConfigService.ts
│   │   ├── ChannelPairService.ts
│   │   ├── ModLogService.ts
│   │   └── ExportService.ts
│   └── utils/              # Утилиты
│       ├── linkNormalizer.ts
│       └── linkDetector.ts
├── prisma/
│   └── schema.prisma       # Схема базы данных
├── package.json
├── tsconfig.json
└── .env                    # Переменные окружения (не в репозитории)
```

### Модели базы данных

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
  linkHash            String     @unique  // Защита от дубликатов
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

  @@unique([postId, userId])  // Один голос на пользователя
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

  @@unique([postId, userId])  // Одна оценка на пользователя
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

### Архитектура сервисов

Бот использует **Service Layer** архитектуру для разделения бизнес-логики:

- **PostService** - управление постами
- **VoteService** - обработка голосов
- **RatingService** - управление оценками
- **WeekService** - управление периодами
- **GuildConfigService** - конфигурация серверов
- **ChannelPairService** - связки каналов
- **ModLogService** - логирование событий
- **ExportService** - экспорт данных

### События Discord

Бот реагирует на следующие события:

1. **ClientReady** - инициализация при запуске
2. **GuildCreate** - добавление на новый сервер
3. **MessageCreate** - обработка сообщений с ссылками
4. **InteractionCreate** - обработка команд и кнопок

### Типы логов модерации

| Событие | Цвет | Описание |
|---------|------|----------|
| POST_REJECTED_AUTO | 🔴 Красный | Автоматическое отклонение |
| POST_SHORTLISTED_AUTO | 🟢 Зеленый | Автоматическое одобрение |
| ADMIN_OVERRIDE_APPROVE | 🟡 Желтый | Ручное одобрение админом |
| ADMIN_OVERRIDE_REJECT | 🟡 Желтый | Ручное отклонение админом |
| ADMIN_OVERRIDE_RESET | 🟡 Желтый | Сброс голосов админом |
| DUPLICATE_LINK_DELETED | 🟠 Оранжевый | Удален дубликат |
| WEEK_STARTED | 🔵 Синий | Начат новый период |
| WEEK_CLOSED | 🔵 Синий | Закрыт период |
| EXPORT_RESULTS | 🟣 Фиолетовый | Экспорт данных |
| BOT_ERROR | 🔴 Красный | Ошибка бота |
| RATING_CHANGED | 🟢 Зеленый | Изменена оценка |

---

## 📊 Статистика проекта

- **Всего строк кода**: 1,637+ строк
- **Slash-команд**: 20
- **Моделей БД**: 7
- **Типов событий**: 11
- **Сервисов**: 8
- **Типов ролей**: 3 (Избиратель, Судья, Администратор)
- **Статусов постов**: 3 (PENDING, SHORTLISTED, REJECTED)
- **Шкала оценок**: 1-10 звезд

---

## 🔒 Безопасность

- Приватный подсчет голосов (не показываются публично)
- Защита от спама голосами (кулдаун 20 секунд)
- Race-condition защита при дубликатах (уникальный constraint на linkHash)
- Права доступа на основе ролей
- Логирование всех административных действий
- Защита от SQL-инъекций (через Prisma ORM)

---

## 🤝 Вклад в проект

Бот разработан для управления контентом в Discord-сообществах с прозрачной системой голосования и оценки.

---

## 📝 Лицензия

ISC

---

## 🆘 Поддержка

При возникновении проблем проверьте:
1. Правильность токена Discord и DATABASE_URL в `.env`
2. Применены ли миграции БД (`npm run db:migrate`)
3. Есть ли у бота необходимые права на сервере Discord
4. Настроены ли пары каналов через `/channel-pair add`

Для дополнительной помощи обратитесь к логам в консоли или мод-логам на сервере.
