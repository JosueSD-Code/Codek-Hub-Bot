-- Add a dedicated audit event for role updates.
ALTER TYPE "LogEvent" ADD VALUE IF NOT EXISTS 'ROLE_UPDATE';

UPDATE "LogConfig"
SET "events" = array_append("events", 'ROLE_UPDATE'::"LogEvent")
WHERE NOT ('ROLE_UPDATE'::"LogEvent" = ANY("events"));
