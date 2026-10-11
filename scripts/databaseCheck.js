import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXPECTED_MIGRATIONS = [
  '0_init',
  '20261003192000_preserve_ticket_history',
  '20261004023000_sync_current_schema',
  '20261004030000_add_role_update_log_event',
  '20261004031000_backfill_role_update_log_event'
];

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
    console.warn('DATABASE_URL is not configured; skipping live database check.');
    return;
  }

  try {
    const url = new URL(process.env.DATABASE_URL);
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname) && process.env.CI !== 'true') {
      console.warn('DATABASE_URL points to localhost; GitHub Actions cannot reach a local database. Skipping live database check.');
      return;
    }
  } catch {
    throw new Error('DATABASE_URL is configured but is not a valid URL.');
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
  const migrationRows = migrationTable
    ? await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    : [];
  const appliedMigrations = new Set(migrationRows.map(row => row.migration_name));
  const missingMigrations = EXPECTED_MIGRATIONS.filter(name => !appliedMigrations.has(name));
  const logEventsInfo = await prisma.$queryRawUnsafe(
    'SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = \'LogConfig\' AND column_name = \'events\''
  );
  const roleUpdateEventRows = await prisma.$queryRaw`
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'LogEvent' AND e.enumlabel = 'ROLE_UPDATE' LIMIT 1
  `;

  const result = {
    ticketCategoryName,
    ticketCategoryIdNullable: ticketCategoryIdNullable[0]?.is_nullable === 'YES',
    logConfigEventsNotNull: logEventsInfo[0]?.is_nullable === 'NO',
    logConfigEventsHasDefault: Boolean(logEventsInfo[0]?.column_default),
    migrationTable,
    appliedMigrations: [...appliedMigrations].sort(),
    missingMigrations,
    roleUpdateEventExists: roleUpdateEventRows.length > 0,
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

  if (!logEventsInfo.length || !result.logConfigEventsNotNull || !result.logConfigEventsHasDefault) {
    throw new Error('LogConfig.events is not aligned with Prisma (NOT NULL/default required).');
  }

  if (!result.roleUpdateEventExists) {
    throw new Error('The LogEvent enum is missing ROLE_UPDATE.');
  }

  if (!migrationTable || missingMigrations.length) {
    throw new Error('Some project migrations are missing or not successfully applied: ' + (missingMigrations.join(', ') || '_prisma_migrations table'));
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
