-- CreateTable
CREATE TABLE "SentMessage" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "source" TEXT,
    "account" TEXT,
    "score" INTEGER,
    "reaction" TEXT,
    "reactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "BotState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentMessage_messageId_key" ON "SentMessage"("messageId");
