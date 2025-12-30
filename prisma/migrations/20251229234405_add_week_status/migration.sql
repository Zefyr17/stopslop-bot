-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- AlterTable
ALTER TABLE "Week" ADD COLUMN "status" "WeekStatus" NOT NULL DEFAULT 'ACTIVE';
