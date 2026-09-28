import { Events } from 'discord.js';

export function register(client,{prisma,endGiveaway,configureDiscordLogger,sendConsoleLog,logger,ensureGuild,deploy,presence,logToChannel}){
  const originalConsole={log:console.log,warn:console.warn,error:console.error};
  configureDiscordLogger(client,async()=>{
    const rows=await prisma.guild.findMany({where:{logChannelId:{not:null}},select:{logChannelId:true}});
    return rows.map(row=>row.logChannelId);
  });

  for(const level of ['log','warn','error']){
    console[level]=(...args)=>{
      originalConsole[level](...args);
      void sendConsoleLog(level==='log'?'info':level,args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));
    };
  }

  async function processExpiredModeration(){
    const rows=await prisma.moderationAction.findMany({where:{action:'automod_ban',expiresAt:{lte:new Date()}},take:100});
    for(const row of rows){
      const guild=client.guilds.cache.get(row.guildId);
      if(!guild)continue;
      try{
        await guild.members.unban(row.targetId,'AutoMod ban temporal expirado');
        await prisma.moderationAction.update({where:{id:row.id},data:{action:'automod_ban_expired'}});
        await logToChannel?.(guild,'🔓 AutoMod','Ban temporal expirado para <@'+row.targetId+'>.','MODERATION');
      }catch(e){
        if(e?.code===10026)await prisma.moderationAction.update({where:{id:row.id},data:{action:'automod_ban_expired'}});
      }
    }
  }

  setInterval(()=>{void processExpiredModeration()},30000).unref?.();

  async function processDueGiveaways(){
    const rows=await prisma.giveaway.findMany({where:{ended:false,endsAt:{lte:new Date()}}});
    for(const row of rows){
      try{
        const result=await endGiveaway(row);
        if(!result)continue;
        const channel=client.channels.cache.get(row.channelId);
        if(channel?.isTextBased())await channel.send('🎉 Sorteo finalizado: **'+row.prize+'**\nGanadores: '+(result.winnerIds?.map(id=>'<@'+id+'>').join(', ')||'No hubo ganadores.'));
      }catch(e){originalConsole.error('Giveaway finalization failed',e)}
    }
  }

  setInterval(()=>{void processDueGiveaways()},15000).unref?.();

  client.once(Events.ClientReady,async c=>{
    try{
      await prisma.$queryRaw`SELECT 1`;
      for(const guild of c.guilds.cache.values())await ensureGuild(guild);
      await deploy();
      await presence();
      await processDueGiveaways();
      logger.info('Codek Hub conectado',{user:c.user.tag,guilds:c.guilds.cache.size});
    }catch(e){logger.error('Startup failed',{error:e.message,stack:e.stack});process.exitCode=1;try{await prisma.$disconnect()}catch{} }
  });
}