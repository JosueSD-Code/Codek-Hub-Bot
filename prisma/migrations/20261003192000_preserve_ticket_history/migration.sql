-- Preserve ticket history when ticket panel/category configuration is deleted.
-- Existing ticket category names are copied before the foreign key becomes nullable.

ALTER TABLE "Ticket" ADD COLUMN "categoryName" TEXT;

UPDATE "Ticket" AS t
SET "categoryName" = c."name"
FROM "TicketCategory" AS c
WHERE t."categoryId" = c."id"
  AND t."categoryName" IS NULL;

ALTER TABLE "Ticket" ALTER COLUMN "categoryId" DROP NOT NULL;

ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_categoryId_fkey";

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "TicketCategory"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
