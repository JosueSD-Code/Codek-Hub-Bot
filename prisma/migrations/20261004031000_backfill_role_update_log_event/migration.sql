-- Backfill existing log configurations after ROLE_UPDATE has been committed to the enum.
UPDATE "LogConfig"
SET "events" = array_append("events", 'ROLE_UPDATE'::"LogEvent")
WHERE NOT ('ROLE_UPDATE'::"LogEvent" = ANY("events"));
