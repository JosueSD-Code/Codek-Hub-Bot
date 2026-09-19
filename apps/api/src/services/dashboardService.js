import { getGuildCounts, getGuildRows, getGuildConfigRows, getOverviewRows } from '../../../../packages/shared/src/db.js';
import { buildPlaceholderCatalog } from '../../../../packages/shared/src/index.js';

export async function getOverviewPayload() {
  const { guildCount, ticketCount } = await getGuildCounts();
  const guilds = await getGuildRows();
  const configRows = await getGuildConfigRows();

  return {
    guildCount,
    ticketCount,
    guilds,
    moduleSummary: configRows.map((config) => ({
      guildId: config.guildId,
      guildName: config.guild?.name ?? 'Unknown guild',
      ticketsEnabled: config.ticketsEnabled,
      welcomeEnabled: config.welcomeEnabled,
      vouchEnabled: config.vouchEnabled,
    })),
    lastUpdated: new Date().toISOString(),
  };
}

export async function getModulePayload() {
  const rows = await getOverviewRows();
  return rows.map((guild) => ({
    id: guild.id,
    name: guild.name ?? 'Unknown guild',
    modules: guild.config ? Object.entries({
      tickets: guild.config.ticketsEnabled,
      welcome: guild.config.welcomeEnabled,
      vouch: guild.config.vouchEnabled,
      richPresence: guild.config.richPresenceEnabled,
    }).filter(([, enabled]) => enabled).map(([name]) => name) : [],
  }));
}

export function getVariablesPayload() {
  return buildPlaceholderCatalog().map((item) => ({
    key: item.key,
    description: item.description,
    example: `{${item.key}}`,
  }));
}
