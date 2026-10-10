-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "post" TEXT;

-- CreateTable
CREATE TABLE "FeaturedItem" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "featuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormatRun" (
    "id" SERIAL NOT NULL,
    "format" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormatRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedItem_key_format_key" ON "FeaturedItem"("key", "format");

-- CreateIndex
CREATE UNIQUE INDEX "FormatRun_format_period_key" ON "FormatRun"("format", "period");
