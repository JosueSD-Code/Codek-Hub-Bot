import { ChannelType } from 'discord.js';
import { prisma } from '../../../../packages/shared/src/index.js';

export async function findTicket(guildId,identifier){
  const value=String(identifier??'').trim();
  if(!value)return null;
  return prisma.ticket.findFirst({
    where:{guildId,OR:[{id:value},{channelId:value},{number:Number.isInteger(Number(value))?Number(value):-1}]},
    include:{category:true,transcript:true}
  });
}

export async function claim(ticket,userId){
  const updated=await prisma.ticket.updateMany({where:{id:ticket.id,status:'open'},data:{claimedById:userId,claimedAt:new Date()}});
  if(!updated.count)throw new Error('El ticket ya está cerrado.');
  await prisma.ticketClaim.create({data:{ticketId:ticket.id,userId}});
  return {message:'Ticket reclamado correctamente.',ticket:{...ticket,claimedById:userId}};
}

export async function release(ticket){
  await prisma.ticket.update({where:{id:ticket.id},data:{claimedById:null}});
  return {message:'Ticket liberado correctamente.'};
}

export async function addUser(channel,userId){
  await channel.permissionOverwrites.edit(userId,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true});
}

export async function removeUser(channel,userId){
  await channel.permissionOverwrites.delete(userId);
}

export async function rename(channel,name){
  return channel.setName(String(name).trim().slice(0,95));
}

export async function move(channel,categoryId){
  return channel.setParent(categoryId,{lockPermissions:false});
}

export async function stats(guildId){
  const [open,closed,claims,categories]=await Promise.all([
    prisma.ticket.count({where:{guildId,status:'open'}}),
    prisma.ticket.count({where:{guildId,status:'closed'}}),
    prisma.ticketClaim.count({where:{ticket:{guildId}}}),
    prisma.ticketCategory.findMany({where:{panel:{guildId}},select:{id:true,name:true,_count:{select:{tickets:true}}}})
  ]);
  return {open,closed,claims,categories};
}
