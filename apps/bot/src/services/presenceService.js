import { ActivityType } from 'discord.js';
export function createPresenceService(client,prisma){
  return async function presence(){
    const p=await prisma.presenceConfig.findFirst({where:{enabled:true},orderBy:{updatedAt:'desc'}});
    if(!p||!client.user)return client.user?.setPresence({activities:[],status:'online'});
    const types={Playing:ActivityType.Playing,Watching:ActivityType.Watching,Listening:ActivityType.Listening};
    return client.user.setPresence({activities:[{name:p.text,type:types[p.type]??ActivityType.Watching}],status:'online'});
  };
}