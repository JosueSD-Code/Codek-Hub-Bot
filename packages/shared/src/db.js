import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__codekPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__codekPrisma = prisma;
}

export async function ensureGuildRecord(guild) {
  if (!guild || !guild.id) {
    return null;
  }

  try {
    return await prisma.guild.upsert({
      where: { id: String(guild.id) },
      update: {
        name: guild.name ?? undefined,
        icon: guild.icon ?? undefined,
        ownerId: guild.ownerId ?? undefined,
      },
      create: {
        id: String(guild.id),
        name: guild.name ?? null,
        icon: guild.icon ?? null,
        ownerId: guild.ownerId ?? null,
      },
    });
  } catch (error) {
    return null;
  }
}

export async function getGuildCounts() {
  try {
    const [guildCount, ticketCount] = await Promise.all([
      prisma.guild.count(),
      prisma.ticket.count(),
    ]);

    return { guildCount, ticketCount };
  } catch (error) {
    return { guildCount: 0, ticketCount: 0 };
  }
}

export async function getGuildRows() {
  try {
    return await prisma.guild.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        ownerId: true,
        icon: true,
        createdAt: true,
      },
    });
  } catch (error) {
    return [];
  }
}

export async function getGuildConfigRows() {
  try {
    return await prisma.guildConfig.findMany({
      include: { guild: true },
    });
  } catch (error) {
    return [];
  }
}

export async function getOverviewRows() {
  try {
    const rows = await prisma.guild.findMany({
      select: {
        id: true,
        name: true,
        config: true,
      },
    });
    return rows;
  } catch (error) {
    return [];
  }
}

export async function getGuildModuleState(guildId) {
  if (!guildId) {
    return null;
  }

  try {
    const guild = await prisma.guild.findUnique({
      where: { id: String(guildId) },
      include: {
        config: true,
        welcomeConfig: true,
        vouchConfig: true,
        automodConfig: true,
        antispamConfig: true,
        antiraidConfig: true,
        logConfig: true,
      },
    });

    if (!guild) {
      return null;
    }

    return {
      id: guild.id,
      name: guild.name,
      config: {
        ticketsEnabled: guild.config?.ticketsEnabled ?? false,
        welcomeEnabled: guild.config?.welcomeEnabled ?? guild.welcomeConfig?.enabled ?? false,
        vouchEnabled: guild.config?.vouchEnabled ?? guild.vouchConfig?.enabled ?? false,
        richPresenceEnabled: guild.config?.richPresenceEnabled ?? false,
      },
      welcomeConfig: guild.welcomeConfig,
      vouchConfig: guild.vouchConfig,
      automodConfig: guild.automodConfig,
      antispamConfig: guild.antispamConfig,
      antiraidConfig: guild.antiraidConfig,
      logConfig: guild.logConfig,
    };
  } catch (error) {
    return null;
  }
}

export async function ensureGuildConfigRecord(guildId, data = {}) {
  if (!guildId) {
    return null;
  }

  const guildIdValue = String(guildId);

  try {
    return await prisma.guildConfig.upsert({
      where: { guildId: guildIdValue },
      update: {
        ticketsEnabled: data.ticketsEnabled ?? undefined,
        welcomeEnabled: data.welcomeEnabled ?? undefined,
        vouchEnabled: data.vouchEnabled ?? undefined,
        richPresenceEnabled: data.richPresenceEnabled ?? undefined,
      },
      create: {
        guildId: guildIdValue,
        ticketsEnabled: Boolean(data.ticketsEnabled),
        welcomeEnabled: Boolean(data.welcomeEnabled),
        vouchEnabled: Boolean(data.vouchEnabled),
        richPresenceEnabled: Boolean(data.richPresenceEnabled),
      },
    });
  } catch (error) {
    return null;
  }
}

export async function upsertWelcomeConfig(guildId, payload = {}) {
  if (!guildId) {
    return null;
  }

  try {
    await ensureGuildConfigRecord(guildId, { welcomeEnabled: Boolean(payload.enabled) });
    return await prisma.welcomeConfig.upsert({
      where: { guildId: String(guildId) },
      update: {
        enabled: Boolean(payload.enabled),
        channelId: payload.channelId ? String(payload.channelId) : null,
        title: payload.title ? String(payload.title) : null,
        description: payload.description ? String(payload.description) : null,
        color: payload.color ? String(payload.color) : null,
        thumbnail: payload.thumbnail ? String(payload.thumbnail) : null,
        image: payload.image ? String(payload.image) : null,
        message: payload.message ? String(payload.message) : null,
      },
      create: {
        guildId: String(guildId),
        enabled: Boolean(payload.enabled),
        channelId: payload.channelId ? String(payload.channelId) : null,
        title: payload.title ? String(payload.title) : null,
        description: payload.description ? String(payload.description) : null,
        color: payload.color ? String(payload.color) : null,
        thumbnail: payload.thumbnail ? String(payload.thumbnail) : null,
        image: payload.image ? String(payload.image) : null,
        message: payload.message ? String(payload.message) : null,
      },
    });
  } catch (error) {
    return null;
  }
}

