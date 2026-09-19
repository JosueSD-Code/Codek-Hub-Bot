import { loadEnvironment, logger } from '../../../../packages/shared/src/index.js';

const env = loadEnvironment();
const presenceCache = new Map();

function normalizeUser(raw = {}) {
  return {
    id: raw.id || null,
    username: raw.username || null,
    globalName: raw.global_name || null,
    displayName: raw.global_name || raw.username || null,
    avatar: raw.avatar || null,
    avatarUrl: raw.avatar ? `https://cdn.discordapp.com/avatars/${raw.id}/${raw.avatar}.png` : null,
    banner: raw.banner || null,
    accentColor: raw.accent_color ?? null,
    avatarDecoration: raw.avatar_decoration_data ?? null,
    premiumType: raw.premium_type ?? null,
    flags: raw.flags ?? null,
    locale: raw.locale ?? null,
    verified: raw.verified ?? null,
  };
}

function normalizePresence(raw = {}) {
  return {
    userId: raw.userId || raw.user_id || null,
    guildId: raw.guildId || raw.guild_id || null,
    status: raw.status || null,
    activities: Array.isArray(raw.activities) ? raw.activities.map((activity) => ({
      name: activity.name || null,
      type: activity.type || null,
      state: activity.state || null,
      details: activity.details || null,
      createdAt: activity.created_at || null,
    })) : [],
    updatedAt: raw.updatedAt || raw.timestamp || null,
  };
}

function getCachedPresence(userId) {
  if (!userId) {
    return null;
  }

  const cached = presenceCache.get(String(userId));
  if (!cached) {
    return null;
  }

  return {
    userId: cached.userId ?? String(userId),
    guildId: cached.guildId ?? null,
    status: cached.status ?? null,
    activities: Array.isArray(cached.activities) ? cached.activities : [],
    updatedAt: cached.updatedAt ?? null,
  };
}

export async function getDiscordProfile(userId) {
  if (!userId) {
    return {
      user: { id: null },
      presence: { status: null, activities: [] },
      source: 'unavailable',
      note: 'No Discord user id was supplied.',
    };
  }

  if (!env.discordToken) {
    return {
      user: {
        id: userId,
        username: null,
        globalName: null,
        displayName: null,
        avatar: null,
        avatarUrl: null,
        banner: null,
        accentColor: null,
        avatarDecoration: null,
      },
      presence: getCachedPresence(userId) ?? { status: null, activities: [] },
      source: 'unavailable',
      note: 'Discord token not configured. Presence is unavailable until the gateway provides a live update.',
    };
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: {
        Authorization: `Bot ${env.discordToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        user: { id: userId },
        presence: getCachedPresence(userId) ?? { status: null, activities: [] },
        source: 'discord',
        note: `Discord API returned status ${response.status}. Presence remains unavailable unless the gateway has pushed a live update.`,
      };
    }

    const user = await response.json();
    return {
      user: normalizeUser(user),
      presence: getCachedPresence(userId) ?? { status: null, activities: [] },
      source: 'discord',
      note: 'Profile data is provided by Discord. Presence and activities are only available when the bot receives an official Gateway PresenceUpdate event.',
    };
  } catch (error) {
    logger.error('Unable to fetch Discord profile', { error: error.message, userId });
    return {
      user: { id: userId },
      presence: getCachedPresence(userId) ?? { status: null, activities: [] },
      source: 'fallback',
      note: 'Unable to fetch live profile from Discord. Presence is only available via the gateway cache.',
    };
  }
}

export async function getDiscordPresence(userId) {
  const cached = getCachedPresence(userId);
  if (cached) {
    return {
      userId: cached.userId ?? userId,
      guildId: cached.guildId ?? null,
      ...cached,
      source: 'gateway',
      note: 'Presence data was received from the official Discord Gateway PresenceUpdate payload handled by the bot.',
    };
  }

  if (!env.discordToken) {
    return {
      status: null,
      activities: [],
      source: 'unavailable',
      note: 'Discord token missing. Presence is unavailable until the bot receives a live Gateway update.',
    };
  }

  return {
    userId: userId ?? null,
    guildId: null,
    status: null,
    activities: [],
    source: 'unavailable',
    note: 'No live PresenceUpdate event has been received yet for this user. Discord REST does not provide this data through an appropriate official presence endpoint for arbitrary user lookups.',
  };
}

export function snapshotPresence(payload = {}) {
  const normalized = normalizePresence(payload);

  if (normalized.userId) {
    presenceCache.set(String(normalized.userId), normalized);
  }

  return normalized;
}
