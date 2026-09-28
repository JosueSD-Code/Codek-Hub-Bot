import { Events } from 'discord.js';

export function registerRuntimeEvents(client,{prisma,processAutoMod,endGiveaway,logToChannel,renderVariables,context,clip,configureDiscordLogger,sendConsoleLog}){
  const originalConsole={log:console.log,warn:console.warn,error:console.error};
  function installConsoleBridge(){
  configureDiscordLogger(client,async()=>{
    const rows=await prisma.guild.findMany({where:{logChannelId:{not:null}},select:{logChannelId:true},take:1});
    return rows[0]?.logChannelId||null;
  });
  for(const level of ['log','warn','error']){
    console[level]=(...args)=>{
      originalConsole[level](...args);
      void sendConsoleLog(level==='log'?'info':level,args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));
    };
  }
}

  async function processDueGiveaways(){
  const rows=await prisma.giveaway.findMany({where:{ended:false,endsAt:{lte:new Date()}}});
  for(const row of rows){
    try{
      const result=await endGiveaway(row);
      const channel=client.channels.cache.get(row.channelId);
      if(channel?.isTextBased()){
        await channel.send('🎉 Sorteo finalizado: **'+row.prize+'**\nGanadores: '+(result.winnerIds?.map(id=>'<@'+id+'>').join(', ')||'No hubo ganadores.'));
      }
    }catch(e){originalConsole.error('Giveaway finalization failed',e)}
  }
}

  setInterval(()=>{void processDueGiveaways()},15000);

  client.on(Events.MessageCreate,async message=>{
  try{const rule=await processAutoMod(message);if(rule)await logToChannel(message.guild,'🤖 AutoMod','Usuario: '+message.author.toString()+'\nRegla: '+rule.type+'\nAcción: '+rule.action)}catch(e){originalConsole.error('AutoMod failed',e)}
});

  client.on(Events.MessageDelete,async message=>{
  if(!message.guild)return;
  await logToChannel(message.guild,'🗑️ Mensaje eliminado','Autor: '+(message.author?.toString()||'desconocido')+'\nCanal: '+message.channel?.toString()+'\nContenido: '+clip(message.content||'[no disponible]',3500));
});

  client.on(Events.MessageUpdate,async(oldMessage,newMessage)=>{
  if(!newMessage.guild||oldMessage.content===newMessage.content)return;
  await logToChannel(newMessage.guild,'✏️ Mensaje editado','Autor: '+(newMessage.author?.toString()||'desconocido')+'\nCanal: '+newMessage.channel?.toString()+'\nAntes: '+clip(oldMessage.content||'[vacío]',1500)+'\nDespués: '+clip(newMessage.content||'[vacío]',1500));
});

  client.on(Events.ChannelCreate,async channel=>{
  if(channel.guild)await logToChannel(channel.guild,'📁 Canal creado','Canal: '+channel.toString()+'\nNombre: '+channel.name);
});

  client.on(Events.ChannelDelete,async channel=>{
  if(channel.guild)await logToChannel(channel.guild,'🗑️ Canal eliminado','Nombre: '+channel.name+'\nID: '+channel.id);
});
  client.on(Events.ChannelUpdate,async(oldChannel,newChannel)=>{
  if(newChannel.guild)await logToChannel(newChannel.guild,'✏️ Canal actualizado','Canal: '+newChannel.toString()+'\nNombre anterior: '+oldChannel.name+'\nNombre nuevo: '+newChannel.name);
});

  client.on(Events.RoleCreate,async role=>{
  await logToChannel(role.guild,'🎭 Rol creado','Rol: '+role.toString()+'\nID: '+role.id);
});

  client.on(Events.RoleDelete,async role=>{
  await logToChannel(role.guild,'🗑️ Rol eliminado','Nombre: '+role.name+'\nID: '+role.id);
});

  client.on(Events.GuildMemberAdd,async member=>{
  await logToChannel(member.guild,'📥 Usuario entró','Usuario: '+member.user.toString()+'\nID: '+member.id);
});

  client.on(Events.GuildMemberRemove,async member=>{
  await logToChannel(member.guild,'📤 Usuario salió','Usuario: '+member.user?.toString()+'\nID: '+member.id);
  const config=await prisma.welcomeConfig.findUnique({where:{guildId:member.guild.id}}).catch(()=>null);
  if(config?.enabled&&config.goodbyeEnabled&&config.goodbyeMessage){
    const channel=config.goodbyeChannelId?member.guild.channels.cache.get(config.goodbyeChannelId):null;
    if(channel?.isTextBased())await channel.send({content:renderVariables(config.goodbyeMessage,context(member.user,member.guild,channel))}).catch(()=>{});
  }
});

  client.on(Events.GuildMemberUpdate,async(oldMember,newMember)=>{
  const changes=[];
  if(oldMember.nickname!==newMember.nickname)changes.push('Nickname: '+(oldMember.nickname||'ninguno')+' → '+(newMember.nickname||'ninguno'));
  if(changes.length)await logToChannel(newMember.guild,'👤 Miembro actualizado','Usuario: '+newMember.user.toString()+'\n'+changes.join('\n'));
});

  client.on(Events.GuildBanAdd,async ban=>{
  await logToChannel(ban.guild,'🔨 Usuario baneado','Usuario: '+ban.user.toString()+'\nID: '+ban.user.id);
});

  client.on(Events.GuildBanRemove,async ban=>{
  await logToChannel(ban.guild,'🔓 Usuario desbaneado','Usuario: '+ban.user.toString()+'\nID: '+ban.user.id);
});


}


