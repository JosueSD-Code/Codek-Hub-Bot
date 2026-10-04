-- Add a dedicated audit event for role updates and make LogConfig.events match the Prisma contract.
-- The enum value is intentionally not referenced later in this migration because PostgreSQL
-- may reject using a newly-added enum value before the transaction commits.
ALTER TYPE "LogEvent" ADD VALUE IF NOT EXISTS 'ROLE_UPDATE';

UPDATE "LogConfig"
SET "events" = ARRAY[]::"LogEvent"[]
WHERE "events" IS NULL;

ALTER TABLE "LogConfig"
ALTER COLUMN "events" SET DEFAULT ARRAY[]::"LogEvent"[],
ALTER COLUMN "events" SET NOT NULL;
