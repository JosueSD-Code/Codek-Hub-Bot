import { prisma } from '../../../packages/shared/src/index.js';

export async function recordModeration({guildId,targetId,moderatorId,action,reason=null,duration=null,expiresAt=null}){
  return prisma.moderationAction.create({data:{guildId,targetId,moderatorId,action,reason,duration,expiresAt}});
}

export async function history(guildId,targetId,limit=20){
  return prisma.moderationAction.findMany({
    where:{guildId,targetId},
    orderBy:{createdAt:'desc'},
    take:Math.min(Math.max(limit,1),100)
  });
}

export function parseDuration(value){
  const raw=String(value??'').trim().toLowerCase();
  const match=raw.match(/^(\\d+)\\s*(s|m|h|d|w)$/);
  if(!match)return null;
  const amount=Number(match[1]);
  const units={s:1000,m:60000,h:3600000,d:86400000,w:604800000};
  const ms=amount*units[match[2]];
  if(!Number.isFinite(ms)||ms<=0)return null;
  return {ms,seconds:Math.floor(ms/1000)};
}
