-- Add missing shortlistPosition column to Post table
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "shortlistPosition" INTEGER;
