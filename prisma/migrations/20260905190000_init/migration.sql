-- Codek Hub initial PostgreSQL schema.
-- This migration mirrors prisma/schema.prisma.

CREATE TABLE "Guild" (
  "id" VARCHAR(32) NOT NULL,
  "name" TEXT,
  "icon" TEXT,
  "ownerId" TEXT,
  "logChannelId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketPanel" (
  "id" TEXT NOT NULL,
  "guildId" VARCHAR(32) NOT NULL,
  "name" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "color" TEXT,
  "image" TEXT,
  "thumbnail" TEXT,
  "footer" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TicketPanel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketCategory" (
  "id" TEXT NOT NULL,
  "panelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "emoji" TEXT,
  "supportRoleIds" TEXT[] NOT NULL,
  "discordCategoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketQuestion" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "placeholder" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ticket" (
  "id" TEXT NOT NULL,
  "guildId" VARCHAR(32) NOT NULL,
  "categoryId" TEXT NOT NULL,
  "userId" VARCHAR(32) NOT NULL,
  "channelId" VARCHAR(32) NOT NULL,
  "number" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "claimedById" VARCHAR(32),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketAnswer" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  CONSTRAINT "TicketAnswer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketClaim" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "userId" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketTranscript" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketTranscript_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WelcomeConfig" (
  "id" TEXT NOT NULL,
  "guildId" VARCHAR(32) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "channelId" VARCHAR(32),
  "message" TEXT,
  "title" TEXT,
  "description" TEXT,
  "color" TEXT,
  "image" TEXT,
  "thumbnail" TEXT,
  "footer" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WelcomeConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VouchConfig" (
  "id" TEXT NOT NULL,
  "guildId" VARCHAR(32) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "channelId" VARCHAR(32),
  "allowedRoleIds" TEXT[] NOT NULL,
  "cooldown" INTEGER NOT NULL DEFAULT 60,
  "title" TEXT,
  "description" TEXT,
  "color" TEXT,
  "image" TEXT,
  "thumbnail" TEXT,
  "footer" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VouchConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vouch" (
  "id" TEXT NOT NULL,
  "guildId" VARCHAR(32) NOT NULL,
  "targetId" VARCHAR(32) NOT NULL,
  "reviewerId" VARCHAR(32) NOT NULL,
  "reviewType" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vouch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutoResponder" (
  "id" TEXT NOT NULL,
  "guildId" VARCHAR(32) NOT NULL,
  "trigger" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "matchType" TEXT NOT NULL DEFAULT 'contains',
  "embedTitle" TEXT,
  "embedDescription" TEXT,
  "embedColor" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutoResponder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresenceConfig" (
  "id" TEXT NOT NULL,
  "guildId" VARCHAR(32) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "type" TEXT NOT NULL DEFAULT 'Watching',
  "text" TEXT NOT NULL DEFAULT 'Codek Hub',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PresenceConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "guildId" VARCHAR(32) NOT NULL,
  "userId" VARCHAR(32) NOT NULL,
  "module" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketPanel_guildId_name_key" ON "TicketPanel"("guildId","name");
CREATE UNIQUE INDEX "TicketCategory_panelId_name_key" ON "TicketCategory"("panelId","name");
CREATE UNIQUE INDEX "TicketQuestion_categoryId_label_key" ON "TicketQuestion"("categoryId","label");
CREATE UNIQUE INDEX "Ticket_channelId_key" ON "Ticket"("channelId");
CREATE UNIQUE INDEX "Ticket_guildId_categoryId_number_key" ON "Ticket"("guildId","categoryId","number");
CREATE UNIQUE INDEX "TicketTranscript_ticketId_key" ON "TicketTranscript"("ticketId");
CREATE UNIQUE INDEX "WelcomeConfig_guildId_key" ON "WelcomeConfig"("guildId");
CREATE UNIQUE INDEX "VouchConfig_guildId_key" ON "VouchConfig"("guildId");
CREATE UNIQUE INDEX "Vouch_guildId_targetId_reviewerId_key" ON "Vouch"("guildId","targetId","reviewerId");
CREATE UNIQUE INDEX "AutoResponder_guildId_trigger_key" ON "AutoResponder"("guildId","trigger");
CREATE UNIQUE INDEX "PresenceConfig_guildId_key" ON "PresenceConfig"("guildId");

CREATE INDEX "TicketPanel_guildId_name_idx" ON "TicketPanel"("guildId","name");
CREATE INDEX "TicketCategory_panelId_name_idx" ON "TicketCategory"("panelId","name");
CREATE INDEX "TicketQuestion_categoryId_label_idx" ON "TicketQuestion"("categoryId","label");
CREATE INDEX "Ticket_guildId_status_idx" ON "Ticket"("guildId","status");
CREATE INDEX "Ticket_guildId_userId_status_idx" ON "Ticket"("guildId","userId","status");
CREATE INDEX "Ticket_categoryId_status_idx" ON "Ticket"("categoryId","status");
CREATE INDEX "TicketClaim_ticketId_userId_idx" ON "TicketClaim"("ticketId","userId");
CREATE INDEX "Vouch_guildId_targetId_createdAt_idx" ON "Vouch"("guildId","targetId","createdAt");
CREATE INDEX "Vouch_guildId_reviewerId_createdAt_idx" ON "Vouch"("guildId","reviewerId","createdAt");
CREATE INDEX "AutoResponder_guildId_enabled_trigger_idx" ON "AutoResponder"("guildId","enabled","trigger");
CREATE INDEX "AuditLog_guildId_createdAt_idx" ON "AuditLog"("guildId","createdAt");
CREATE INDEX "AuditLog_guildId_module_action_idx" ON "AuditLog"("guildId","module","action");

ALTER TABLE "TicketPanel"
  ADD CONSTRAINT "TicketPanel_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketCategory"
  ADD CONSTRAINT "TicketCategory_panelId_fkey"
  FOREIGN KEY ("panelId") REFERENCES "TicketPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketQuestion"
  ADD CONSTRAINT "TicketQuestion_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "TicketCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "TicketCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketAnswer"
  ADD CONSTRAINT "TicketAnswer_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketClaim"
  ADD CONSTRAINT "TicketClaim_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketTranscript"
  ADD CONSTRAINT "TicketTranscript_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WelcomeConfig"
  ADD CONSTRAINT "WelcomeConfig_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VouchConfig"
  ADD CONSTRAINT "VouchConfig_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PresenceConfig"
  ADD CONSTRAINT "PresenceConfig_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutoResponder"
  ADD CONSTRAINT "AutoResponder_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_guildId_fkey"
  FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
