import {
  ensureGuildRecord,
  listTicketPanelsForGuild,
  createTicketPanelForGuild,
  listTicketsForGuild,
  createTicketForGuild,
  claimTicketForGuild,
} from '../../../../packages/shared/src/db.js';

export async function fetchGuildTickets(guildId) {
  return listTicketsForGuild(guildId);
}

export async function createGuildTicket(guildId, payload = {}) {
  await ensureGuildRecord({
    id: guildId,
    name: payload.guildName || null,
    ownerId: payload.ownerId || null,
  });

  return createTicketForGuild(guildId, payload);
}

export async function fetchGuildTicketPanels(guildId) {
  return listTicketPanelsForGuild(guildId);
}

export async function createGuildTicketPanel(guildId, payload = {}) {
  await ensureGuildRecord({
    id: guildId,
    name: payload.guildName || null,
    ownerId: payload.ownerId || null,
  });

  return createTicketPanelForGuild(guildId, payload);
}

export async function claimTicket(ticketId, staffId) {
  return claimTicketForGuild(ticketId, staffId);
}
