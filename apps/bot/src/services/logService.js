import { EmbedBuilder } from 'discord.js';

export function createLogService(prisma,logger){
  async function logToChannel(guild,title,description,event=null){
    try{
      if(!guild?.id)return;
      const [guildConfig,config]=await Promise.all([
        prisma.guild.findUnique({where:{id:guild.id},select:{logChannelId:true}}),
        prisma.logConfig.findUnique({where:{guildId:guild.id}})
      ]);
      if(event&&config?.events?.length&&!config.events.includes(event))return;
      const channelId=config?.channelId||guildConfig?.logChannelId;
      const channel=channelId?guild.channels.cache.get(channelId)||await guild.channels.fetch(channelId).catch(()=>null):null;
      if(channel?.isTextBased())await channel.send({embeds:[new EmbedBuilder().setTitle(title).setDescription(String(description??'').slice(0,4096)).setColor(0x5865F2).setTimestamp()]});
    }catch(e){logger?.warn?.('Log failed',{error:e.message})}
  }
  return {logToChannel};
}