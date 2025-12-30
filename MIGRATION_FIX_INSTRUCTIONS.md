# Инструкция по исправлению провалившейся миграции

## Проблема
Миграция `20251229232854_add_link_hash` провалилась на продакшн из-за дублирующихся значений `linkHash` в базе данных.

## Решение

### Вариант 1: Через Render Dashboard (рекомендуется)

1. Зайдите в Render Dashboard → ваш PostgreSQL инстанс
2. Откройте "Shell" или "Connect" → выберите "External Connection"
3. Выполните SQL команды из файла `fix-migration.sql`:

```sql
-- Удалить запись о провалившейся миграции
DELETE FROM "_prisma_migrations" WHERE migration_name = '20251229232854_add_link_hash';

-- Удалить колонку linkHash если она была частично создана
ALTER TABLE "Post" DROP COLUMN IF EXISTS "linkHash";
```

4. Перезапустите деплой в Render (Deploy → Manual Deploy → "Clear build cache & deploy")

### Вариант 2: Используя psql локально

1. Получите Database URL из Render (Settings → Connection String → External)
2. Подключитесь к базе:
```bash
psql "your-connection-string-here"
```
3. Выполните команды из `fix-migration.sql`
4. Перезапустите деплой

### Вариант 3: Через код (если есть доступ к выполнению кода на продакшн)

Создайте временный скрипт и запустите его один раз перед деплоем.

## Что было исправлено

В миграции `20251229232854_add_link_hash/migration.sql` добавлен шаг удаления дубликатов **перед** созданием уникального индекса:

```sql
-- Step 3: Handle duplicates - keep only the oldest post for each linkHash
DELETE FROM "Post" p1
WHERE EXISTS (
  SELECT 1 FROM "Post" p2
  WHERE p2."linkHash" = p1."linkHash"
  AND p2."createdAt" < p1."createdAt"
);
```

Это гарантирует, что в базе останется только одна запись для каждой уникальной ссылки.

## После исправления

После выполнения SQL команд и повторного деплоя:
- Миграция применится успешно
- Дубликаты будут удалены (останется только самый старый пост для каждой ссылки)
- Уникальный индекс на `linkHash` будет создан
- Новые дубликаты будут блокироваться на уровне базы данных
