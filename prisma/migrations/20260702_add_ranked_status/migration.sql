-- Add RANKED value to PostStatus enum
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'RANKED';
