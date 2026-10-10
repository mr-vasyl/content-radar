-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "account" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'sent',
ADD COLUMN     "stream" TEXT;
