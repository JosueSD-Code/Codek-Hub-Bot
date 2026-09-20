import {PrismaClient} from '@prisma/client';

const key='__codekHubPrisma';
export const prisma=globalThis[key]??new PrismaClient();
if(process.env.NODE_ENV!=='production')globalThis[key]=prisma;

export async function ensureGuild(g){
  if(!g)return null;
  return prisma.guild.upsert({
    where:{id:g.id},
    update:{name:g.name,icon:g.icon,ownerId:g.ownerId},
    create:{id:g.id,name:g.name,icon:g.icon,ownerId:g.ownerId}
  });
}

export async function getGuild(id){
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
    take:100
  });

  return rows.find(row=>{
    const trigger=row.trigger.trim().toLowerCase();
    if(!trigger)return false;
    return row.matchType==='exact'
      ?text===trigger
      :text.includes(trigger);
  })??null;
}

export async function audit(guildId,userId,module,action,details){
  if(!guildId)return null;

  await prisma.guild.upsert({
    where:{id:guildId},
    update:{},
    create:{id:guildId}
  }).catch(()=>{});

  return prisma.auditLog.create({
    data:{
      guild:{connect:{id:guildId}},
      userId:userId??'unknown',
      module,
      action,
      details:details??null
    }
  });
}