export async function upsertVouchConfig(guildId, payload = {}) {
  if (!guildId) {
    return null;
  }

  try {
    await ensureGuildConfigRecord(guildId, { vouchEnabled: Boolean(payload.enabled) });
    return await prisma.vouchConfig.upsert({
      where: { guildId: String(guildId) },
      update: {
        enabled: Boolean(payload.enabled),
        channelId: payload.channelId ? String(payload.channelId) : null,
        cooldown: Number.isFinite(Number(payload.cooldown)) ? Number(payload.cooldown) : 60,
        allowedRoleIds: Array.isArray(payload.allowedRoleIds) ? payload.allowedRoleIds.map(String) : [],
      },
      create: {
        guildId: String(guildId),
        enabled: Boolean(payload.enabled),
        channelId: payload.channelId ? String(payload.channelId) : null,
        cooldown: Number.isFinite(Number(payload.cooldown)) ? Number(payload.cooldown) : 60,
        allowedRoleIds: Array.isArray(payload.allowedRoleIds) ? payload.allowedRoleIds.map(String) : [],
      },
    });
  } catch (error) {
    return null;
  }
}

export async function upsertLogConfig(guildId, payload = {}) {
  if (!guildId) {
    return null;
  }

  try {
    return await prisma.logConfig.upsert({
      where: { guildId: String(guildId) },
      update: {
        enabled: Boolean(payload.enabled),
        channelId: payload.channelId ? String(payload.channelId) : null,
      },
      create: {
        guildId: String(guildId),
        enabled: Boolean(payload.enabled),
        channelId: payload.channelId ? String(payload.channelId) : null,
      },
    });
  } catch (error) {
    return null;
  }
}

export async function upsertAutoModConfig(guildId, payload = {}) {
  if (!guildId) {
    return null;
  }

  try {
    return await prisma.autoModConfig.upsert({
      where: { guildId: String(guildId) },
      update: {
        enabled: Boolean(payload.enabled),
        bannedWords: Array.isArray(payload.bannedWords) ? payload.bannedWords.map(String) : [],
        maxMentions: Number.isFinite(Number(payload.maxMentions)) ? Number(payload.maxMentions) : null,
      },
      create: {
        guildId: String(guildId),
        enabled: Boolean(payload.enabled),
        bannedWords: Array.isArray(payload.bannedWords) ? payload.bannedWords.map(String) : [],
        maxMentions: Number.isFinite(Number(payload.maxMentions)) ? Number(payload.maxMentions) : null,
      },
    });
  } catch (error) {
    return null;
  }
}

export async function upsertAntiSpamConfig(guildId, payload = {}) {
  if (!guildId) {
    return null;
  }

  try {
    return await prisma.antiSpamConfig.upsert({
      where: { guildId: String(guildId) },
      update: {
        enabled: Boolean(payload.enabled),
        maxMessages: Number.isFinite(Number(payload.maxMessages)) ? Number(payload.maxMessages) : 5,
        timeframe: Number.isFinite(Number(payload.timeframe)) ? Number(payload.timeframe) : 10,
      },
      create: {
        guildId: String(guildId),
        enabled: Boolean(payload.enabled),
        maxMessages: Number.isFinite(Number(payload.maxMessages)) ? Number(payload.maxMessages) : 5,
        timeframe: Number.isFinite(Number(payload.timeframe)) ? Number(payload.timeframe) : 10,
      },
    });
  } catch (error) {
    return null;
  }
}

export async function upsertAntiRaidConfig(guildId, payload = {}) {
  if (!guildId) {
    return null;
  }

  try {
    return await prisma.antiRaidConfig.upsert({
      where: { guildId: String(guildId) },
      update: {
        enabled: Boolean(payload.enabled),
        threshold: Number.isFinite(Number(payload.threshold)) ? Number(payload.threshold) : 8,
        interval: Number.isFinite(Number(payload.interval)) ? Number(payload.interval) : 60,
      },
      create: {
        guildId: String(guildId),
        enabled: Boolean(payload.enabled),
        threshold: Number.isFinite(Number(payload.threshold)) ? Number(payload.threshold) : 8,
        interval: Number.isFinite(Number(payload.interval)) ? Number(payload.interval) : 60,
      },
    });
  } catch (error) {
    return null;
  }
}

