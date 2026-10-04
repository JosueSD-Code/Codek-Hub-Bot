import { Events } from 'discord.js';

export function register(client,{logToChannel,prisma,renderVariables,context,clip,logger}){
  client.on(Events.GuildMemberRemove,async member=>{
    try{
      await logToChannel(
        member.guild,
        '📤 Usuario salió',
        'Usuario: '+(member.user?.toString()||member.id)+'\nID: '+member.id,
        'MEMBER_LEAVE'
      );

      const config=await prisma.welcomeConfig.findUnique({
        where:{guildId:member.guild.id}
      });
      if(!config?.enabled||!config.goodbyeEnabled||!config.goodbyeMessage)return;

      const channel=config.goodbyeChannelId
        ?member.guild.channels.cache.get(config.goodbyeChannelId)
        :null;
      if(!channel?.isTextBased())return;

      const content=clip(
        renderVariables(config.goodbyeMessage,context(member.user,member.guild,channel)),
        2000
      );
      if(content)await channel.send({content});
    }catch(e){
      logger?.warn?.('Goodbye processing failed',{error:e.message,stack:e.stack});
    }
  });
}
