-- AlterTable
-- Step 1: Add the linkHash column as nullable first
ALTER TABLE "Post" ADD COLUMN "linkHash" TEXT;

-- Step 2: Update existing posts with normalized link hashes
-- This is a placeholder - in production, you would need to run a data migration script
-- For now, we'll set a default hash based on the link
UPDATE "Post" SET "linkHash" = MD5(LOWER(TRIM(link)));

-- Step 3: Handle duplicates - keep only the oldest post for each linkHash
-- Delete duplicate posts, keeping only the first one (oldest by createdAt)
DELETE FROM "Post" p1
WHERE EXISTS (
  SELECT 1 FROM "Post" p2
  WHERE p2."linkHash" = p1."linkHash"
  AND p2."createdAt" < p1."createdAt"
);

-- Step 4: Make linkHash NOT NULL and add unique constraint
ALTER TABLE "Post" ALTER COLUMN "linkHash" SET NOT NULL;
CREATE UNIQUE INDEX "Post_linkHash_key" ON "Post"("linkHash");
