export function userCanManageGuild(member, guild) {
  if (!member || !guild) {
    return false;
  }

  if (member.id === guild.ownerId) {
    return true;
  }

  const roles = new Set((member.roles || []).map((role) => role.id));
  const adminRoleIds = guild.adminRoleIds || [];
  const modRoleIds = guild.modRoleIds || [];

  return adminRoleIds.some((roleId) => roles.has(roleId)) || modRoleIds.some((roleId) => roles.has(roleId));
}
