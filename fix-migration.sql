-- Fix for failed migration 20251229232854_add_link_hash
-- Run this manually on your production database

-- Step 1: Delete the failed migration record
DELETE FROM "_prisma_migrations" WHERE migration_name = '20251229232854_add_link_hash';

-- Step 2: If linkHash column exists but is broken, drop it
ALTER TABLE "Post" DROP COLUMN IF EXISTS "linkHash";

-- Now the fixed migration will be able to run on next deploy
