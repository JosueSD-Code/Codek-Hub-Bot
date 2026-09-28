import { Events, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';

export function register(client,{prisma,processAutoMod,ADMIN,helpEmbed,findAutoResponder,renderVariables,context,clip,color,safeUrl,audit,purgeChannelMessages,purgeEverything,logger}){
  client.on(Events.MessageCreate,async m=>{
    if(m.author.bot||!m.guildId)return;
    try{
      const automod=await processAutoMod(m);
      if(automod)return;


  if(m.author.bot||!m.guildId)return;
  try{
    const botMentioned=client.user&&m.mentions.users.has(client.user.id);
    if(botMentioned){
      const mentionPattern=new RegExp('<@!?'+client.user.id+'>','g');
      const mentionText=m.content.replace(mentionPattern,' ').trim().toLowerCase();
      const helpRequested=/\b(?:help|ayuda|comandos|commands)\b/i.test(mentionText);

      if(helpRequested){
        return m.reply({embeds:[helpEmbed()]});
      }

      if(!m.member?.permissions?.has(ADMIN)){
        const guild=m.guild;
        const roles=[...guild.roles.cache.values()]
          .filter(r=>r.id!==guild.id)
          .sort((a,b)=>b.position-a.position)
          .slice(0,8);
        const channels=[...guild.channels.cache.values()]
          .filter(ch=>ch.type===ChannelType.GuildText||ch.type===ChannelType.GuildAnnouncement||ch.type===ChannelType.GuildVoice)
          .sort((a,b)=>a.rawPosition-b.rawPosition)
          .slice(0,8);
        const textChannels=channels.filter(ch=>ch.type===ChannelType.GuildText||ch.type===ChannelType.GuildAnnouncement).length;
        const voiceChannels=channels.filter(ch=>ch.type===ChannelType.GuildVoice).length;

        const infoEmbed=new EmbedBuilder()
          .setAuthor({name:'Codek Hub',iconURL:client.user.displayAvatarURL({size:256})})
          .setTitle(guild.name+' • Codek Hub')
          .setDescription('¡Hola! Soy **Codek Hub**, el bot de gestión y automatización de este servidor. Usa **@Codek Hub help** para ver mis comandos.')
          .setColor(0x5865F2)
          .setThumbnail(guild.iconURL({size:512})||client.user.displayAvatarURL({size:512}))
          .addFields(
            {name:'👥 Miembros',value:String(guild.memberCount??guild.members.cache.size),inline:true},
            {name:'🎭 Roles',value:String(guild.roles.cache.size),inline:true},
            {name:'📚 Canales',value:String(guild.channels.cache.size),inline:true},
            {name:'💬 Texto / Voz',value:textChannels+' / '+voiceChannels,inline:true},
            {name:'🛠️ Funciones',value:'🎫 Tickets\n⭐ Vouches\n👋 Bienvenida\n🤖 Autoresponders\n🧹 Moderación\n🎮 Rich Presence',inline:true},
            {name:'⚡ Estado',value:'🟢 Online\n🏓 '+Math.max(0,Math.round(client.ws.ping))+' ms',inline:true},
            {name:'🎭 Roles destacados',value:roles.length?roles.map(r=>'<@&'+r.id+'>').join(' '):'Sin roles disponibles',inline:false},
            {name:'📢 Canales',value:channels.length?channels.map(ch=>'<#'+ch.id+'>').join(' '):'Sin canales disponibles',inline:false}
          )
          .setFooter({text:'@Codek Hub • /help para ver todos los comandos'})
          .setTimestamp();

        return m.reply({embeds:[infoEmbed]});
      }

      const [panelCount,categoryCount,openTickets,vouchConfig,autoCount,presenceConfig]=await Promise.all([
        prisma.ticketPanel.count({where:{guildId:m.guildId}}),
        prisma.ticketCategory.count({where:{panel:{guildId:m.guildId}}}),
        prisma.ticket.count({where:{guildId:m.guildId,status:'open'}}),
        prisma.vouchConfig.findUnique({where:{guildId:m.guildId}}),
        prisma.autoResponder.count({where:{guildId:m.guildId,enabled:true}}),
        prisma.presenceConfig.findFirst({where:{guildId:m.guildId,enabled:true},orderBy:{updatedAt:'desc'}})
      ]);

      const dbOk=await prisma.guild.count({where:{id:m.guildId}}).then(()=>true).catch(()=>false);
      const memory=process.memoryUsage();
      const uptime=Math.floor(process.uptime());
      const formatUptime=seconds=>{
        const d=Math.floor(seconds/86400);
        const h=Math.floor((seconds%86400)/3600);
        const min=Math.floor((seconds%3600)/60);
        const s=seconds%60;
        return [d?d+'d':null,h?h+'h':null,min?min+'m':null,s+'s'].filter(Boolean).join(' ');
      };

      const statusEmbed=new EmbedBuilder()
        .setTitle('Codek Hub • Estado del bot')
        .setDescription('Información interna de mantenimiento para administradores.')
        .setColor(dbOk?0x57F287:0xED4245)
        .addFields(
          {name:'Bot',value:'🟢 Online',inline:true},
          {name:'Ping',value:Math.round(client.ws.ping)+' ms',inline:true},
          {name:'Base de datos',value:dbOk?'🟢 Operativa':'🔴 Error',inline:true},
          {name:'Servidor',value:m.guild.name,inline:true},
          {name:'Miembros',value:String(m.guild.memberCount??m.guild.members.cache.size),inline:true},
          {name:'Roles',value:String(m.guild.roles.cache.size),inline:true},
          {name:'Canales',value:String(m.guild.channels.cache.size),inline:true},
          {name:'Tickets',value:'Paneles: '+panelCount+'\nCategorías: '+categoryCount+'\nAbiertos: '+openTickets,inline:true},
          {name:'Vouch',value:vouchConfig?.enabled?'🟢 Activo':'⚪ Desactivado',inline:true},
          {name:'Autoresponder',value:autoCount+' activos',inline:true},
          {name:'Rich Presence',value:presenceConfig?.enabled?'🟢 '+presenceConfig.type+': '+clip(presenceConfig.text,80):'⚪ Sin configurar',inline:true},
          {name:'Runtime',value:'Node '+process.version+'\nUptime: '+formatUptime(uptime),inline:true},
          {name:'Memoria',value:Math.round(memory.rss/1024/1024)+' MB RSS',inline:true}
        )
        .setFooter({text:'Solo visible para administradores'})
        .setTimestamp();

      return m.reply({embeds:[statusEmbed]});
    }

    const prefixMatch=m.content.trim().match(/^[?¿]purge(?:\s+(.+))?$/i);
    if(prefixMatch){
      if(!m.member?.permissions?.has(PermissionFlagsBits.ManageMessages)){
        return m.reply('Necesitas el permiso **Gestionar mensajes** para usar ?purge.');
      }

      const argument=String(prefixMatch[1]??'').trim().toLowerCase();
      const purgeAll=argument==='canal'||argument==='channel'||argument==='todo'||argument==='all';
      const amount=Number(argument);

      if(!purgeAll&&!Number.isInteger(amount)){
        return m.reply('Uso: **?purge 100** o **?purge canal**.');
      }

      if(!purgeAll&&(amount<1||amount>10000)){
        return m.reply('La cantidad debe estar entre **1 y 10000**.');
      }

      const notice=await m.reply('🧹 Limpiando mensajes...');
      try{
        const deleted=purgeAll
          ?await purgeEverything(m.channel)
          :await purgeChannelMessages(m.channel,amount);

        await audit(m.guildId,m.author.id,'moderation','purge',purgeAll?'all:'+deleted:String(deleted));

        // El propio comando y el aviso también forman parte del historial.
        await notice.delete().catch(()=>{});
        await m.delete().catch(()=>{});
        if(!purgeAll&&deleted<amount){
          await m.channel.send('🧹 Se eliminaron **'+deleted+'** mensajes disponibles en este canal.').then(x=>setTimeout(()=>x.delete().catch(()=>{}),4000)).catch(()=>{});
        }
      }catch(e){
        logger.error('Prefix purge failed',{error:e.message});
        await notice.edit('No pude eliminar los mensajes. Verifica que el bot tenga **Gestionar mensajes** y **Ver historial de mensajes** en este canal.').catch(()=>{});
      }
      return;
    }

    const r=await findAutoResponder(m.content,m.guildId);
    if(!r||!r.response?.trim())return;

    const x=context(m.author,m.guild,m.channel);
    const payload={content:clip(renderVariables(r.response,x),2000)};
    if(r.embedTitle||r.embedDescription){
      payload.embeds=[new EmbedBuilder()
        .setTitle(clip(renderVariables(r.embedTitle||'',x),256))
        .setDescription(clip(renderVariables(r.embedDescription||r.response,x),4096))
        .setColor(color(r.embedColor))
        .setTimestamp()];
    }
    await m.reply(payload);
    await audit(m.guildId,m.author.id,'autoresponder','used',r.trigger);
  }catch(e){
    logger.error('Autoresponder failed',{error:e.message});
  }
    }catch(e){
      logger.error('MessageCreate failed',{error:e.message,stack:e.stack});
    }
  });
}