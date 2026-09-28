import { Events, EmbedBuilder } from 'discord.js';
export function register(client,{logToChannel,prisma,renderVariables,context,clip,color,safeUrl,audit}){
  client.on(Events.GuildMemberAdd,async member=>{
    await logToChannel(member.guild,'📥 Usuario entró','Usuario: '+member.user.toString()+'\nID: '+member.id,'MEMBER_JOIN');
    try{
      const config=await prisma.welcomeConfig.findUnique({where:{guildId:member.guild.id}});
      if(!config?.enabled||!config.channelId)return;
      const channel=member.guild.channels.cache.get(config.channelId);
      if(!channel?.isTextBased())return;
      const x=context(member.user,member.guild,channel);
      const embed=new EmbedBuilder()
        .setTitle(clip(renderVariables(config.title||'¡Bienvenido!',x),256))
        .setDescription(clip(renderVariables(config.description||'',x),4096))
        .setColor(color(config.color))
        .setTimestamp();
      const image=safeUrl(renderVariables(config.image||'',x));
      const thumbnail=safeUrl(renderVariables(config.thumbnail||'',x));
      if(image)embed.setImage(image);
      if(thumbnail)embed.setThumbnail(thumbnail);
      if(config.footer)embed.setFooter({text:clip(renderVariables(config.footer,x),2048)});
      await channel.send({content:clip(renderVariables(config.message||'¡Bienvenido {user} a {server}!',x),2000),embeds:[embed]});
      await audit(member.guild.id,member.id,'welcome','sent',channel.name);
    }catch(e){client.emit('error',e)}
  });
}