export function renderVariables(template, context = {}) {
  if (!template || typeof template !== 'string') {
    return '';
  }

  const values = {
    user: context.user || 'user',
    user_id: context.userId || '0',
    username: context.username || 'user',
    display_name: context.displayName || context.username || 'user',
    user_tag: context.userTag || context.username || 'user',
    user_avatar: context.userAvatar || '',
    guild: context.guild || 'server',
    guild_id: context.guildId || '0',
    guild_name: context.guildName || 'server',
    member_count: context.memberCount || '0',
    guild_count: context.guildCount || '0',
    ticket_id: context.ticketId || '0',
    ticket_category: context.ticketCategory || 'general',
    ticket_user: context.ticketUser || 'user',
    ticket_staff: context.ticketStaff || 'staff',
    date: context.date || new Date().toISOString().slice(0, 10),
    time: context.time || new Date().toLocaleTimeString(),
    timestamp: String(Date.now()),
  };

  return template.replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_, key) => {
    const normalized = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(values, normalized) ? String(values[normalized]) : `{${key}}`;
  });
}

export function buildPlaceholderCatalog() {
  return [
    { key: 'user', description: 'Member username' },
    { key: 'user_id', description: 'Discord user ID' },
    { key: 'username', description: 'User handle' },
    { key: 'display_name', description: 'Server-display name' },
    { key: 'guild', description: 'Guild name' },
    { key: 'guild_id', description: 'Guild ID' },
    { key: 'guild_name', description: 'Guild name' },
    { key: 'member_count', description: 'Member count' },
    { key: 'ticket_id', description: 'Ticket ID' },
    { key: 'date', description: 'Current date' },
    { key: 'time', description: 'Current time' },
    { key: 'timestamp', description: 'Unix timestamp' },
  ];
}
