import { prisma } from '../../../../packages/shared/src/index.js';

export async function create({guildId,channelId,messageId,prize,winners,endsAt,createdBy}){
  return prisma.giveaway.create({data:{guildId,channelId,messageId,prize,winners,endsAt,createdBy,participants:[],winnerIds:[]}});
}

async function withGiveawayLock(id,work){
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'codek:giveaway:'+id}))`;
    return work(tx);
  });
}

export async function toggleParticipant(id,userId){
  return withGiveawayLock(id,async tx=>{
    const row=await tx.giveaway.findUnique({where:{id}});
    if(!row||row.ended)return null;
    const participants=new Set(row.participants||[]);
    if(participants.has(userId))participants.delete(userId);else participants.add(userId);
    return tx.giveaway.update({where:{id},data:{participants:[...participants]}});
  });
}

export function choose(row){
  const pool=[...(row.participants||[])];
  const winners=[];
  while(pool.length&&winners.length<row.winners)winners.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  return winners;
}

export async function end(row){
  return withGiveawayLock(row.id,async tx=>{
    const current=await tx.giveaway.findUnique({where:{id:row.id}});
    if(!current||current.ended)return null;
    const winnerIds=choose(current);
    return tx.giveaway.update({where:{id:current.id},data:{ended:true,winnerIds}});
  });
}

export async function cancel(row){
  return withGiveawayLock(row.id,async tx=>{
    const current=await tx.giveaway.findUnique({where:{id:row.id}});
    if(!current||current.ended)return null;
    return tx.giveaway.update({where:{id:current.id},data:{ended:true,winnerIds:[]}});
  });
}

export async function reroll(row){
  return withGiveawayLock(row.id,async tx=>{
    const current=await tx.giveaway.findUnique({where:{id:row.id}});
    if(!current||!current.ended)return null;
    const winnerIds=choose(current);
    return tx.giveaway.update({where:{id:current.id},data:{winnerIds}});
  });
}
