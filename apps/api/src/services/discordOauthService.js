import { loadEnvironment } from '../../../../packages/shared/src/index.js';
import { buildDiscordOAuthUrl } from '../../../../packages/shared/src/discord.js';

const env = loadEnvironment();

export async function fetchBotGuilds() {
  try {
    const response = await fetch(`${env.botApiUrl || 'http://localhost:3011'}/api/bot/guilds`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

export async function filterGuildsForBotAndAdmin(guilds = []) {
  const botGuilds = await fetchBotGuilds();
  const botGuildIds = new Set(botGuilds.map((guild) => String(guild.id)));

  return guilds.filter((guild) => {
    if (!botGuildIds.has(String(guild.id))) {
      return false;
    }

    const permissions = Number(guild.permissions ?? 0);
    return Boolean(guild.owner) || Boolean((permissions & 0x8) || (permissions & 0x20));
  });
}

export function getDiscordAuthUrl(state = null) {
  return buildDiscordOAuthUrl({
    clientId: env.discordClientId,
    redirectUri: env.discordRedirectUri,
    scopes: ['identify', 'guilds'],
    state,
  });
}

export async function exchangeCodeForToken(code) {
  if (!code || !env.discordClientId || !env.discordClientSecret || !env.discordRedirectUri) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: env.discordClientId,
    client_secret: env.discordClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.discordRedirectUri,
  });

  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export async function fetchDiscordUser(accessToken) {
  if (!accessToken) {
    return null;
  }

  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export async function fetchUserGuilds(accessToken) {
  if (!accessToken) {
    return [];
  }

  const response = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return [];
  }

  const guilds = await response.json();
  return Array.isArray(guilds) ? guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    owner: Boolean(guild.owner),
    permissions: Number(guild.permissions ?? 0),
    iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
  })) : [];
}
