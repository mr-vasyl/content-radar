-- CreateTable
CREATE TABLE "PromoPost" (
    "id" SERIAL NOT NULL,
    "theme" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "productUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoPost_pkey" PRIMARY KEY ("id")
);
