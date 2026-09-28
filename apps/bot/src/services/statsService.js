import { prisma } from '../../../../packages/shared/src/index.js';

export async function serverStats(guild){
  if(guild.memberCount&&guild.members.cache.size<guild.memberCount)await guild.members.fetch().catch(()=>null);
  const channels=[...guild.channels.cache.values()];
  const roles=[...guild.roles.cache.values()];
  return {
    members:guild.memberCount??guild.members.cache.size,
    humans:guild.members.cache.filter(m=>!m.user.bot).size,
    bots:guild.members.cache.filter(m=>m.user.bot).size,
    roles:roles.length,
    channels:channels.length,
    categories:channels.filter(c=>c.type===4).length,
    boosts:guild.premiumSubscriptionCount??0,
    boostLevel:guild.premiumTier??0,
    createdAt:guild.createdAt,
    ownerId:guild.ownerId
  };
}

export async function botStats(guildId){
  const [tickets,vouches,commands,moderation]=await Promise.all([
    prisma.ticket.count({where:{guildId:guildId}}),
    prisma.vouch.count({where:{guildId:guildId}}),
    prisma.auditLog.count({where:{guildId:guildId,module:'command'}}),
    prisma.moderationAction.count({where:{guildId:guildId}})
  ]);
  return {tickets,vouches,commands,moderation};
}
