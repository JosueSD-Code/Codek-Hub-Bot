import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function tableExists(tableName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = $1',
    tableName
  );
  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = $1 AND column_name = $2',
    tableName,
    columnName
  );
  return rows.length > 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not configured in this workflow; skipping live database check.');
    return;
  }

  const ticketCategoryName = await columnExists('Ticket', 'categoryName');
  const ticketCategoryIdNullable = await prisma.$queryRawUnsafe(
    'SELECT is_nullable FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = \'Ticket\' AND column_name = \'categoryId\''
  );

  const duplicateChecks = {
    ticketPanels: await prisma.$queryRaw`SELECT "guildId", "name", COUNT(*)::int AS count FROM "TicketPanel" GROUP BY "guildId", "name" HAVING COUNT(*) > 1`,
    ticketQuestions: await prisma.$queryRaw`SELECT "categoryId", "label", COUNT(*)::int AS count FROM "TicketQuestion" GROUP BY "categoryId", "label" HAVING COUNT(*) > 1`,
    vouches: await prisma.$queryRaw`SELECT "guildId", "targetId", "reviewerId", COUNT(*)::int AS count FROM "Vouch" GROUP BY "guildId", "targetId", "reviewerId" HAVING COUNT(*) > 1`
  };

  const migrationTable = await tableExists('_prisma_migrations');
  let migrationApplied = false;
  if (migrationTable) {
    const rows = await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261003192000_preserve_ticket_history' AND finished_at IS NOT NULL LIMIT 1`;
    migrationApplied = rows.length > 0;
  }

  const result = {
    ticketCategoryName,
    ticketCategoryIdNullable: ticketCategoryIdNullable[0]?.is_nullable === 'YES',
    migrationTable,
    migrationApplied,
    duplicates: duplicateChecks
  };

  console.log(JSON.stringify(result, null, 2));

  const duplicateCount = Object.values(duplicateChecks).reduce((sum, rows) => sum + rows.length, 0);
  if (duplicateCount > 0) {
    throw new Error('Database contains duplicate rows that conflict with declared unique constraints.');
  }

  if (!ticketCategoryName || result.ticketCategoryIdNullable !== true) {
    throw new Error('Ticket history schema is not applied: categoryName/categoryId nullable state is incorrect.');
  }

  if (!migrationApplied) {
    console.warn('WARNING: migration 20261003192000_preserve_ticket_history is not recorded as applied. Apply it with: npx prisma migrate deploy');
  }
}

main()
  .catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
