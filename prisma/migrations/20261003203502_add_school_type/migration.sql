-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('PRIMARY', 'JHS', 'SHS', 'MIXED');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "type" "SchoolType" NOT NULL DEFAULT 'JHS';
