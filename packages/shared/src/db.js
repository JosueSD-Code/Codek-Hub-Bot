import {PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const key='__codekHubPrisma';
export const prisma=globalThis[key]??new PrismaClient();
if(process.env.NODE_ENV!=='production')globalThis[key]=prisma;

export async function ensureGuild(g){
  if(!g?.id)return null;
  return prisma.guild.upsert({
    where:{id:g.id},
    update:{name:g.name??null,icon:g.icon??null,ownerId:g.ownerId??null},
    create:{id:g.id,name:g.name??null,icon:g.icon??null,ownerId:g.ownerId??null}
  });
}

export async function getGuild(id){
  if(!id)return null;
  return prisma.guild.findUnique({
    where:{id},
    include:{
      welcomeConfig:true,
      vouchConfig:true,
      presenceConfig:true,
      panels:{include:{categories:{include:{questions:true}}}}
    }
  });
}

export async function findAutoResponder(content,guildId){
  const text=String(content??'').trim().toLowerCase();
  if(!text||!guildId)return null;
  const rows=await prisma.autoResponder.findMany({
    where:{guildId,enabled:true},
    orderBy:{createdAt:'asc'},
    take:500
  });
  return rows.find(row=>{
    const trigger=String(row.trigger??'').trim().toLowerCase();
    if(!trigger)return false;
    return row.matchType==='exact'?text===trigger:text.includes(trigger);
  })??null;
}

export async function audit(guildId,userId,module,action,details){
  if(!guildId)return null;
  try{
    await prisma.guild.upsert({
      where:{id:guildId},
      update:{},
      create:{id:guildId}
    });
    return await prisma.auditLog.create({
      data:{
        guild:{connect:{id:guildId}},
        userId:userId??'unknown',
        module:module??'system',
        action:action??'unknown',
        details:details??null
      }
    });
  }catch(error){
    logger.warn('Audit log write failed',{
      guildId,
      module:module??'system',
      action:action??'unknown',
      error:error.message
    });
    return null;
  }
}
