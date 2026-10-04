-- CreateEnum
CREATE TYPE "LogEvent" AS ENUM ('MESSAGE_DELETE', 'MESSAGE_EDIT', 'MEMBER_JOIN', 'MEMBER_LEAVE', 'MEMBER_UPDATE', 'ROLE_CREATE', 'ROLE_DELETE', 'CHANNEL_CREATE', 'CHANNEL_DELETE', 'CHANNEL_UPDATE', 'MODERATION', 'TICKET_CREATE', 'TICKET_CLOSE', 'TICKET_CLAIM', 'COMMAND');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "closedReason" TEXT,
ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';

-- AlterTable
ALTER TABLE "WelcomeConfig" ADD COLUMN "goodbyeChannelId" TEXT,
ADD COLUMN "goodbyeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "goodbyeMessage" TEXT;

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogConfig" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "events" "LogEvent"[],

    CONSTRAINT "LogConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "prize" TEXT NOT NULL,
    "winners" INTEGER NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "participants" TEXT[],
    "ended" BOOLEAN NOT NULL DEFAULT false,
    "winnerIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoModRule" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "action" TEXT NOT NULL DEFAULT 'delete',
    "threshold" INTEGER,
    "durationSeconds" INTEGER,
    "whitelist" TEXT[],
    "exceptions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoModRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStats" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT,
    "staffId" TEXT,
    "categoryId" TEXT,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,

    CONSTRAINT "TicketStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationAction_guildId_targetId_idx" ON "ModerationAction"("guildId", "targetId");

-- CreateIndex
CREATE INDEX "ModerationAction_createdAt_idx" ON "ModerationAction"("createdAt");

-- CreateIndex
CREATE INDEX "Giveaway_guildId_ended_endsAt_idx" ON "Giveaway"("guildId", "ended", "endsAt");

-- CreateIndex
CREATE INDEX "AutoModRule_guildId_enabled_idx" ON "AutoModRule"("guildId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AutoModRule_guildId_type_key" ON "AutoModRule"("guildId", "type");

-- CreateIndex
CREATE INDEX "TicketStats_guildId_timestamp_idx" ON "TicketStats"("guildId", "timestamp");

-- CreateIndex
CREATE INDEX "TicketStats_guildId_action_idx" ON "TicketStats"("guildId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "TicketPanel_guildId_name_key" ON "TicketPanel"("guildId", "name");

-- CreateIndex
CREATE INDEX "TicketQuestion_categoryId_label_idx" ON "TicketQuestion"("categoryId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "TicketQuestion_categoryId_label_key" ON "TicketQuestion"("categoryId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Vouch_guildId_targetId_reviewerId_key" ON "Vouch"("guildId", "targetId", "reviewerId");

-- CreateIndex
CREATE INDEX "Vouch_guildId_targetId_createdAt_idx" ON "Vouch"("guildId", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "Vouch_guildId_reviewerId_createdAt_idx" ON "Vouch"("guildId", "reviewerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogConfig" ADD CONSTRAINT "LogConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoModRule" ADD CONSTRAINT "AutoModRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStats" ADD CONSTRAINT "TicketStats_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
