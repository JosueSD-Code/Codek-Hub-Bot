import { prisma } from '../../../../packages/shared/src/index.js';

export async function create({guildId,channelId,messageId,prize,winners,endsAt,createdBy}){
  return prisma.giveaway.create({data:{guildId,channelId,messageId,prize,winners,endsAt,createdBy,participants:[],winnerIds:[]}});
}

export async function toggleParticipant(id,userId){
  const row=await prisma.giveaway.findUnique({where:{id}});
  if(!row||row.ended)return null;
  const participants=new Set(row.participants||[]);
  if(participants.has(userId))participants.delete(userId);else participants.add(userId);
  return prisma.giveaway.update({where:{id},data:{participants:[...participants]}});
}

export function choose(row){
  const pool=[...(row.participants||[])];
  const winners=[];
  while(pool.length&&winners.length<row.winners)winners.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  return winners;
}

export async function end(row){
  const winnerIds=choose(row);
  return prisma.giveaway.update({where:{id:row.id},data:{ended:true,winnerIds}});
}

export async function cancel(row){
  return prisma.giveaway.update({where:{id:row.id},data:{ended:true,winnerIds:[]}});
}
