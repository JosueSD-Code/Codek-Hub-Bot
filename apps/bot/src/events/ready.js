import { Events } from 'discord.js';

export function register(client,{prisma,endGiveaway,configureDiscordLogger,sendConsoleLog,logger,ensureGuild,deploy,presence,logToChannel}){
  const originalConsole={log:console.log,warn:console.warn,error:console.error};

  configureDiscordLogger(client,async()=>{
    try{
      const rows=await prisma.guild.findMany({
        where:{logChannelId:{not:null}},
        select:{logChannelId:true}
      });
      return rows.map(row=>row.logChannelId);
    }catch(e){
      originalConsole.error('Console log channel lookup failed',e);
      return [];
    }
  });

  for(const level of ['log','warn','error']){
    console[level]=(...args)=>{
      originalConsole[level](...args);
      void sendConsoleLog(
        level==='log'?'info':level,
        args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')
      ).catch(()=>{});
    };
  }

  async function processExpiredModeration(){
    const rows=await prisma.moderationAction.findMany({
      where:{action:'automod_ban',expiresAt:{not:null,lte:new Date()}},
      take:100,
      orderBy:{expiresAt:'asc'}
    });

    for(const row of rows){
      const guild=client.guilds.cache.get(row.guildId);
      if(!guild)continue;

      try{
        await guild.members.unban(row.targetId,'AutoMod ban temporal expirado');
        await prisma.moderationAction.update({
          where:{id:row.id},
          data:{action:'automod_ban_expired'}
        });
        await logToChannel?.(
          guild,
          '🔓 AutoMod',
          'Ban temporal expirado para <@'+row.targetId+'>.',
          'MODERATION'
        );
      }catch(e){
        if(e?.code===10026){
          await prisma.moderationAction.update({
            where:{id:row.id},
            data:{action:'automod_ban_expired'}
          });
        }else{
          logger.warn('Temporary AutoMod ban expiration failed',{
            guildId:row.guildId,
            targetId:row.targetId,
            error:e.message
          });
        }
      }
    }
  }

  const runExpiredModeration=()=>processExpiredModeration().catch(e=>{
    logger.error('Expired moderation processing failed',{error:e.message,stack:e.stack});
  });
  setInterval(runExpiredModeration,30000).unref?.();

  async function processDueGiveaways(){
    const rows=await prisma.giveaway.findMany({
      where:{ended:false,endsAt:{lte:new Date()}},
      orderBy:{endsAt:'asc'},
      take:100
    });

    for(const row of rows){
      try{
        const result=await endGiveaway(row);
        if(!result)continue;

        const channel=client.channels.cache.get(row.channelId);
        if(channel?.isTextBased()){
          await channel.send(
            '🎉 Sorteo finalizado: **'+row.prize+'**\nGanadores: '+
            (result.winnerIds?.map(id=>'<@'+id+'>').join(', ')||'No hubo ganadores.')
          );
        }
      }catch(e){
        logger.error('Giveaway finalization failed',{
          giveawayId:row.id,
          error:e.message,
          stack:e.stack
        });
      }
    }
  }

  const runDueGiveaways=()=>processDueGiveaways().catch(e=>{
    logger.error('Giveaway processing failed',{error:e.message,stack:e.stack});
  });
  setInterval(runDueGiveaways,15000).unref?.();

  client.once(Events.ClientReady,async c=>{
    try{
      await prisma.$queryRaw\`SELECT 1\`;
      for(const guild of c.guilds.cache.values())await ensureGuild(guild);
      await deploy();
      await presence();
      await processExpiredModeration();
      await processDueGiveaways();
      logger.info('Codek Hub conectado',{user:c.user.tag,guilds:c.guilds.cache.size});
    }catch(e){
      logger.error('Startup failed',{error:e.message,stack:e.stack});
      process.exitCode=1;
      try{await prisma.$disconnect()}catch{}
    }
  });
}
