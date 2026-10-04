import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

export async function handleComponentInteraction(i,{client,prisma,deny,clip,safeUrl,color,context,renderVariables,audit,createTicket,closeTicket,cooldowns}){
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
      const canClaim=Boolean(member?.roles?.cache)&&Boolean(t.category?.supportRoleIds?.some(x=>member.roles.cache.has(x)));
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
      const isSupport=Boolean(member?.roles?.cache)&&Boolean(t.category?.supportRoleIds?.some(x=>member.roles.cache.has(x)));
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
      const isSupport=Boolean(member?.roles?.cache)&&Boolean(t.category?.supportRoleIds?.some(x=>member.roles.cache.has(x)));
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
      const questions=c.questions.slice(0,5);
      const a=[];
      for(const q of questions){
        const field=i.fields.fields.get(q.id);
        if(!field&&q.required){
          return i.reply(deny('El formulario cambió mientras respondías. Vuelve a abrir el formulario para continuar.'));
        }
        if(field){
          a.push({label:q.label,answer:String(field.value??'').trim()});
        }
      }
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

      let createdVouch;
      try{
        createdVouch=await prisma.$transaction(async tx=>{
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'codek:vouch:'+i.guildId+':'+i.user.id}))`;

          const dbLast=await tx.vouch.findFirst({
            where:{guildId:i.guildId,reviewerId:i.user.id},
            orderBy:{createdAt:'desc'},
            select:{createdAt:true}
          });
          if(dbLast&&Date.now()-dbLast.createdAt.getTime()<c.cooldown*1000){
            throw new Error('VOUCH_COOLDOWN');
          }

          const dayStart=new Date(Date.now()-24*60*60*1000);
          const dailyCount=await tx.vouch.count({
            where:{guildId:i.guildId,reviewerId:i.user.id,createdAt:{gte:dayStart}}
          });
          if(dailyCount>=10)throw new Error('VOUCH_DAILY_LIMIT');

          const duplicate=await tx.vouch.findFirst({
            where:{guildId:i.guildId,targetId,reviewerId:i.user.id}
          });
          if(duplicate)throw new Error('VOUCH_DUPLICATE');

          return tx.vouch.create({
            data:{
              guildId:i.guildId,
              targetId,
              reviewerId:i.user.id,
              reviewType:type,
              rating,
              text
            }
          });
        });
      }catch(e){
        if(e?.message==='VOUCH_COOLDOWN')return i.reply(deny('Espera antes de enviar otro vouch.'));
        if(e?.message==='VOUCH_DAILY_LIMIT')return i.reply(deny('Has alcanzado el límite de **10 vouches por día**.'));
        if(e?.message==='VOUCH_DUPLICATE'||e?.code==='P2002')return i.reply(deny('Ya has dejado un vouch para este usuario.'));
        throw e;
      }

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


  return false;
}
