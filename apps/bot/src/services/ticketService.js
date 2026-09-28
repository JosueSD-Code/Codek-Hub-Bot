import { ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { prisma } from '../../../../packages/shared/src/index.js';

export async function findTicket(guildId,identifier){
  const value=String(identifier??'').trim();
  if(!value)return null;
  const exact=await prisma.ticket.findMany({where:{guildId,OR:[{id:value},{channelId:value}]},include:{category:true,transcript:true,answers:true}});
  if(exact.length===1)return exact[0];
  if(exact.length>1)throw new Error('TICKET_AMBIGUOUS');
  if(!/^\d+$/.test(value))return null;
  const rows=await prisma.ticket.findMany({where:{guildId,number:Number(value)},include:{category:true,transcript:true,answers:true},take:2});
  if(rows.length>1)throw new Error('TICKET_AMBIGUOUS');
  return rows[0]??null;
}

export async function claim(ticket,userId){
  const updated=await prisma.ticket.updateMany({where:{id:ticket.id,status:'open',claimedById:null},data:{claimedById:userId,claimedAt:new Date()}});
  if(!updated.count)throw new Error('El ticket ya está cerrado o reclamado.');
  await prisma.ticketClaim.create({data:{ticketId:ticket.id,userId}});
  return {message:'Ticket reclamado correctamente.',ticket:{...ticket,claimedById:userId}};
}

export async function release(ticket){
  await prisma.ticket.update({where:{id:ticket.id},data:{claimedById:null,claimedAt:null}});
  return {message:'Ticket liberado correctamente.'};
}

export async function addUser(channel,userId){await channel.permissionOverwrites.edit(userId,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true})}
export async function removeUser(channel,userId){await channel.permissionOverwrites.delete(userId)}
export async function rename(channel,name){return channel.setName(String(name).trim().slice(0,95))}
export async function move(channel,categoryId){return channel.setParent(categoryId,{lockPermissions:false})}

export async function stats(guildId){
  const [open,closed,claims,categories]=await Promise.all([
    prisma.ticket.count({where:{guildId,status:'open'}}),
    prisma.ticket.count({where:{guildId,status:'closed'}}),
    prisma.ticketClaim.count({where:{ticket:{guildId}}}),
    prisma.ticketCategory.findMany({where:{panel:{guildId}},select:{id:true,name:true,_count:{select:{tickets:true}}}})
  ]);
  return {open,closed,claims,categories};
}

