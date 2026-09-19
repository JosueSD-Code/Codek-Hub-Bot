export function buildDiscordOAuthUrl({ clientId, redirectUri, scopes = ['identify', 'guilds'], state = null }) {
  if (!clientId || !redirectUri) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    prompt: 'consent',
  });

  if (state) {
    params.set('state', state);
  }

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export function toPermissionArray(permissions = 0) {
  return {
    canManageGuild: (permissions & 0x20) === 0x20,
    isGuildOwner: (permissions & 0x8) === 0x8,
  };
}

export function normalizeGuild(rawGuild = {}) {
  return {
    id: rawGuild.id ?? null,
    name: rawGuild.name ?? null,
    icon: rawGuild.icon ?? null,
    owner: Boolean(rawGuild.owner),
    permissions: rawGuild.permissions ?? 0,
    permissionsBitfield: rawGuild.permissions ?? 0,
    iconUrl: rawGuild.icon ? `https://cdn.discordapp.com/icons/${rawGuild.id}/${rawGuild.icon}.png` : null,
  };
}