export async function addGuildAuditLog(guildId, moduleName, action, previousValue = null, newValue = null, userId = null) {
  if (!guildId) {
    return null;
  }

  try {
    return await prisma.auditLog.create({
      data: {
        guildId: String(guildId),
        userId: userId ? String(userId) : 'system',
        module: String(moduleName),
        action: String(action),
        previousValue: previousValue === null || previousValue === undefined ? null : String(previousValue),
        newValue: newValue === null || newValue === undefined ? null : String(newValue),
      },
    });
  } catch (error) {
    return null;
  }
}

export async function listGuildAuditLogs(guildId) {
  if (!guildId) {
    return [];
  }

  try {
    return await prisma.auditLog.findMany({
      where: { guildId: String(guildId) },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  } catch (error) {
    return [];
  }
}

export async function listTicketPanelsForGuild(guildId) {
  if (!guildId) {
    return [];
  }

  try {
    return await prisma.ticketPanel.findMany({
      where: { guildId: String(guildId) },
      include: { categories: true },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    return [];
  }
}

export async function createTicketPanelForGuild(guildId, data = {}) {
  if (!guildId || !data.name) {
    return null;
  }

  try {
    return await prisma.ticketPanel.create({
      data: {
        guildId: String(guildId),
        name: String(data.name),
        channelId: String(data.channelId || 'tickets'),
        description: data.description ? String(data.description) : null,
        active: data.active !== false,
      },
      include: { categories: true },
    });
  } catch (error) {
    return null;
  }
}

export async function listTicketsForGuild(guildId) {
  if (!guildId) {
    return [];
  }

  try {
    return await prisma.ticket.findMany({
      where: { guildId: String(guildId) },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    return [];
  }
}

export async function createTicketForGuild(guildId, data = {}) {
  if (!guildId || !data.userId || !data.category) {
    return null;
  }

  try {
    return await prisma.ticket.create({
      data: {
        guildId: String(guildId),
        category: String(data.category),
        userId: String(data.userId),
        channelId: String(data.channelId || `ticket-${Date.now()}`),
        status: String(data.status || 'open'),
        priority: data.priority ? String(data.priority) : null,
      },
    });
  } catch (error) {
    return null;
  }
}

export async function claimTicketForGuild(ticketId, staffId) {
  if (!ticketId || !staffId) {
    return null;
  }

  try {
    return await prisma.ticketClaim.upsert({
      where: { ticketId: String(ticketId) },
      update: {
        staffId: String(staffId),
        active: true,
      },
      create: {
        ticketId: String(ticketId),
        staffId: String(staffId),
        active: true,
      },
    });
  } catch (error) {
    return null;
  }
}

export function findMatchingAutoResponder(content, responders = []) {
  const normalized = String(content ?? '').trim();
  if (!normalized) {
    return null;
  }

  return responders.find((responder) => {
    const trigger = String(responder.trigger ?? '').trim();
    if (!trigger) {
      return false;
    }

    if (trigger.toLowerCase() === normalized.toLowerCase()) {
      return true;
    }

    return normalized.toLowerCase().includes(trigger.toLowerCase());
  }) ?? null;
}

export async function listAutoRespondersForGuild(guildId) {
  if (!guildId) {
    return [];
  }

  try {
    return await prisma.autoResponder.findMany({
      where: { guildId: String(guildId), enabled: true },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    return [];
  }
}

export async function upsertAutoResponderForGuild(guildId, payload = {}) {
  if (!guildId || !payload.trigger || !payload.response) {
    return null;
  }

  try {
    if (payload.id) {
      return await prisma.autoResponder.upsert({
        where: { id: String(payload.id) },
        update: {
          trigger: String(payload.trigger),
          response: String(payload.response),
          enabled: payload.enabled !== false,
        },
        create: {
          guildId: String(guildId),
          trigger: String(payload.trigger),
          response: String(payload.response),
          enabled: payload.enabled !== false,
        },
      });
    }

    return await prisma.autoResponder.create({
      data: {
        guildId: String(guildId),
        trigger: String(payload.trigger),
        response: String(payload.response),
        enabled: payload.enabled !== false,
      },
    });
  } catch (error) {
    return null;
  }
}

export async function deleteAutoResponderById(id) {
  if (!id) {
    return false;
  }

  try {
    await prisma.autoResponder.delete({ where: { id: String(id) } });
    return true;
  } catch (error) {
    return false;
  }
}