export function createTicketRuntime({client,logger,audit,renderVariables,context,clip,deny,logToChannel}){
  const locks=new Set();
  const closeLocks=new Set();
  const clean=v=>String(v||'ticket').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,45)||'ticket';

  async function findUniquePanel(guildId,name){
    const rows=await prisma.ticketPanel.findMany({where:{guildId,name:{equals:String(name??'').trim(),mode:'insensitive'}},select:{id:true,name:true,channelId:true}});
    return {row:rows[0]||null,multiple:rows.length>1};
  }

  async function findUniqueCategory(guildId,name){
    const rows=await prisma.ticketCategory.findMany({where:{name:{equals:String(name??'').trim(),mode:'insensitive'},panel:{guildId}},select:{id:true,name:true,panelId:true}});
    return {row:rows[0]||null,multiple:rows.length>1};
  }

  async function deleteOpenTicketsForCategory(guildId,categoryId){
    const tickets=await prisma.ticket.findMany({where:{guildId,categoryId,status:'open'},select:{id:true,channelId:true}});
    for(const ticket of tickets){const channel=client.channels.cache.get(ticket.channelId);if(channel?.isTextBased())await channel.delete().catch(e=>logger.warn('Ticket channel delete failed',{error:e.message}))}
    return tickets.length;
  }

  async function createTicket(i,cat,answers=[]){
    const key=i.guildId+':'+cat.id+':'+i.user.id;
    if(locks.has(key))return i.reply(deny('Ya se está creando tu ticket.'));
    locks.add(key);
    let ch=null;
    try{
      if(!i.replied&&!i.deferred)await i.deferReply({flags:64});
      const supportRoleIds=cat.supportRoleIds.filter(id=>i.guild.roles.cache.has(id));
      if(!supportRoleIds.length)return i.editReply(deny('Esta categoría no tiene ningún rol de soporte válido.'));
      ch=await i.guild.channels.create({
        name:clip(clean(cat.name)+'-pending',95),type:ChannelType.GuildText,
        parent:cat.discordCategoryId&&i.guild.channels.cache.has(cat.discordCategoryId)?cat.discordCategoryId:undefined,
        permissionOverwrites:[
          {id:i.guild.roles.everyone.id,deny:['ViewChannel']},
          {id:i.user.id,allow:['ViewChannel','SendMessages','ReadMessageHistory']},
          ...supportRoleIds.map(id=>({id,allow:['ViewChannel','SendMessages','ReadMessageHistory']}))
        ]
      });
      let t,n;
      try{
        ({t,n}=await prisma.$transaction(async tx=>{
          const k='codek:'+i.guildId+':'+cat.id;
          while(true){
            const rows=await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${k})) AS locked`;
            if(Boolean(rows[0]?.locked))break;
            await new Promise(resolve=>setTimeout(resolve,25));
          }
          const old=await tx.ticket.findFirst({where:{guildId:i.guildId,categoryId:cat.id,userId:i.user.id,status:'open'},select:{channelId:true}});
          if(old){const error=new Error('TICKET_DUPLICATE');error.channelId=old.channelId;throw error}
          const last=await tx.ticket.findFirst({where:{guildId:i.guildId,categoryId:cat.id},orderBy:{number:'desc'},select:{number:true}});
          n=(last?.number||0)+1;
          const ticket=await tx.ticket.create({data:{guildId:i.guildId,categoryId:cat.id,userId:i.user.id,channelId:ch.id,number:n,answers:answers.length?{create:answers}:undefined}});
          return {t:ticket,n};
        }));
      }catch(e){
        await ch.delete().catch(()=>{});
        if(e.message==='TICKET_DUPLICATE'){const oldChannel=i.guild.channels.cache.get(e.channelId);return i.editReply(deny(oldChannel?'Ya tienes un ticket abierto: '+oldChannel:'Ya tienes un ticket abierto para esta categoría.'))}
        throw e;
      }
      await ch.edit({name:clip(clean(cat.name)+'-'+n,95)}).catch(e=>logger.warn('Ticket rename failed',{error:e.message}));
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:claim:'+t.id).setLabel('Reclamar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket:close:'+t.id).setLabel('Cerrar ticket').setStyle(ButtonStyle.Danger)
      );
      const ticketContext=context(i.user,i.guild,ch,{ticket:String(n),category:cat.name,staff:supportRoleIds.map(x=>'<@&'+x+'>').join(' ')});
      const answersText=answers.length?'\n\n'+answers.map(x=>'**'+renderVariables(x.label,ticketContext)+':** '+renderVariables(x.answer,ticketContext)).join('\n'):'';
      const ticketEmbed=new EmbedBuilder().setTitle(clip(renderVariables('Ticket • '+cat.name,ticketContext),256)).setDescription(clip(renderVariables(cat.description||'El equipo te atenderá pronto.',ticketContext)+answersText,4096)).setColor(0x5865F2).setThumbnail(i.user.displayAvatarURL({size:512})).setTimestamp();
      await ch.send({content:clip(i.user.toString()+' '+supportRoleIds.map(x=>'<@&'+x+'>').join(' '),2000),embeds:[ticketEmbed],components:[row]});
      await prisma.ticketStats.create({data:{guildId:i.guildId,userId:i.user.id,categoryId:cat.id,action:'created'}});
      await audit(i.guildId,i.user.id,'tickets','created',cat.name+' #'+n);
      return i.editReply(deny('Ticket creado: '+ch));
    }catch(e){
      logger.error('Ticket creation failed',{error:e.message});
      if(ch)await ch.delete().catch(()=>{});
      return (i.replied||i.deferred?i.editReply(deny('No se pudo crear el ticket. Revisa los permisos del bot y la configuración de la categoría.')):i.reply(deny('No se pudo crear el ticket. Revisa los permisos del bot y la configuración de la categoría.'))).catch(()=>{});
    }finally{locks.delete(key)}
  }

  async function transcript(ch,t){
    const messages=[];let before;
    while(true){const batch=await ch.messages.fetch({limit:100,before});if(!batch.size)break;messages.push(...batch.values());if(batch.size<100)break;before=batch.last()?.id;if(!before)break}
    const xs=messages.reverse();const esc=x=>String(x??'').replace(/[&<>"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
    const answers=t.answers?.length?'<h2>Respuestas</h2><ul>'+t.answers.map(a=>'<li><b>'+esc(a.label)+'</b>: '+esc(a.answer)+'</li>').join('')+'</ul>':'';
    return '<!doctype html><html><head><meta charset="utf-8"><title>Ticket #'+esc(t.number)+'</title></head><body><h1>Ticket #'+esc(t.number)+'</h1><p>Usuario: '+esc(t.user?.tag||t.user?.username||'Usuario')+'<br>Categoría: '+esc(t.category.name)+'<br>Creado: '+esc(t.createdAt.toISOString())+'</p>'+answers+xs.map(m=>{const attachments=[...m.attachments.values()].map(a=>a.url);const content=esc(m.content||'[sin texto]');const files=attachments.length?'<br>Archivos: '+attachments.map(esc).join(' | '):'';return '<p><b>'+esc(m.author?.tag||m.author?.username||'Usuario')+'</b> '+esc(new Date(m.createdTimestamp).toISOString())+'<br>'+content+files+'</p>'}).join('')+'</body></html>';
  }

  async function closeTicket(i,t){
    if(closeLocks.has(t.id))return i.reply(deny('El cierre ya está en proceso.'));
    closeLocks.add(t.id);
    if(!i.replied&&!i.deferred)await i.deferReply({flags:64});
    try{
      const html=await transcript(i.channel,t);const closedAt=new Date();
      const updated=await prisma.ticket.updateMany({where:{id:t.id,status:'open'},data:{status:'closed',closedAt}});
      if(!updated.count)return i.editReply(deny('Este ticket ya fue cerrado o está siendo cerrado.'));
      await prisma.ticketTranscript.upsert({where:{ticketId:t.id},update:{html},create:{ticketId:t.id,html}});
      await prisma.ticketStats.create({data:{guildId:i.guildId,userId:t.userId,staffId:i.user.id,categoryId:t.categoryId,action:'closed',duration:Math.max(0,Math.floor((closedAt.getTime()-t.createdAt.getTime())/1000))}});
      await audit(i.guildId,i.user.id,'tickets','closed','#'+t.number);
      await logToChannel?.(i.guild,'Ticket cerrado','Ticket **#'+t.number+'** cerrado por <@'+i.user.id+'>.');
      const g=await prisma.guild.findUnique({where:{id:i.guildId},select:{logChannelId:true}});const lc=g?.logChannelId?i.guild.channels.cache.get(g.logChannelId):null;
      if(lc?.isTextBased())await lc.send({content:'Transcripción del ticket #'+t.number,files:[{attachment:Buffer.from(html,'utf8'),name:'ticket-'+t.number+'.html'}]});
      await i.editReply(deny('Ticket cerrado. Transcripción guardada.'));setTimeout(()=>i.channel?.delete().catch(()=>{}),2500);
    }catch(e){logger.error('Ticket close failed',{error:e.message});if(i.replied||i.deferred)await i.editReply(deny('No se pudo cerrar el ticket.')).catch(()=>{});else await i.reply(deny('No se pudo cerrar el ticket.')).catch(()=>{})}
    finally{closeLocks.delete(t.id)}
  }

  return {findUniquePanel,findUniqueCategory,deleteOpenTicketsForCategory,createTicket,closeTicket};
}