import { applyCooldown } from '../middleware/rateLimit.js';
import { checkBotPermissions } from '../middleware/botPermissions.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Events, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } from 'discord.js';

export function registerInteractionHandler(client,deps){
  function formatUptime(seconds){const total=Math.max(0,Math.floor(Number(seconds)||0));const d=Math.floor(total/86400);const h=Math.floor(total%86400/3600);const m=Math.floor(total%3600/60);const s=total%60;return (d?d+'d ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}

  const {
    prisma,logger,commands,env,ADMIN,isAdmin,deny,roleIds,clip,safeUrl,color,
    normalizeEmoji,emojiExists,context,findUniquePanel,findUniqueCategory,
    deleteOpenTicketsForCategory,createTicket,closeTicket,
    findTicket,claimTicket,releaseTicket,addTicketUser,removeTicketUser,
    renameTicket,moveTicket,ticketStats,recordModeration,moderationHistory,
    parseDuration,processAutoMod,serverStats,botStats,createGiveaway,
    toggleParticipant,endGiveaway,cancelGiveaway,audit,handleDiscordError,renderVariables,presence,
    purgeChannelMessages,purgeEverything,helpEmbed
  }=deps;

  client.on(Events.InteractionCreate,async i=>{

  try{
    if(!i.guildId||!i.guild){
      if(!i.replied&&!i.deferred)await i.reply(deny('Este comando solo puede usarse dentro de un servidor.'));
      return;
    }
    if(i.isChatInputCommand()&&i.commandName!=='help'){
      try{applyCooldown(i.user.id,i.commandName,2)}catch(e){return i.reply(deny(e.message))}
    }
    if(i.isChatInputCommand())void audit(i.guildId,i.user.id,'command',i.commandName).catch(()=>{});

    if(i.isStringSelectMenu()&&i.customId.startsWith('ticket:select:')){
      const categoryId=i.values[0];
      const c=await prisma.ticketCategory.findFirst({
        where:{id:categoryId,panel:{guildId:i.guildId}},
        include:{questions:true}
      });
      if(!c)return i.reply(deny('La categoría ya no existe o pertenece a otro servidor.'));
      if(c.questions.length>5)return i.reply(deny('Máximo 5 preguntas por categoría.'));
      if(!c.questions.length)return createTicket(i,c);

      const modal=new ModalBuilder()
        .setCustomId('ticket:form:'+c.id)
        .setTitle(('Ticket • '+c.name).slice(0,45));

      for(const q of c.questions){
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(q.id)
            .setLabel(q.label.slice(0,45))
            .setPlaceholder((q.placeholder||'Respuesta').slice(0,100))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(q.required)
            .setMaxLength(1000)
        ));
      }
      return i.showModal(modal);
    }

    if(i.isButton()&&i.customId.startsWith('ticket:claim:')){
      const id=i.customId.split(':')[2];
      const t=await prisma.ticket.findFirst({
        where:{id,guildId:i.guildId},
        include:{category:true,answers:true}
      });
      if(!t||t.status!=='open')return i.reply(deny('Ticket no encontrado o cerrado.'));

      const member=i.member;
      const canClaim=Boolean(member?.roles?.cache)&&t.category.supportRoleIds.some(x=>member.roles.cache.has(x));
      if(!canClaim)return i.reply(deny('Solo soporte puede reclamar tickets.'));

      if(i.channelId!==t.channelId)return i.reply(deny('Este botón no pertenece al canal de este ticket.'));
      if(t.claimedById===i.user.id)return i.reply(deny('Este ticket ya está reclamado por ti.'));
      if(t.claimedById&&t.claimedById!==i.user.id){
        return i.reply(deny('Este ticket ya fue reclamado por otro miembro del staff.'));
      }

      try{
        await prisma.$transaction(async tx=>{
          const result=await tx.ticket.updateMany({
            where:{id,status:'open',claimedById:null},
            data:{claimedById:i.user.id,claimedAt:new Date()}
          });
          if(!result.count){
            const error=new Error('TICKET_ALREADY_CLAIMED');
            throw error;
          }
          await tx.ticketClaim.create({
            data:{ticketId:id,userId:i.user.id}
          });
        });
      }catch(e){
        if(e.message==='TICKET_ALREADY_CLAIMED')return i.reply(deny('Este ticket ya fue reclamado por otro miembro del staff.'));
        throw e;
      }

      await prisma.ticketStats.create({data:{guildId:i.guildId,staffId:i.user.id,userId:t.userId,categoryId:t.categoryId,action:'claimed'}});
      await audit(i.guildId,i.user.id,'tickets','claimed','#'+t.number);
      return i.reply(deny('Ticket reclamado por '+i.user.toString()+'.'));
    }

    if(i.isButton()&&i.customId.startsWith('ticket:close:')){
      const id=i.customId.split(':')[2];
      const t=await prisma.ticket.findFirst({
        where:{id,guildId:i.guildId},        include:{category:true}
      });
      if(!t||t.status!=='open')return i.reply(deny('Ticket no encontrado o cerrado.'));
      if(i.channelId!==t.channelId)return i.reply(deny('Este botón no pertenece al canal de este ticket.'));

      const member=i.member;
      const isSupport=Boolean(member?.roles?.cache)&&t.category.supportRoleIds.some(x=>member.roles.cache.has(x));
      const allowed=i.user.id===t.userId||isSupport;
      if(!allowed)return i.reply(deny('No tienes permiso para cerrar este ticket.'));

      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:confirm:'+id).setLabel('Confirmar cierre').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket:cancel:'+id).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
      );
      return i.reply({content:'¿Seguro que quieres cerrar este ticket?',components:[row],flags:64});
    }

    if(i.isButton()&&i.customId.startsWith('ticket:cancel:')){
      return i.update({content:'Cierre cancelado.',components:[]});
    }

    if(i.isButton()&&i.customId.startsWith('ticket:confirm:')){
      const id=i.customId.split(':')[2];
      const t=await prisma.ticket.findFirst({
        where:{id,guildId:i.guildId},
        include:{category:true,answers:true}
      });
      if(!t)return i.reply(deny('Ticket no encontrado.'));
      if(i.channelId!==t.channelId)return i.reply(deny('Este botón no pertenece al canal de este ticket.'));
      const member=i.member;
      const isSupport=Boolean(member?.roles?.cache)&&t.category.supportRoleIds.some(x=>member.roles.cache.has(x));
      if(i.user.id!==t.userId&&!isSupport)return i.reply(deny('No tienes permiso para cerrar este ticket.'));
      return closeTicket(i,t);
    }

    if(i.isModalSubmit()&&i.customId.startsWith('ticket:form:')){
      const id=i.customId.split(':')[2];
      const c=await prisma.ticketCategory.findFirst({
        where:{id,panel:{guildId:i.guildId}},
        include:{questions:true}
      });
      if(!c)return i.reply(deny('Categoría no encontrada.'));
      const a=c.questions.slice(0,5).map(q=>({
        label:q.label,
        answer:i.fields.getTextInputValue(q.id)
      }));
      return createTicket(i,c,a);
    }

    if(i.isModalSubmit()&&i.customId.startsWith('vouch:')){
      const [,targetId,type,ratingRaw]=i.customId.split(':');
      const rating=Number(ratingRaw);
      if(!targetId||!['Legit','No Legit'].includes(type)||!Number.isInteger(rating)||rating<1||rating>5){
        return i.reply(deny('Los datos del vouch no son válidos. Vuelve a ejecutar /vouch.'));
      }
      const text=i.fields.getTextInputValue('review').trim();
      if(!text)return i.reply(deny('La reseña no puede estar vacía.'));

      const c=await prisma.vouchConfig.findUnique({where:{guildId:i.guildId}});
      if(!c?.enabled)return i.reply(deny('Vouches desactivados.'));

      const member=i.member;
      if(c.allowedRoleIds.length&&!c.allowedRoleIds.some(x=>member?.roles?.cache?.has(x))){
        return i.reply(deny('No tienes permiso para usar /vouch.'));
      }

      const dbLast=await prisma.vouch.findFirst({
        where:{guildId:i.guildId,reviewerId:i.user.id},
        orderBy:{createdAt:'desc'},
        select:{createdAt:true}
      });
      if(dbLast&&Date.now()-dbLast.createdAt.getTime()<c.cooldown*1000)return i.reply(deny('Espera antes de enviar otro vouch.'));
      const dayStart=new Date(Date.now()-24*60*60*1000);
      const dailyCount=await prisma.vouch.count({where:{guildId:i.guildId,reviewerId:i.user.id,createdAt:{gte:dayStart}}});
      if(dailyCount>=10)return i.reply(deny('Has alcanzado el límite de **10 vouches por día**.'));

      const duplicate=await prisma.vouch.findFirst({
        where:{guildId:i.guildId,targetId,reviewerId:i.user.id}
      });
      if(duplicate)return i.reply(deny('Ya has dejado un vouch para este usuario.'));

      const target=await client.users.fetch(targetId).catch(()=>null);
      const targetMember=target?await i.guild.members.fetch(target.id).catch(()=>null):null;
      const ch=c.channelId?i.guild.channels.cache.get(c.channelId):null;
      if(!target||!targetMember||target.bot||!ch?.isTextBased())return i.reply(deny('El usuario o canal de vouches ya no existe o el usuario no pertenece al servidor.'));

      try{
        await prisma.vouch.create({
          data:{
            guildId:i.guildId,
            targetId,
            reviewerId:i.user.id,
            reviewType:type,
            rating,
            text
          }
        });
      }catch(e){
        if(e?.code==='P2002')return i.reply(deny('Ya has dejado un vouch para este usuario.'));
        throw e;
      }

      const x=context(target,i.guild,ch,{
        target:target.toString(),
        targetavatar:target.displayAvatarURL({size:1024,extension:'png'}),
        client:i.user.toString(),
        clientavatar:i.user.displayAvatarURL({size:1024,extension:'png'}),
        category:'vouch'
      });
      const emb=new EmbedBuilder()
        .setTitle(clip(renderVariables(c.title||'Nueva reseña',x),256))
        .setDescription(clip(renderVariables(c.description||'',x),4096))
        .setColor(color(c.color))
        .setThumbnail(target.displayAvatarURL({size:1024}))
        .setAuthor({
          name:i.user.globalName||i.user.username,
          iconURL:i.user.displayAvatarURL({size:256})
        })
        .addFields(
          {name:'Usuario',value:target.toString(),inline:true},
          {name:'Cliente',value:i.user.toString(),inline:true},
          {name:'Tipo',value:type,inline:true},
          {name:'Rating',value:'⭐'.repeat(rating),inline:true},
          {name:'Reseña',value:text.slice(0,1024)}
        )
        .setTimestamp();

      const vouchImage=safeUrl(renderVariables(c.image||'',x));
      const vouchThumbnail=safeUrl(renderVariables(c.thumbnail||'',x));
      if(vouchImage)emb.setImage(vouchImage);
      if(vouchThumbnail)emb.setThumbnail(vouchThumbnail);
      if(c.footer)emb.setFooter({text:clip(renderVariables(c.footer,x),2048)});

      await ch.send({embeds:[emb]});
      cooldowns.set(i.guildId+':'+i.user.id,Date.now());
      await audit(i.guildId,i.user.id,'vouch','created',target?.tag||target?.username||'Usuario');
      return i.reply(deny('¡Vouch registrado correctamente!'));
    }

    if(!i.isChatInputCommand())return;

    if(i.commandName==='help'){
      return i.reply({embeds:[helpEmbed()]});
    }

    if(i.commandName==='purge'){
      if(!i.member?.permissions?.has(PermissionFlagsBits.ManageMessages)){
        return i.reply(deny('Necesitas el permiso **Gestionar mensajes** para usar este comando.'));
      }

      const purgeAll=i.options.getBoolean('canal')===true;
      const amount=i.options.getInteger('cantidad');

      if(!purgeAll&&!amount){
        return i.reply(deny('Indica una cantidad, por ejemplo **/purge cantidad:100**, o usa **canal:true** para limpiar todo el canal.'));
      }

      if(purgeAll&&amount){
        return i.reply(deny('Usa solo una opción: **cantidad** o **canal:true**.'));
      }

      await i.deferReply({flags:64});

      try{
        const deleted=purgeAll
          ?await purgeEverything(i.channel)
          :await purgeChannelMessages(i.channel,amount);

        await audit(i.guildId,i.user.id,'moderation','purge',purgeAll?'all:'+deleted:String(deleted));
        return i.editReply(deny(
          deleted
            ?'🧹 Se eliminaron **'+deleted+'** mensajes de este canal.'
            :'No encontré mensajes que pudiera eliminar.'
        ));
      }catch(e){
        logger.error('Purge failed',{error:e.message});
        return i.editReply(deny('No pude eliminar los mensajes. Verifica que el bot tenga **Gestionar mensajes** y **Ver historial de mensajes** en este canal.'));
      }
    }

    if(i.commandName==='variables'){
      return i.reply(deny([
        'Usuarios: {user} {mention} {username} {tag} {displayname}',
        'Avatares: {useravatar} {avatar} {user_avatar}',
        'Servidor: {server} {guild} {membercount} {guildicon} {servericon}',
        'Canal: {channel} {channelname}',
        'Ticket: {ticket} {category} {staff}',
        'Vouch: {client} {clientavatar} {target} {targetavatar}'
      ].join('\n')));
    }

    if(i.commandName==='welcome'){
      if(!isAdmin(i))return i.reply(deny('Necesitas permisos de administrador.'));
      const welcomeSub=i.options.getSubcommand();
      if(welcomeSub==='test'||welcomeSub==='preview'){
        const config=await prisma.welcomeConfig.findUnique({where:{guildId:i.guildId}});
        if(!config?.enabled)return i.reply(deny('La bienvenida no está configurada.'));
        const channel=config.channelId?i.guild.channels.cache.get(config.channelId):i.channel;
        const x=context(i.user,i.guild,channel);
        const embed=new EmbedBuilder().setTitle(clip(renderVariables(config.title||'¡Bienvenido!',x),256)).setDescription(clip(renderVariables(config.description||config.message||'Bienvenido {mention} a {server}.',x),4096)).setColor(color(config.color));
        if(config.image&&safeUrl(config.image))embed.setImage(safeUrl(config.image));
        if(config.thumbnail&&safeUrl(config.thumbnail))embed.setThumbnail(safeUrl(config.thumbnail));
        if(config.footer)embed.setFooter({text:clip(renderVariables(config.footer,x),2048)});
        if(welcomeSub==='preview')return i.reply({embeds:[embed],flags:64});
        if(!channel?.isTextBased())return i.reply(deny('El canal de bienvenida ya no existe.'));
        await channel.send({content:renderVariables(config.message||'',x),embeds:[embed]});
        return i.reply(deny('Prueba de bienvenida enviada en '+channel.toString()+'.'));
      }
      if(welcomeSub==='reset'){
        await prisma.welcomeConfig.deleteMany({where:{guildId:i.guildId}});
        await audit(i.guildId,i.user.id,'welcome','reset','Configuración de bienvenida eliminada.');
        return i.reply(deny('Configuración de bienvenida eliminada.'));
      }
      const ch=i.options.getChannel('canal');
      if(!ch?.isTextBased())return i.reply(deny('El canal indicado no es válido.'));

      const rawColor=i.options.getString('color');
      const image=i.options.getString('imagen');
      const thumbnail=i.options.getString('thumbnail');
      if(rawColor&&!isHexColor(rawColor))return i.reply(deny('El color debe ser HEX de 6 dígitos, por ejemplo 5865F2.'));
      if(image&&!safeUrl(image))return i.reply(deny('La URL de imagen no es válida. Usa una URL http/https.'));
      if(thumbnail&&!safeUrl(thumbnail))return i.reply(deny('La URL del thumbnail no es válida. Usa una URL http/https.'));

      const data={
        enabled:true,
        channelId:ch.id,
        message:i.options.getString('mensaje'),
        title:i.options.getString('titulo'),
        description:i.options.getString('descripcion'),
        color:rawColor,
        image,
        thumbnail,
        footer:i.options.getString('footer'),
        goodbyeEnabled:Boolean(i.options.getString('despedida')),
        goodbyeChannelId:i.options.getChannel('canal-despedida')?.id||null,
        goodbyeMessage:i.options.getString('despedida')||null
      };

      await prisma.welcomeConfig.upsert({
        where:{guildId:i.guildId},
        update:data,
        create:{guild:{connect:{id:i.guildId}},...data}
      });
      return i.reply(deny('Bienvenida configurada.'));
    }

    if(i.commandName==='vouch-config'){
      if(!isAdmin(i))return i.reply(deny('Necesitas permisos de administrador.'));

      if(i.options.getSubcommand()==='reset'){
        await prisma.vouchConfig.upsert({
          where:{guildId:i.guildId},
          update:{enabled:false},
          create:{guild:{connect:{id:i.guildId}},enabled:false,allowedRoleIds:[]}
        });
        return i.reply(deny('Vouches desactivados.'));
      }

      const ch=i.options.getChannel('canal');
      const raw=i.options.getString('roles');
      const roles=roleIds(i.guild,raw);
      const cool=i.options.getInteger('cooldown')??60;
      const rawColor=i.options.getString('color');
      const image=i.options.getString('imagen');
      const thumbnail=i.options.getString('thumbnail');

      if(!ch?.isTextBased())return i.reply(deny('El canal indicado no es válido.'));
      if(raw&&!roles.length)return i.reply(deny('No se encontró ningún rol válido.'));
      if(rawColor&&!isHexColor(rawColor))return i.reply(deny('El color debe ser HEX de 6 dígitos, por ejemplo 5865F2.'));
      if(image&&!safeUrl(image))return i.reply(deny('La URL de imagen no es válida. Usa una URL http/https.'));
      if(thumbnail&&!safeUrl(thumbnail))return i.reply(deny('La URL del thumbnail no es válida. Usa una URL http/https.'));

      const data={
        enabled:true,
        channelId:ch.id,
        allowedRoleIds:roles,
        cooldown:cool,
        title:i.options.getString('titulo'),
        description:i.options.getString('descripcion'),
        color:rawColor,
        image,
        thumbnail,
        footer:i.options.getString('footer')
      };

      await prisma.vouchConfig.upsert({
        where:{guildId:i.guildId},
        update:data,
        create:{guild:{connect:{id:i.guildId}},...data}
      });
      return i.reply(deny('Vouches configurados.'));
    }

    if(i.commandName==='vouch'){
      const c=await prisma.vouchConfig.findUnique({where:{guildId:i.guildId}});
      if(!c?.enabled)return i.reply(deny('Vouches desactivados.'));

      const member=i.member;
      if(c.allowedRoleIds.length&&!c.allowedRoleIds.some(x=>member?.roles?.cache?.has(x))){
        return i.reply(deny('No tienes permiso para usar /vouch.'));
      }

      const memoryLast=cooldowns.get(i.guildId+':'+i.user.id)||0;
      const dbLast=await prisma.vouch.findFirst({
        where:{guildId:i.guildId,reviewerId:i.user.id},
        orderBy:{createdAt:'desc'},
        select:{createdAt:true}
      });
      const last=Math.max(memoryLast,dbLast?.createdAt?.getTime()||0);
      if(Date.now()-last<c.cooldown*1000)return i.reply(deny('Espera antes de enviar otro vouch.'));

      const target=i.options.getUser('member');
      const type=i.options.getString('tipo');
      const rating=i.options.getInteger('rating');

      if(!target)return i.reply(deny('No se encontró el usuario indicado.'));
      if(target.bot)return i.reply(deny('No puedes dejar un vouch a un bot.'));
      if(target.id===i.user.id)return i.reply(deny('No puedes votarte a ti mismo.'));

      const duplicate=await prisma.vouch.findFirst({
        where:{guildId:i.guildId,targetId:target.id,reviewerId:i.user.id}
      });
      if(duplicate)return i.reply(deny('Ya has dejado un vouch para este usuario.'));

      const modal=new ModalBuilder()
        .setCustomId('vouch:'+target.id+':'+type+':'+rating)
        .setTitle('Danos tu reseña');

      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('review')
          .setLabel('Danos tu reseña')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      ));

      return i.showModal(modal);
    }

    if(i.commandName==='autoresponder'){
      const sub=i.options.getSubcommand();
      if(!isAdmin(i))return i.reply(deny('Necesitas permisos de administrador.'));

      if(sub==='add'){
        const trigger=i.options.getString('trigger').trim();
        const response=i.options.getString('respuesta').trim();
        if(!trigger||!response)return i.reply(deny('Trigger y respuesta son obligatorios.'));

        const exists=await prisma.autoResponder.findFirst({
          where:{guildId:i.guildId,trigger:{equals:trigger,mode:'insensitive'}}
        });
        if(exists)return i.reply(deny('Ya existe un autoresponder con ese trigger.'));

        try{
          await prisma.autoResponder.create({
            data:{
              guild:{connect:{id:i.guildId}},
              trigger,
              response,
              matchType:i.options.getString('modo')||'contains',
              embedTitle:i.options.getString('titulo'),
              embedDescription:i.options.getString('descripcion'),
              embedColor:i.options.getString('color')
            }
          });
        }catch(e){
          if(e?.code==='P2002')return i.reply(deny('Ya existe un autoresponder con ese trigger.'));
          throw e;
        }
        await audit(i.guildId,i.user.id,'autoresponder','created',trigger);
        return i.reply(deny('Autoresponder creado.'));
      }

      if(sub==='remove'){
        const trigger=i.options.getString('trigger').trim();
        const row=await prisma.autoResponder.findFirst({
          where:{guildId:i.guildId,trigger:{equals:trigger,mode:'insensitive'}}
        });
        if(!row)return i.reply(deny('No existe ese autoresponder.'));
        await prisma.autoResponder.delete({where:{id:row.id}});
        await audit(i.guildId,i.user.id,'autoresponder','removed',trigger);
        return i.reply(deny('Autoresponder eliminado.'));
      }
      const rows=await prisma.autoResponder.findMany({
        where:{guildId:i.guildId},
        orderBy:{createdAt:'asc'}
      });
      return i.reply(deny(rows.length
        ?rows.map(r=>'• **'+r.trigger+'** — '+r.matchType).join('\n')
        :'No hay autoresponders.'
      ));
    }

    if(i.commandName==='presence'){
      if(!isAdmin(i))return i.reply(deny('Necesitas permisos de administrador.'));

      if(i.options.getSubcommand()==='reset'){
        await prisma.presenceConfig.updateMany({data:{enabled:false}});
        await presence();
        return i.reply(deny('Rich Presence restablecida.'));
      }

      const type=i.options.getString('tipo');
      const text=i.options.getString('texto');

      await prisma.presenceConfig.updateMany({data:{enabled:false}});
      await prisma.presenceConfig.upsert({
        where:{guildId:i.guildId},
        update:{enabled:true,type,text},
        create:{guild:{connect:{id:i.guildId}},enabled:true,type,text}
      });
      await presence();
      await audit(i.guildId,i.user.id,'presence','updated',type+': '+text);
      return i.reply(deny('Rich Presence actualizada.'));
    }

    if(i.commandName==='warn'||i.commandName==='mute'||i.commandName==='timeout'||i.commandName==='unmute'||i.commandName==='untimeout'||i.commandName==='kick'||i.commandName==='ban'||i.commandName==='unban'||i.commandName==='history'||i.commandName==='clear'){
      const permissions={warn:PermissionFlagsBits.ModerateMembers,mute:PermissionFlagsBits.ModerateMembers,timeout:PermissionFlagsBits.ModerateMembers,unmute:PermissionFlagsBits.ModerateMembers,untimeout:PermissionFlagsBits.ModerateMembers,kick:PermissionFlagsBits.KickMembers,ban:PermissionFlagsBits.BanMembers,unban:PermissionFlagsBits.BanMembers,history:PermissionFlagsBits.ModerateMembers,clear:PermissionFlagsBits.ManageMessages};
      await checkBotPermissions(i,[permissions[i.commandName]]);
      if(i.commandName==='clear'){const amount=i.options.getInteger('cantidad');const deleted=await purgeChannelMessages(i.channel,amount);await audit(i.guildId,i.user.id,'moderation','clear',String(deleted));return i.reply(deny('🧹 Eliminados **'+deleted+'** mensajes.'))}
      if(i.commandName==='unban'){const id=i.options.getString('usuario').trim();await i.guild.members.unban(id,'Moderación');await recordModeration({guildId:i.guildId,targetId:id,moderatorId:i.user.id,action:'unban'});await logToChannel(i.guild,'🔓 Moderación','<@'+i.user.id+'> desbaneó a <@'+id+'>.');return i.reply(deny('Usuario desbaneado.'))}
      const target=i.options.getUser('usuario');
      if(i.commandName==='history'){const rows=await moderationHistory(i.guildId,target.id,20);if(!rows.length)return i.reply(deny('No hay historial de moderación para ese usuario.'));return i.reply(deny(rows.map(x=>'• **'+x.action+'** — '+(x.reason||'Sin razón')+' — <t:'+Math.floor(x.createdAt.getTime()/1000)+':R>').join('\n')))}
      const member=await i.guild.members.fetch(target.id).catch(()=>null);if(!member)return i.reply(deny('El usuario no pertenece al servidor.'));
      const reason=i.options.getString('razon')?.trim()||'Sin razón especificada';
      if(i.commandName==='warn'){await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'warn',reason});await logToChannel(i.guild,'⚠️ Advertencia','<@'+i.user.id+'> advirtió a '+target.toString()+'. Razón: '+reason);await target.send('⚠️ Has recibido una advertencia en **'+i.guild.name+'**. Razón: '+reason).catch(()=>{});return i.reply(deny('Advertencia registrada para '+target.toString()+'.'))}
      if(i.commandName==='kick'){await member.kick(reason);await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'kick',reason});await logToChannel(i.guild,'👢 Expulsión','<@'+i.user.id+'> expulsó a '+target.toString()+'. Razón: '+reason);return i.reply(deny('Usuario expulsado.'))}
      if(i.commandName==='ban'){await member.ban({reason});await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'ban',reason});await logToChannel(i.guild,'🔨 Baneo','<@'+i.user.id+'> baneó a '+target.toString()+'. Razón: '+reason);return i.reply(deny('Usuario baneado.'))}
      if(i.commandName==='unmute'||i.commandName==='untimeout'){await member.timeout(null,reason);await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'untimeout',reason});await logToChannel(i.guild,'🔊 Timeout retirado','<@'+i.user.id+'> retiró el timeout de '+target.toString()+'.');return i.reply(deny('Timeout retirado.'))}
      const parsed=parseDuration(i.options.getString('duracion'));if(!parsed)return i.reply(deny('Duración inválida. Usa 30m, 1h, 1d o 1w.'));if(parsed.ms>28*86400000)return i.reply(deny('Discord permite un máximo de 28 días de timeout.'));
      await member.timeout(parsed.ms,reason);await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'timeout',reason,duration:parsed.seconds,expiresAt:new Date(Date.now()+parsed.ms)});await logToChannel(i.guild,'🔇 Timeout','<@'+i.user.id+'> aplicó timeout a '+target.toString()+'. Razón: '+reason);return i.reply(deny('Timeout aplicado a '+target.toString()+'.'));
    }

    if(i.commandName==='logs'){
      const sub=i.options.getSubcommand();
      if(sub==='set'){const channel=i.options.getChannel('canal');await prisma.guild.update({where:{id:i.guildId},data:{logChannelId:channel.id}});await prisma.logConfig.upsert({where:{guildId:i.guildId},update:{channelId:channel.id},create:{guildId:i.guildId,channelId:channel.id,events:['MESSAGE_DELETE','MESSAGE_EDIT','MEMBER_JOIN','MEMBER_LEAVE','MEMBER_UPDATE','ROLE_CREATE','ROLE_DELETE','CHANNEL_CREATE','CHANNEL_DELETE','CHANNEL_UPDATE','MODERATION','TICKET_CREATE','TICKET_CLOSE','TICKET_CLAIM','COMMAND']}});return i.reply(deny('📋 Canal de logs configurado en '+channel.toString()+'.'))}
      if(sub==='disable'){await prisma.guild.update({where:{id:i.guildId},data:{logChannelId:null}});await prisma.logConfig.deleteMany({where:{guildId:i.guildId}});return i.reply(deny('📋 Logs desactivados.'))}
      const row=await prisma.logConfig.findUnique({where:{guildId:i.guildId}});return i.reply(deny(row?'📋 Logs activos en <#'+row.channelId+'>.':'📋 Logs desactivados.'));
    }
    if(i.commandName==='automod'){
      const sub=i.options.getSubcommand();
      if(sub==='setup'){const rows=await prisma.autoModRule.findMany({where:{guildId:i.guildId},orderBy:{type:'asc'}});return i.reply(deny(rows.length?rows.map(r=>'• **'+r.type+'** — '+(r.enabled?'🟢':'⚪')+' — '+r.action+(r.threshold?' — '+r.threshold:'')).join('\n'):'No hay reglas AutoMod.'))}
      const enabled=i.options.getBoolean('enabled');const action=i.options.getString('action');
      const threshold=sub==='spam'?i.options.getInteger('limit'):sub==='mentions'?i.options.getInteger('limit'):sub==='caps'?i.options.getInteger('percentage'):null;
      const whitelist=sub==='links'?String(i.options.getString('whitelist')||'').split(',').map(x=>x.trim()).filter(Boolean):sub==='words'?String(i.options.getString('words')||'').split(',').map(x=>x.trim()).filter(Boolean):[];
      const parsedDuration=i.options.getString('duracion')?parseDuration(i.options.getString('duracion')):null;
      if(i.options.getString('duracion')&&!parsedDuration)return i.reply(deny('Duración inválida. Usa 1h, 6h, 1d o 1w.'));
      if(parsedDuration&&parsedDuration.ms>28*24*60*60*1000)return i.reply(deny('Discord permite un máximo de 28 días para timeout.'));
      const durationSeconds=parsedDuration?.seconds??null;
      await prisma.autoModRule.upsert({where:{guildId_type:{guildId:i.guildId,type:sub}},update:{enabled,action,threshold,durationSeconds,whitelist},create:{guildId:i.guildId,type:sub,enabled,action,threshold,durationSeconds,whitelist,exceptions:[]}});
      return i.reply(deny('🤖 Regla AutoMod **'+sub+'** actualizada.'));
    }

    if(i.commandName==='giveaway'){
      const sub=i.options.getSubcommand();
      if(sub==='create'){const parsed=parseDuration(i.options.getString('duracion'));if(!parsed)return i.reply(deny('Duración inválida. Usa 10m, 2h o 1d.'));await i.deferReply({flags:64});const endsAt=new Date(Date.now()+parsed.ms);const message=await i.channel.send({embeds:[new EmbedBuilder().setTitle('🎉 Sorteo').setDescription('**'+i.options.getString('premio')+'**\n\nFinaliza <t:'+Math.floor(endsAt.getTime()/1000)+':R>\nParticipa con el botón de abajo.').setColor(0x5865F2)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway:pending').setLabel('🎉 Participar').setStyle(ButtonStyle.Success))]});const row=await createGiveaway({guildId:i.guildId,channelId:i.channelId,messageId:message.id,prize:i.options.getString('premio'),winners:i.options.getInteger('ganadores'),endsAt,createdBy:i.user.id});await message.edit({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway:join:'+row.id).setLabel('🎉 Participar (0)').setStyle(ButtonStyle.Success))]});return i.editReply(deny('Sorteo creado. ID: `'+row.id+'`'))}
      if(sub==='list'){const rows=await prisma.giveaway.findMany({where:{guildId:i.guildId,ended:false},orderBy:{endsAt:'asc'}});return i.reply(deny(rows.length?rows.map(r=>'• `'+r.id+'` — **'+r.prize+'** — '+r.participants.length+' participantes').join('\n'):'No hay sorteos activos.'))}
      const id=i.options.getString('id');const row=await prisma.giveaway.findFirst({where:{id,guildId:i.guildId}});if(!row)return i.reply(deny('Sorteo no encontrado.'));
      if(sub==='cancel'){const ended=await cancelGiveaway(row);return i.reply(deny(ended?'Sorteo cancelado.':'El sorteo ya había terminado.'))}
      if(sub==='end'){const ended=await endGiveaway(row);if(!ended)return i.reply(deny('El sorteo ya había terminado.'));const channel=i.guild.channels.cache.get(row.channelId);if(channel?.isTextBased())await channel.send('🎉 Ganadores del sorteo **'+row.prize+'**: '+(ended.winnerIds?.map(x=>'<@'+x+'>').join(', ')||'ninguno'));return i.reply(deny('Sorteo finalizado.'))}
      if(sub==='reroll'){if(!row.ended)return i.reply(deny('El sorteo todavía está activo. Primero finalízalo.'));const pool=[...(row.participants||[])];const winners=[];while(pool.length&&winners.length<row.winners)winners.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);await prisma.giveaway.update({where:{id:row.id},data:{winnerIds:winners}});const channel=i.guild.channels.cache.get(row.channelId);if(channel?.isTextBased())await channel.send('🎉 Nuevos ganadores del sorteo **'+row.prize+'**: '+(winners.map(x=>'<@'+x+'>').join(', ')||'ninguno'));return i.reply(deny('Reroll realizado.'))}
    }

    if(i.isButton()&&i.customId.startsWith('giveaway:join:')){const id=i.customId.split(':')[2];const row=await toggleParticipant(id,i.user.id);if(!row)return i.reply(deny('Este sorteo ya terminó.'));await i.message.edit({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway:join:'+row.id).setLabel('🎉 Participar ('+row.participants.length+')').setStyle(ButtonStyle.Success))]}).catch(()=>{});return i.reply(deny(row.participants.includes(i.user.id)?'Participación registrada.':'Has salido del sorteo.'))}

    if(i.commandName==='vouches'){const sub=i.options.getSubcommand();if(sub==='view'){const user=i.options.getUser('usuario');const rows=await prisma.vouch.findMany({where:{guildId:i.guildId,targetId:user.id},orderBy:{createdAt:'desc'},take:20});const avg=rows.length?rows.reduce((sum,r)=>sum+r.rating,0)/rows.length:0;return i.reply({embeds:[new EmbedBuilder().setTitle('⭐ Reputación de '+user.username).setDescription('Vouches: **'+rows.length+'**\nRating promedio: **'+avg.toFixed(2)+'/5**\nNivel: **'+(Math.floor(rows.length/10)+1)+'**').setColor(0xFEE75C).setThumbnail(user.displayAvatarURL({size:256}))]})}if(sub==='top'){const grouped=await prisma.vouch.groupBy({by:['targetId'],where:{guildId:i.guildId},_count:{targetId:true},orderBy:{_count:{targetId:'desc'}},take:10});const lines=[];for(const row of grouped){const user=await client.users.fetch(row.targetId).catch(()=>null);lines.push('**'+(lines.length+1)+'.** '+(user?.toString()||row.targetId)+' — '+row._count.targetId)}return i.reply(deny(lines.length?lines.join('\n'):'No hay vouches.'))}const total=await prisma.vouch.count({where:{guildId:i.guildId}});const avg=await prisma.vouch.aggregate({where:{guildId:i.guildId},_avg:{rating:true}});return i.reply(deny('⭐ Vouches totales: **'+total+'**\nRating promedio: **'+(avg._avg.rating?.toFixed(2)||'0')+'/5'))}

    if(i.commandName==='stats'){const sub=i.options.getSubcommand();if(sub==='server'){const st=await serverStats(i.guild);return i.reply({embeds:[new EmbedBuilder().setTitle('📊 Estadísticas de '+i.guild.name).addFields({name:'👥 Miembros',value:String(st.members),inline:true},{name:'👤 Humanos',value:String(st.humans),inline:true},{name:'🤖 Bots',value:String(st.bots),inline:true},{name:'🎭 Roles',value:String(st.roles),inline:true},{name:'📚 Canales',value:String(st.channels),inline:true},{name:'📁 Categorías',value:String(st.categories),inline:true},{name:'🚀 Boosts',value:String(st.boosts)+' • Nivel '+st.boostLevel,inline:true},{name:'👑 Owner',value:'<@'+st.ownerId+'>',inline:true}).setColor(0x5865F2)]})}const st=await botStats(i.guildId);return i.reply(deny('🤖 Codek Hub\nTickets: '+st.tickets+'\nVouches: '+st.vouches+'\nComandos: '+st.commands+'\nModeración: '+st.moderation+'\nUptime: '+formatUptime(process.uptime())+'\nNode: '+process.version))}

    if(i.commandName==='config'){const sub=i.options.getSubcommand();const [welcome,vouch,panels,autoRules,logs]=await Promise.all([prisma.welcomeConfig.findUnique({where:{guildId:i.guildId}}),prisma.vouchConfig.findUnique({where:{guildId:i.guildId}}),prisma.ticketPanel.count({where:{guildId:i.guildId}}),prisma.autoModRule.count({where:{guildId:i.guildId,enabled:true}}),prisma.logConfig.findUnique({where:{guildId:i.guildId}})]);if(sub==='tickets')return i.reply(deny('🎫 Tickets: '+(panels?'✅':'❌')+' ('+panels+' paneles)'));if(sub==='welcome')return i.reply(deny('👋 Welcome: '+(welcome?.enabled?'✅':'❌')));if(sub==='logs')return i.reply(deny('📋 Logs: '+(logs?'✅':'❌')));if(sub==='automod')return i.reply(deny('🤖 AutoMod: '+(autoRules?'✅':'❌')+' ('+autoRules+' reglas)'));if(sub==='vouches')return i.reply(deny('⭐ Vouches: '+(vouch?.enabled?'✅':'❌')));return i.reply(deny('⚙️ Configuración\n🎫 Tickets '+(panels?'✅':'❌')+'\n👋 Welcome '+(welcome?.enabled?'✅':'❌')+'\n⭐ Vouches '+(vouch?.enabled?'✅':'❌')+'\n🤖 AutoMod '+(autoRules?'✅':'❌')+'\n📋 Logs '+(logs?'✅':'❌')))}

    if(i.commandName==='health'){const started=Date.now();await prisma.$queryRawUnsafe('SELECT 1');const dbMs=Date.now()-started;const since=new Date(Date.now()-86400000);const commands24=await prisma.auditLog.count({where:{guildId:i.guildId,module:'command',createdAt:{gte:since}}});return i.reply(deny('🩺 Health Check\nPostgreSQL: 🟢 '+dbMs+' ms\nDiscord: 🟢 '+Math.max(0,Math.round(client.ws.ping))+' ms\nUptime: '+formatUptime(process.uptime())+'\nMemoria: '+Math.round(process.memoryUsage().rss/1024/1024)+' MB\nComandos 24h: '+commands24))}

    if(i.commandName==='backup'&&i.options.getSubcommand()==='restore'){
      if(!i.options.getBoolean('confirmar'))return i.reply(deny('Debes confirmar la restauración con confirmar: true.'));
      const dir=path.join(process.cwd(),'backups');const file=i.options.getString('archivo');
      if(path.basename(file)!==file||!file.startsWith('guild-'+i.guildId+'-')||!file.endsWith('.json'))return i.reply(deny('Archivo de backup no válido para este servidor.'));
      const backup=JSON.parse(await readFile(path.join(dir,file),'utf8'));
      if(backup?.id!==i.guildId)return i.reply(deny('El backup no pertenece a este servidor.'));
      if(backup.welcomeConfig)await prisma.welcomeConfig.upsert({where:{guildId:i.guildId},update:{enabled:backup.welcomeConfig.enabled,channelId:backup.welcomeConfig.channelId,message:backup.welcomeConfig.message,title:backup.welcomeConfig.title,description:backup.welcomeConfig.description,color:backup.welcomeConfig.color,image:backup.welcomeConfig.image,thumbnail:backup.welcomeConfig.thumbnail,footer:backup.welcomeConfig.footer,goodbyeEnabled:backup.welcomeConfig.goodbyeEnabled,goodbyeChannelId:backup.welcomeConfig.goodbyeChannelId,goodbyeMessage:backup.welcomeConfig.goodbyeMessage},create:{guildId:i.guildId,enabled:backup.welcomeConfig.enabled,channelId:backup.welcomeConfig.channelId,message:backup.welcomeConfig.message,title:backup.welcomeConfig.title,description:backup.welcomeConfig.description,color:backup.welcomeConfig.color,image:backup.welcomeConfig.image,thumbnail:backup.welcomeConfig.thumbnail,footer:backup.welcomeConfig.footer,goodbyeEnabled:backup.welcomeConfig.goodbyeEnabled,goodbyeChannelId:backup.welcomeConfig.goodbyeChannelId,goodbyeMessage:backup.welcomeConfig.goodbyeMessage}});
      if(backup.vouchConfig)await prisma.vouchConfig.upsert({where:{guildId:i.guildId},update:{enabled:backup.vouchConfig.enabled,channelId:backup.vouchConfig.channelId,allowedRoleIds:backup.vouchConfig.allowedRoleIds,cooldown:backup.vouchConfig.cooldown,title:backup.vouchConfig.title,description:backup.vouchConfig.description,color:backup.vouchConfig.color,image:backup.vouchConfig.image,thumbnail:backup.vouchConfig.thumbnail,footer:backup.vouchConfig.footer},create:{guildId:i.guildId,enabled:backup.vouchConfig.enabled,channelId:backup.vouchConfig.channelId,allowedRoleIds:backup.vouchConfig.allowedRoleIds,cooldown:backup.vouchConfig.cooldown,title:backup.vouchConfig.title,description:backup.vouchConfig.description,color:backup.vouchConfig.color,image:backup.vouchConfig.image,thumbnail:backup.vouchConfig.thumbnail,footer:backup.vouchConfig.footer}});
      if(backup.presenceConfig)await prisma.presenceConfig.upsert({where:{guildId:i.guildId},update:{enabled:backup.presenceConfig.enabled,type:backup.presenceConfig.type,text:backup.presenceConfig.text},create:{guildId:i.guildId,enabled:backup.presenceConfig.enabled,type:backup.presenceConfig.type,text:backup.presenceConfig.text}});
      if(backup.logConfig)await prisma.logConfig.upsert({where:{guildId:i.guildId},update:{channelId:backup.logConfig.channelId,events:backup.logConfig.events},create:{guildId:i.guildId,channelId:backup.logConfig.channelId,events:backup.logConfig.events}});
      for(const row of backup.autoResponders||[])await prisma.autoResponder.upsert({where:{id:row.id},update:{trigger:row.trigger,response:row.response,matchType:row.matchType,embedTitle:row.embedTitle,embedDescription:row.embedDescription,embedColor:row.embedColor,enabled:row.enabled},create:{id:row.id,guildId:i.guildId,trigger:row.trigger,response:row.response,matchType:row.matchType||'contains',embedTitle:row.embedTitle,embedDescription:row.embedDescription,embedColor:row.embedColor,enabled:row.enabled!==false}});
      for(const row of backup.autoModRules||[])await prisma.autoModRule.upsert({where:{guildId_type:{guildId:i.guildId,type:row.type}},update:{enabled:row.enabled,action:row.action,threshold:row.threshold,whitelist:row.whitelist||[],exceptions:row.exceptions||[]},create:{guildId:i.guildId,type:row.type,enabled:row.enabled,action:row.action,threshold:row.threshold,whitelist:row.whitelist||[],exceptions:row.exceptions||[]}});
      for(const panel of backup.panels||[]){
        const restored=await prisma.ticketPanel.upsert({where:{guildId_name:{guildId:i.guildId,name:panel.name}},update:{channelId:panel.channelId,title:panel.title,description:panel.description,color:panel.color,image:panel.image,thumbnail:panel.thumbnail,footer:panel.footer,active:panel.active},create:{guildId:i.guildId,name:panel.name,channelId:panel.channelId,title:panel.title,description:panel.description,color:panel.color,image:panel.image,thumbnail:panel.thumbnail,footer:panel.footer,active:panel.active}});
        for(const category of panel.categories||[]){
          const restoredCategory=await prisma.ticketCategory.upsert({where:{panelId_name:{panelId:restored.id,name:category.name}},update:{description:category.description,emoji:category.emoji,supportRoleIds:category.supportRoleIds,discordCategoryId:category.discordCategoryId},create:{panelId:restored.id,name:category.name,description:category.description,emoji:category.emoji,supportRoleIds:category.supportRoleIds,discordCategoryId:category.discordCategoryId}});
          for(const question of category.questions||[])await prisma.ticketQuestion.upsert({where:{categoryId_label:{categoryId:restoredCategory.id,label:question.label}},update:{placeholder:question.placeholder,required:question.required},create:{categoryId:restoredCategory.id,label:question.label,placeholder:question.placeholder,required:question.required}});
        }
      }
      await audit(i.guildId,i.user.id,'backup','restore',file);
      return i.reply(deny('💾 Backup restaurado. Los tickets históricos no fueron modificados.'));
    }

    if(i.commandName==='backup'){const sub=i.options.getSubcommand();const dir=path.join(process.cwd(),'backups');await mkdir(dir,{recursive:true});if(sub==='create'){const data=await prisma.guild.findUnique({where:{id:i.guildId},include:{welcomeConfig:true,vouchConfig:true,presenceConfig:true,panels:{include:{categories:{include:{questions:true}}}},autoResponders:true,logConfig:true,autoModRules:true}});const file='guild-'+i.guildId+'-'+Date.now()+'.json';await writeFile(path.join(dir,file),JSON.stringify(data,null,2),'utf8');return i.reply(deny('💾 Backup creado: `'+file+'`'))}const files=(await readdir(dir)).filter(x=>x.startsWith('guild-'+i.guildId+'-')&&x.endsWith('.json'));return i.reply(deny(files.length?files.map(x=>'• '+x).join('\n'):'No hay backups para este servidor.'))}
    if(i.commandName==='tickets'){
      const sub=i.options.getSubcommand();
      const staffSubs=new Set(['reclamar','liberar','adduser','removeuser','cerrar','reabrir','renombrar','mover','prioridad','stats','transcript']);
      if(staffSubs.has(sub)){
        if(sub==='stats'){const st=await ticketStats(i.guildId);return i.reply(deny('🎫 Estadísticas\nAbiertos: '+st.open+'\nCerrados: '+st.closed+'\nReclamos: '+st.claims+'\nCategorías: '+st.categories.length))}
        const ticket=await findTicket(i.guildId,i.options.getString('ticket'));
        if(!ticket)return i.reply(deny('Ticket no encontrado.'));
        if(sub==='reclamar'){const result=await claimTicket(ticket,i.user.id);await prisma.ticketStats.create({data:{guildId:i.guildId,staffId:i.user.id,userId:ticket.userId,categoryId:ticket.categoryId,action:'claimed'}});await audit(i.guildId,i.user.id,'tickets','claimed','ticket:'+ticket.id);return i.reply(deny(result.message))}
        if(sub==='liberar'){if(ticket.claimedById&&ticket.claimedById!==i.user.id&&!isAdmin(i))return i.reply(deny('Solo quien reclamó el ticket o un administrador puede liberarlo.'));await releaseTicket(ticket);return i.reply(deny('Ticket liberado.'))}
        const member=i.member;const isSupport=Boolean(member?.roles?.cache)&&ticket.category.supportRoleIds.some(x=>member.roles.cache.has(x));
        if(!isSupport&&!isAdmin(i)&&ticket.userId!==i.user.id)return i.reply(deny('No tienes permisos para gestionar este ticket.'));
        if(sub==='transcript'){if(!ticket.transcript?.html)return i.reply(deny('Este ticket no tiene una transcripción guardada.'));return i.reply({content:'Transcripción del ticket #'+ticket.number,files:[new AttachmentBuilder(Buffer.from(ticket.transcript.html,'utf8'),{name:'ticket-'+ticket.number+'.html'})],flags:64})}
        if(ticket.status==='closed'&&sub!=='reabrir')return i.reply(deny('Este ticket está cerrado.'));
        const channel=i.guild.channels.cache.get(ticket.channelId);
        if(sub==='adduser'){if(!channel)return i.reply(deny('El canal del ticket ya no existe.'));await addTicketUser(channel,i.options.getUser('usuario').id);return i.reply(deny('Usuario añadido al ticket.'))}
        if(sub==='removeuser'){if(!channel)return i.reply(deny('El canal del ticket ya no existe.'));const user=i.options.getUser('usuario');if(user.id===ticket.userId)return i.reply(deny('No puedes quitar al creador del ticket.'));await removeTicketUser(channel,user.id);return i.reply(deny('Usuario quitado del ticket.'))}
        if(sub==='cerrar'){if(!i.options.getBoolean('confirmar'))return i.reply(deny('Debes confirmar el cierre con confirmar: true.'));const reason=i.options.getString('razon')?.trim()||null;await closeTicket(i,ticket);await prisma.ticket.update({where:{id:ticket.id},data:{closedReason:reason}});return}
        if(sub==='reabrir'){
          const supportRoleIds=ticket.category.supportRoleIds.filter(id=>i.guild.roles.cache.has(id));
          if(!supportRoleIds.length)return i.reply(deny('La categoría ya no tiene roles de soporte válidos.'));
          const reopened=await i.guild.channels.create({name:clip(clean(ticket.category.name)+'-'+ticket.number,95),type:ChannelType.GuildText,parent:ticket.category.discordCategoryId&&i.guild.channels.cache.has(ticket.category.discordCategoryId)?ticket.category.discordCategoryId:undefined,permissionOverwrites:[{id:i.guild.roles.everyone.id,deny:['ViewChannel']},{id:ticket.userId,allow:['ViewChannel','SendMessages','ReadMessageHistory']},...supportRoleIds.map(id=>({id,allow:['ViewChannel','SendMessages','ReadMessageHistory']}))]});
          await prisma.ticket.update({where:{id:ticket.id},data:{status:'open',closedAt:null,closedReason:null,channelId:reopened.id,claimedById:null}});
          await prisma.ticketStats.create({data:{guildId:i.guildId,userId:ticket.userId,categoryId:ticket.categoryId,action:'reopened'}});
          await audit(i.guildId,i.user.id,'tickets','reopened','#'+ticket.number);
          await reopened.send({embeds:[new EmbedBuilder().setTitle('🔓 Ticket reabierto').setDescription('Ticket reabierto por '+i.user.toString()+'.').setColor(0x57F287)]});
          return i.reply(deny('Ticket reabierto en '+reopened.toString()+'.'));
        }
        if(!channel)return i.reply(deny('El canal del ticket ya no existe.'));
        if(sub==='renombrar'){await renameTicket(channel,i.options.getString('nombre'));return i.reply(deny('Ticket renombrado.'))}
        if(sub==='mover'){await moveTicket(channel,i.options.getChannel('categoria').id);return i.reply(deny('Ticket movido.'))}
        if(sub==='prioridad'){const priority=i.options.getString('nivel');await prisma.ticket.update({where:{id:ticket.id},data:{priority}});return i.reply(deny('Prioridad actualizada a **'+priority+'**.'))}
      }
      if(!isAdmin(i))return i.reply(deny('Necesitas permisos de administrador.'));

      if(sub==='log-reset'){
        await prisma.guild.update({where:{id:i.guildId},data:{logChannelId:null}});
        await audit(i.guildId,i.user.id,'tickets','log_reset','Configuración de logs eliminada.');
        return i.reply(deny('Configuración de logs eliminada.'));
      }

      if(sub==='panel-list'){
        const rows=await prisma.ticketPanel.findMany({
          where:{guildId:i.guildId},
          include:{categories:{select:{name:true}}}
        });
        if(!rows.length)return i.reply(deny('No hay paneles configurados.'));
        return i.reply(deny(rows.map(p=>'• **'+p.name+'** — '+p.categories.length+' categoría(s)').join('\n')));
      }

      if(sub==='panel-reset'){
        if(!i.options.getBoolean('confirmar')){
          return i.reply(deny('Debes confirmar el reinicio con **confirmar: true**.'));
        }

        const panels=await prisma.ticketPanel.findMany({
          where:{guildId:i.guildId},
          select:{id:true,name:true}
        });
        if(!panels.length)return i.reply(deny('No hay paneles configurados para reiniciar.'));

        await i.deferReply({flags:64});
        let ticketsClosed=0;
        for(const panel of panels){
          const categories=await prisma.ticketCategory.findMany({
            where:{panelId:panel.id},
            select:{id:true}
          });
          for(const category of categories){
            ticketsClosed+=await deleteOpenTicketsForCategory(i.guildId,category.id);
          }
        }

        await prisma.ticketPanel.deleteMany({where:{guildId:i.guildId}});
        await audit(i.guildId,i.user.id,'tickets','panel_reset','Reset total de '+panels.length+' panel(es).');

        return i.editReply(deny(
          '🧹 Configuración de tickets reiniciada. Se eliminaron **'+panels.length+' panel(es)** y se cerraron/eliminaron los canales de **'+ticketsClosed+' ticket(s) abierto(s)**.'
        ));
      }

      if(sub==='panel-renombrar'){
        const name=i.options.getString('nombre').trim();
        const newName=i.options.getString('nuevo-nombre').trim();

        if(!name||!newName)return i.reply(deny('El nombre actual y el nuevo nombre son obligatorios.'));
        if(newName.length>100)return i.reply(deny('El nuevo nombre no puede superar 100 caracteres.'));
        if(name.toLowerCase()===newName.toLowerCase()){
          return i.reply(deny('El nuevo nombre debe ser diferente al actual.'));
        }

        const found=await findUniquePanel(i.guildId,name);
        if(found.multiple)return i.reply(deny('Hay varios paneles con ese nombre. Usa nombres únicos de panel.'));
        if(!found.row)return i.reply(deny('Panel no encontrado.'));

        const conflict=await prisma.ticketPanel.findMany({
          where:{guildId:i.guildId,name:{equals:newName,mode:'insensitive'}},
          select:{id:true}
        });
        if(conflict.some(x=>x.id!==found.row.id)){
          return i.reply(deny('Ya existe otro panel con ese nombre.'));
        }

        try{
          await prisma.ticketPanel.update({
            where:{id:found.row.id},
            data:{name:newName}
          });
        }catch(e){
          if(e?.code==='P2002')return i.reply(deny('Ya existe otro panel con ese nombre.'));
          throw e;
        }

        await audit(i.guildId,i.user.id,'tickets','panel_renamed',name+' -> '+newName);
        return i.reply(deny('Panel renombrado: **'+name+'** → **'+newName+'**.'));
      }

      if(sub==='panel-eliminar'){
        const name=i.options.getString('nombre').trim();
        if(!i.options.getBoolean('confirmar'))return i.reply(deny('Debes confirmar la eliminación con confirmar: true.'));
        const found=await findUniquePanel(i.guildId,name);
        if(found.multiple)return i.reply(deny('Hay varios paneles con ese nombre. Renómbralos para que cada panel tenga un nombre único.'));
        if(!found.row)return i.reply(deny('Panel no encontrado.'));
        const categories=await prisma.ticketCategory.findMany({where:{panelId:found.row.id},select:{id:true,name:true}});
        let openCount=0;
        for(const c of categories)openCount+=await deleteOpenTicketsForCategory(i.guildId,c.id);
        await prisma.ticketPanel.delete({where:{id:found.row.id}});
        await audit(i.guildId,i.user.id,'tickets','panel_deleted',name);
        return i.reply(deny('Panel **'+name+'** eliminado. '+openCount+' ticket(s) abierto(s) fueron cerrados eliminando sus canales.'));
      }

      if(sub==='categoria-list'){
        const panelName=i.options.getString('panel').trim();
        const found=await findUniquePanel(i.guildId,panelName);
        if(found.multiple)return i.reply(deny('Hay varios paneles con ese nombre. Usa un nombre de panel único.'));
        if(!found.row)return i.reply(deny('Panel no encontrado.'));
        const rows=await prisma.ticketCategory.findMany({
          where:{panelId:found.row.id},
          orderBy:{name:'asc'},
          select:{name:true,description:true,supportRoleIds:true}
        });
        if(!rows.length)return i.reply(deny('Ese panel no tiene categorías.'));
        return i.reply(deny(rows.map(c=>'• **'+c.name+'** — '+(c.description||'Sin descripción')+' — soporte: '+c.supportRoleIds.length+' rol(es)').join('\n')));
      }

      if(sub==='categoria-eliminar'){
        const name=i.options.getString('nombre').trim();
        if(!i.options.getBoolean('confirmar'))return i.reply(deny('Debes confirmar la eliminación con confirmar: true.'));
        const found=await findUniqueCategory(i.guildId,name);
        if(found.multiple)return i.reply(deny('Hay varias categorías con ese nombre. Usa nombres únicos de categoría.'));
        if(!found.row)return i.reply(deny('Categoría no encontrada.'));
        const openCount=await deleteOpenTicketsForCategory(i.guildId,found.row.id);
        await prisma.ticketCategory.delete({where:{id:found.row.id}});
        await audit(i.guildId,i.user.id,'tickets','category_deleted',name);
        return i.reply(deny('Categoría **'+name+'** eliminada. '+openCount+' ticket(s) abierto(s) fueron cerrados eliminando sus canales.'));
      }

      if(sub==='pregunta-list'){
        const categoryName=i.options.getString('categoria').trim();
        const found=await findUniqueCategory(i.guildId,categoryName);
        if(found.multiple)return i.reply(deny('Hay varias categorías con ese nombre. Usa nombres únicos de categoría.'));
        if(!found.row)return i.reply(deny('Categoría no encontrada.'));
        const rows=await prisma.ticketQuestion.findMany({
          where:{categoryId:found.row.id},
          orderBy:{createdAt:'asc'},
          select:{label:true,required:true,placeholder:true}
        });
        if(!rows.length)return i.reply(deny('Esa categoría no tiene preguntas.'));
        return i.reply(deny(rows.map((q,n)=>(n+1)+'. **'+q.label+'**'+(q.required?' — obligatoria':' — opcional')+(q.placeholder?' — placeholder: '+q.placeholder:'')).join('\n')));
      }

      if(sub==='pregunta-eliminar'){
        const categoryName=i.options.getString('categoria').trim();
        const label=i.options.getString('label').trim();
        if(!i.options.getBoolean('confirmar'))return i.reply(deny('Debes confirmar la eliminación con confirmar: true.'));
        const found=await findUniqueCategory(i.guildId,categoryName);
        if(found.multiple)return i.reply(deny('Hay varias categorías con ese nombre. Usa nombres únicos de categoría.'));
        if(!found.row)return i.reply(deny('Categoría no encontrada.'));
        const q=await prisma.ticketQuestion.findFirst({
          where:{categoryId:found.row.id,label:{equals:label,mode:'insensitive'}}
        });
        if(!q)return i.reply(deny('Pregunta no encontrada.'));
        await prisma.ticketQuestion.delete({where:{id:q.id}});
        await audit(i.guildId,i.user.id,'tickets','question_deleted',found.row.name+' / '+q.label);
        return i.reply(deny('Pregunta eliminada de **'+found.row.name+'**.'));
      }

      if(sub==='log'){
        const ch=i.options.getChannel('canal');
        if(!ch?.isTextBased())return i.reply(deny('El canal indicado no es válido.'));
        await prisma.guild.update({where:{id:i.guildId},data:{logChannelId:ch.id}});
        await audit(i.guildId,i.user.id,'tickets','log_channel',ch.name);
        return i.reply(deny('Canal de logs configurado.'));
      }

      if(sub==='pregunta'){
        const categoryName=i.options.getString('categoria').trim();
        const matches=await prisma.ticketCategory.findMany({
          where:{name:{equals:categoryName,mode:'insensitive'},panel:{guildId:i.guildId}},
          select:{id:true,name:true,panelId:true}
        });
        if(matches.length>1)return i.reply(deny('Hay más de una categoría con ese nombre. Usa un nombre de categoría único.'));
        const c=matches[0];
        if(!c)return i.reply(deny('Categoría no encontrada.'));
        const n=await prisma.ticketQuestion.count({where:{categoryId:c.id}});
        if(n>=5)return i.reply(deny('Máximo 5 preguntas por categoría.'));

        try{
          await prisma.ticketQuestion.create({
            data:{
              category:{connect:{id:c.id}},
              label:i.options.getString('label').trim(),
              placeholder:i.options.getString('placeholder'),
              required:i.options.getBoolean('obligatoria')??true
            }
          });
        }catch(e){
          if(e?.code==='P2002')return i.reply(deny('Ya existe una pregunta con ese texto en esta categoría.'));
          throw e;
        }
        await audit(i.guildId,i.user.id,'tickets','question_added',c.name);
        return i.reply(deny('Pregunta añadida.'));
      }

      if(sub==='panel'){
        const ch=i.options.getChannel('canal');
        if(!ch?.isTextBased())return i.reply(deny('El canal indicado no es válido.'));
        const name=i.options.getString('nombre').trim();
        const rawColor=i.options.getString('color');
        const image=i.options.getString('imagen');
        const thumbnail=i.options.getString('thumbnail');
        if(!name)return i.reply(deny('El nombre del panel es obligatorio.'));
        if(rawColor&&!isHexColor(rawColor))return i.reply(deny('El color debe ser HEX de 6 dígitos, por ejemplo 5865F2.'));
        if(image&&!safeUrl(image))return i.reply(deny('La URL de imagen no es válida. Usa una URL http/https.'));
        if(thumbnail&&!safeUrl(thumbnail))return i.reply(deny('La URL del thumbnail no es válida. Usa una URL http/https.'));

        const data={
          name,
          channelId:ch.id,
          title:i.options.getString('titulo'),
          description:i.options.getString('descripcion'),
          color:rawColor,
          image,
          thumbnail,
          footer:i.options.getString('footer')
        };

        let p;
        try{
          p=await prisma.ticketPanel.create({
            data:{guild:{connect:{id:i.guildId}},...data}
          });
        }catch(e){
          if(e?.code==='P2002')return i.reply(deny('Ya existe un panel con ese nombre en este servidor.'));
          throw e;
        }
        await audit(i.guildId,i.user.id,'tickets','panel_created',p.name);
        return i.reply(deny('Panel creado: **'+p.name+'**.'));
      }

      if(sub==='categoria'){
        const panelName=i.options.getString('panel').trim();
        const panels=await prisma.ticketPanel.findMany({
          where:{name:{equals:panelName,mode:'insensitive'},guildId:i.guildId},
          select:{id:true,name:true}
        });
        if(panels.length>1)return i.reply(deny('Hay más de un panel con ese nombre. Usa un nombre de panel único.'));
        const p=panels[0];
        if(!p)return i.reply(deny('Panel no encontrado.'));

        const ids=roleIds(i.guild,i.options.getString('staff'));
        if(!ids.length)return i.reply(deny('Debes indicar al menos un rol de soporte válido.'));

        const discordCategory=i.options.getChannel('categoria-canal');
        if(discordCategory&&discordCategory.type!==ChannelType.GuildCategory){
          return i.reply(deny('La categoría Discord indicada no es válida.'));
        }

        const emojiValue=i.options.getString('emoji')?.trim()||null;
        if(emojiValue&&!emojiExists(i.guild,emojiValue)){
          return i.reply(deny('El emoji indicado no existe en este servidor. Usa un emoji Unicode o un emoji personalizado de este servidor.'));
        }

        let c;
        try{
          c=await prisma.ticketCategory.create({
            data:{
              panel:{connect:{id:p.id}},
              name:i.options.getString('nombre').trim(),
              description:i.options.getString('descripcion'),
              emoji:i.options.getString('emoji'),
              supportRoleIds:ids,
              discordCategoryId:discordCategory?.id||null
            }
          });
        }catch(e){
          if(e?.code==='P2002')return i.reply(deny('Ya existe una categoría con ese nombre en este panel.'));
          throw e;
        }
        await audit(i.guildId,i.user.id,'tickets','category_created',c.name);
        return i.reply(deny('Categoría creada: **'+c.name+'** en el panel **'+p.name+'**.'));
      }

      const panelName=i.options.getString('panel').trim();
      const panels=await prisma.ticketPanel.findMany({
        where:{name:{equals:panelName,mode:'insensitive'},guildId:i.guildId},
        include:{categories:true}
      });
      if(panels.length>1)return i.reply(deny('Hay más de un panel con ese nombre. Usa un nombre de panel único.'));
      const p=panels[0];
      if(!p)return i.reply(deny('Panel no encontrado.'));

      const ch=i.guild.channels.cache.get(p.channelId);
      if(!ch?.isTextBased())return i.reply(deny('El canal configurado del panel ya no existe.'));

      if(!p.categories.length)return i.reply(deny('El panel no tiene categorías.'));
      if(p.categories.length>25)return i.reply(deny('Discord permite un máximo de 25 categorías por panel. Elimina algunas categorías antes de publicarlo.'));

      const options=p.categories.map(c=>({
        label:c.name.slice(0,100),
        value:c.id,
        description:(c.description||'Abrir ticket').slice(0,100),
        ...(c.emoji?{emoji:normalizeEmoji(i.guild,c.emoji)}: {})
      }));

      const menu=new StringSelectMenuBuilder()
        .setCustomId('ticket:select:'+p.id)
        .setPlaceholder('Selecciona una categoría')
        .addOptions(options);

      const emb=new EmbedBuilder()
        .setTitle(clip(p.title||p.name,256))
        .setDescription(clip(p.description||'Selecciona una categoría.',4096))
        .setColor(color(p.color));

      const panelImage=safeUrl(p.image);
      const panelThumbnail=safeUrl(p.thumbnail);
      if(panelImage)emb.setImage(panelImage);
      if(panelThumbnail)emb.setThumbnail(panelThumbnail);
      if(p.footer)emb.setFooter({text:clip(p.footer,2048)});

      await ch.send({
        embeds:[emb],
        components:[new ActionRowBuilder().addComponents(menu)]
      });
      await audit(i.guildId,i.user.id,'tickets','panel_published',p.name);
      return i.reply(deny('Panel publicado.'));
    }
  }catch(e){
    logger.error('Interaction error',{error:e.message,stack:e.stack});
    if(!i.replied&&!i.deferred){
      await i.reply(deny(handleDiscordError(e))).catch(()=>{});
    }
  }
  });
}
