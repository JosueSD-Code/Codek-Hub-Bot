-- Add a dedicated audit event for role updates and make LogConfig.events match the Prisma contract.
ALTER TYPE "LogEvent" ADD VALUE IF NOT EXISTS 'ROLE_UPDATE';

UPDATE "LogConfig"
SET "events" = ARRAY[]::"LogEvent"[]
WHERE "events" IS NULL;

ALTER TABLE "LogConfig"
ALTER COLUMN "events" SET DEFAULT ARRAY[]::"LogEvent"[],
ALTER COLUMN "events" SET NOT NULL;

UPDATE "LogConfig"
SET "events" = array_append("events", 'ROLE_UPDATE'::"LogEvent")
WHERE NOT ('ROLE_UPDATE'::"LogEvent" = ANY("events"));
