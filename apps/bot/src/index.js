import {
  Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActivityType, AttachmentBuilder
} from 'discord.js';
import {
  loadEnvironment, logger, renderVariables, prisma,
  ensureGuild, findAutoResponder, audit
} from '../../../packages/shared/src/index.js';

const env=loadEnvironment();
const client=new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const cooldowns=new Map();
const locks=new Set();
const closeLocks=new Set();
import { ADMIN,isAdmin,deny,roleIdsByName } from './utils/permissions.js';
import { clip,safeUrl,isHexColor,requiredText } from './utils/validation.js';
import { color } from './utils/embeds.js';
import { applyCooldown } from './middleware/rateLimit.js';
import { checkBotPermissions } from './middleware/botPermissions.js';
import { handleDiscordError } from './middleware/validation.js';
import { recordModeration, history as moderationHistory, parseDuration } from './services/moderationService.js';
import { processAutoMod } from './services/automodService.js';
import { serverStats, botStats } from './services/statsService.js';
import { findTicket, claim as claimTicket, release as releaseTicket, addUser as addTicketUser, removeUser as removeTicketUser, rename as renameTicket, move as moveTicket, stats as ticketStats } from './services/ticketService.js';
import { create as createGiveaway, toggleParticipant, end as endGiveaway, cancel as cancelGiveaway } from './services/giveawayService.js';
import { registerEvents } from './handlers/eventHandler.js';
import { configureDiscordLogger, sendConsoleLog } from './utils/logger.js';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { registerInteractionHandler } from './handlers/interactionHandler.js';
import { createLogService } from './services/logService.js';

import { commands } from './commands.js';

const roleIds=(g,v)=>roleIdsByName(g,v);
const clean=v=>String(v||'ticket').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')
  .replace(/^-+|-+$/g,'').slice(0,45)||'ticket';
const normalizeEmoji=(guild,value)=>{
  const raw=String(value||'').trim();
  if(!raw)return null;

  const custom=raw.match(/^<a?:([\w~]+):(\d+)>$/);
  if(custom){
    const emoji=guild?.emojis?.cache?.get(custom[2]);
    if(!emoji)return null;
    return {id:emoji.id,name:emoji.name||custom[1],animated:emoji.animated};
  }

  const byName=guild?.emojis?.cache?.find(e=>e.name?.toLowerCase()===raw.toLowerCase());
  if(byName){
    return {id:byName.id,name:byName.name||raw,animated:byName.animated};
  }

  return raw;
};

const emojiExists=(guild,value)=>Boolean(normalizeEmoji(guild,value));
const context=(u,g,ch,extra={})=>{
  const avatar=u?.displayAvatarURL?.({size:1024,extension:'png'})||u?.displayAvatarURL?.()||'';
  const guildIcon=g?.iconURL?.({size:1024,extension:'png'})||'';
  return {
    user:u?.toString?.()||'user',
    mention:u?.toString?.()||'user',
    username:u?.username||'user',
    tag:u?.tag||u?.username||'user',
    usertag:u?.tag||u?.username||'user',
    displayname:u?.globalName||u?.displayName||u?.username||'user',
    displayname_raw:u?.globalName||u?.displayName||u?.username||'user',
    useravatar:avatar,
    avatar,
    user_avatar:avatar,
    server:g?.name||'server',
    guild:g?.name||'server',
    membercount:g?.memberCount??0,
    guildicon:guildIcon,
    servericon:guildIcon,
    channel:ch?.toString?.()||'channel',
    channelname:ch?.name||'channel',
    ...extra
  };
};

function helpEmbed(){
  return new EmbedBuilder()
    .setAuthor({name:'Codek Hub',iconURL:client.user?.displayAvatarURL({size:128})})
    .setTitle('✨ Codek Hub • Centro de ayuda')
    .setDescription('Todo lo que puedo hacer en este servidor, organizado en un solo lugar.')
    .setColor(0x5865F2)
    .addFields(
      {name:'🎫 Tickets',value:[
        '/tickets panel • categoria • pregunta • publicar',
        '/tickets reclamar • liberar • adduser • removeuser',
        '/tickets cerrar • reabrir • renombrar • mover • prioridad',
        '/tickets stats • transcript',
        '/tickets panel-list • panel-renombrar • panel-eliminar • panel-reset',
        '/tickets categoria-list • categoria-eliminar',
        '/tickets pregunta-list • pregunta-eliminar',
        '/tickets log • log-reset'
      ].join('\n')},
      {name:'👋 Bienvenida',value:'/welcome set • reset • test • preview'},
      {name:'⭐ Vouches',value:'/vouch\n/vouch-config set\n/vouch-config reset'},
      {name:'🤖 Autoresponders',value:'/autoresponder add\n/autoresponder remove\n/autoresponder list'},
      {name:'🎮 Rich Presence',value:'/presence set\n/presence reset'},
      {name:'🧩 Variables',value:'/variables'},
      {name:'🛡️ Moderación',value:'/warn • /mute • /unmute • /kick • /ban • /unban\n/timeout • /untimeout • /history • /clear\n/purge cantidad:100 • ?purge 100 • ?purge canal'},
      {name:'📋 Logs',value:'/logs set • /logs disable • /logs status'},
      {name:'🤖 AutoMod',value:'/automod setup • spam • links • invites • words • mentions • caps'},
      {name:'🎉 Giveaways',value:'/giveaway create • end • reroll • cancel • list'},
      {name:'📊 Estadísticas',value:'/stats server • /stats bot • /vouches view • /vouches top • /vouches stats'},
      {name:'⚙️ Configuración',value:'/config status • tickets • welcome • logs • automod • vouches\n/health • /backup create • /backup list • /backup restore'},
      {name:'ℹ️ Ayuda rápida',value:'También puedes mencionar a @Codek Hub y escribir **help**, **ayuda** o **comandos**.'}
    )
    .setFooter({text:'Los comandos de configuración requieren permisos de administrador.'})
    .setTimestamp();
}

const {logToChannel}=createLogService(prisma,logger);

async function presence(){
  const p=await prisma.presenceConfig.findFirst({
    where:{enabled:true},
    orderBy:{updatedAt:'desc'}
  });
  if(!p||!client.user){
    return client.user?.setPresence({activities:[],status:'online'});
  }
  const t={Playing:ActivityType.Playing,Watching:ActivityType.Watching,Listening:ActivityType.Listening};
  client.user.setPresence({
    activities:[{name:p.text,type:t[p.type]??ActivityType.Watching}],
    status:'online'
  });
}

async function deploy(){
  const rest=new REST({version:'10'}).setToken(env.DISCORD_TOKEN);
  const body=commands.map(c=>c.toJSON());

  // Registrar siempre los comandos como comandos de servidor para que
  // los cambios aparezcan inmediatamente en todos los servidores donde
  // está instalado el bot. Se limpian los comandos globales para evitar
  // duplicados entre versiones globales y de servidor.
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID),{body:[]});

  let deployed=0;
  for(const guild of client.guilds.cache.values()){
    try{
      await rest.put(
        Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID,guild.id),
        {body}
      );
      deployed++;
    }catch(e){
      logger.warn('Could not deploy guild commands',{
        guildId:guild.id,
        error:e.message
      });
    }
  }

  logger.info('Commands deployed to guilds',{
    count:body.length,
    guilds:deployed
  });
}

async function purgeChannelMessages(channel,limit=100){
  if(!channel?.isTextBased?.()||!channel?.messages?.fetch)return 0;

  const max=Math.max(1,Math.min(Number(limit)||1,10000));
  let remaining=max;
  let deleted=0;
  let before;

  while(remaining>0){
    const batch=await channel.messages.fetch({
      limit:Math.min(100,remaining),
      ...(before?{before}:{})
    });
    if(!batch.size)break;

    const now=Date.now();
    const recent=[];
    const old=[];

    for(const message of batch.values()){
      if(now-message.createdTimestamp<14*24*60*60*1000)recent.push(message);
      else old.push(message);
    }

    if(recent.length){
      const removed=await channel.bulkDelete(recent,true);
      deleted+=removed.size;
      remaining-=removed.size;
    }

    for(const message of old){
      if(remaining<=0)break;
      try{
        await message.delete();
        deleted++;
        remaining--;
      }catch(e){
        logger.warn('Old message delete failed',{error:e.message});
      }
    }

    before=batch.last()?.id;
    if(!before)break;
  }

  return deleted;
}

async function purgeEverything(channel){
  let total=0;
  while(true){
    const deleted=await purgeChannelMessages(channel,100);
    total+=deleted;
    if(deleted===0||deleted<100)break;
  }
  return total;
}

async function findUniquePanel(guildId,name){
  const rows=await prisma.ticketPanel.findMany({
    where:{guildId,name:{equals:String(name??'').trim(),mode:'insensitive'}},
    select:{id:true,name:true,channelId:true}
  });
  return {row:rows[0]||null,multiple:rows.length>1};
}

async function findUniqueCategory(guildId,name){
  const rows=await prisma.ticketCategory.findMany({
    where:{name:{equals:String(name??'').trim(),mode:'insensitive'},panel:{guildId}},
    select:{id:true,name:true,panelId:true}
  });
  return {row:rows[0]||null,multiple:rows.length>1};
}

async function deleteOpenTicketsForCategory(guildId,categoryId){
  const tickets=await prisma.ticket.findMany({
    where:{guildId,categoryId,status:'open'},
    select:{id:true,channelId:true}
  });
  for(const ticket of tickets){
    const channel=client.channels.cache.get(ticket.channelId);
    if(channel?.isTextBased())await channel.delete().catch(e=>logger.warn('Ticket channel delete failed',{error:e.message}));
  }
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
    if(!supportRoleIds.length){
      return i.editReply(deny('Esta categoría no tiene ningún rol de soporte válido.'));
    }

    const overwrites=[
      {id:i.guild.roles.everyone.id,deny:['ViewChannel']},
      {id:i.user.id,allow:['ViewChannel','SendMessages','ReadMessageHistory']},
      ...supportRoleIds.map(id=>({
        id,
        allow:['ViewChannel','SendMessages','ReadMessageHistory']
      }))
    ];

    ch=await i.guild.channels.create({
      name:clip(clean(cat.name)+'-pending',95),
      type:ChannelType.GuildText,
      parent:cat.discordCategoryId&&i.guild.channels.cache.has(cat.discordCategoryId)?cat.discordCategoryId:undefined,
      permissionOverwrites:overwrites
    });

    let t;
    let n;
    try{
      ({t,n}=await prisma.$transaction(async tx=>{
        const k='codek:'+i.guildId+':'+cat.id;
        let locked=false;

        while(!locked){
          const rows=await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${k})) AS locked`;          locked=Boolean(rows[0]?.locked);
          if(!locked)await new Promise(resolve=>setTimeout(resolve,25));
        }

        const old=await tx.ticket.findFirst({
          where:{guildId:i.guildId,categoryId:cat.id,userId:i.user.id,status:'open'},
          select:{channelId:true}
        });
        if(old){
          const error=new Error('TICKET_DUPLICATE');
          error.channelId=old.channelId;
          throw error;
        }

        const last=await tx.ticket.findFirst({
          where:{guildId:i.guildId,categoryId:cat.id},
          orderBy:{number:'desc'},
          select:{number:true}
        });
        n=(last?.number||0)+1;

        const ticket=await tx.ticket.create({
          data:{
            guildId:i.guildId,
            categoryId:cat.id,
            userId:i.user.id,
            channelId:ch.id,
            number:n,
            answers:answers.length?{create:answers}:undefined
          }
        });
        return {t:ticket,n};
      }));
    }catch(e){
      await ch.delete().catch(()=>{});
      if(e.message==='TICKET_DUPLICATE'){
        const oldChannel=i.guild.channels.cache.get(e.channelId);
        return i.editReply(deny(oldChannel?'Ya tienes un ticket abierto: '+oldChannel:'Ya tienes un ticket abierto para esta categoría.'));
      }
      throw e;
    }

    await ch.edit({name:clip(clean(cat.name)+'-'+n,95)}).catch(e=>logger.warn('Ticket rename failed',{error:e.message}));

    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:claim:'+t.id).setLabel('Reclamar').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket:close:'+t.id).setLabel('Cerrar ticket').setStyle(ButtonStyle.Danger)
    );
    const ticketContext=context(i.user,i.guild,ch,{
      ticket:String(n),
      category:cat.name,
      staff:supportRoleIds.map(x=>'<@&'+x+'>').join(' '),
    });
    const a=answers.length?'\n\n'+answers.map(x=>'**'+renderVariables(x.label,ticketContext)+':** '+renderVariables(x.answer,ticketContext)).join('\n'):'';

    const ticketEmbed=new EmbedBuilder()
      .setTitle(clip(renderVariables('Ticket • '+cat.name,ticketContext),256))
      .setDescription(clip(renderVariables(cat.description||'El equipo te atenderá pronto.',ticketContext)+a,4096))
      .setColor(0x5865F2)
      .setThumbnail(i.user.displayAvatarURL({size:512}))
      .setTimestamp();

    await ch.send({
      content:clip(i.user.toString()+' '+supportRoleIds.map(x=>'<@&'+x+'>').join(' '),2000),
      embeds:[ticketEmbed],
      components:[row]
    });

    await prisma.ticketStats.create({data:{guildId:i.guildId,userId:i.user.id,categoryId:cat.id,action:'created'}});
    await audit(i.guildId,i.user.id,'tickets','created',cat.name+' #'+n);
    await logToChannel(i.guild,'Ticket creado','<@'+i.user.id+'> creó **'+cat.name+' #'+n+'**.');
    return i.editReply(deny('Ticket creado: '+ch));
  }catch(e){
    logger.error('Ticket creation failed',{error:e.message});
    if(ch)await ch.delete().catch(()=>{});
    return (i.replied||i.deferred?i.editReply(deny('No se pudo crear el ticket. Revisa los permisos del bot y la configuración de la categoría.')):i.reply(deny('No se pudo crear el ticket. Revisa los permisos del bot y la configuración de la categoría.'))).catch(()=>{});
  }finally{
    locks.delete(key);
  }
}

async function transcript(ch,t){
  const messages=[];
  let before;

  while(true){
    const batch=await ch.messages.fetch({limit:100,before});
    if(!batch.size)break;
    messages.push(...batch.values());
    if(batch.size<100)break;
    before=batch.last()?.id;
    if(!before)break;
  }

  const xs=messages.reverse();
  const esc=x=>String(x??'').replace(/[&<>"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
  const answers=t.answers?.length
    ?'<h2>Respuestas</h2><ul>'+t.answers.map(a=>'<li><b>'+esc(a.label)+'</b>: '+esc(a.answer)+'</li>').join('')+'</ul>'
    :'';

  return '<!doctype html><html><head><meta charset="utf-8"><title>Ticket #'+esc(t.number)+'</title></head><body>'+
    '<h1>Ticket #'+esc(t.number)+'</h1>'+
    '<p>Usuario: '+esc(t.user?.tag||t.user?.username||'Usuario')+'<br>Categoría: '+esc(t.category.name)+'<br>Creado: '+esc(t.createdAt.toISOString())+'</p>'+
    answers+
    xs.map(m=>{
      const attachments=[...m.attachments.values()].map(a=>a.url);
      const content=esc(m.content||'[sin texto]');
      const files=attachments.length?'<br>Archivos: '+attachments.map(esc).join(' | '):'';
      return '<p><b>'+esc(m.author?.tag||m.author?.username||'Usuario')+'</b> '+esc(new Date(m.createdTimestamp).toISOString())+'<br>'+content+files+'</p>';
    }).join('')+
    '</body></html>';
}

async function closeTicket(i,t){
  if(closeLocks.has(t.id))return i.reply(deny('El cierre ya está en proceso.'));
  closeLocks.add(t.id);
  if(!i.replied&&!i.deferred)await i.deferReply({flags:64});
  try{
    const html=await transcript(i.channel,t);
    const closedAt=new Date();
    const updated=await prisma.ticket.updateMany({
      where:{id:t.id,status:'open'},
      data:{status:'closed',closedAt}
    });
    if(!updated.count){
      return i.editReply(deny('Este ticket ya fue cerrado o está siendo cerrado.'));
    }
    await prisma.ticketTranscript.upsert({
      where:{ticketId:t.id},
      update:{html},
      create:{ticketId:t.id,html}
    });
    await prisma.ticketStats.create({data:{guildId:i.guildId,userId:t.userId,staffId:i.user.id,categoryId:t.categoryId,action:'closed',duration:Math.max(0,Math.floor((closedAt.getTime()-t.createdAt.getTime())/1000))}});
    await audit(i.guildId,i.user.id,'tickets','closed','#'+t.number);
    await logToChannel(i.guild,'Ticket cerrado','Ticket **#'+t.number+'** cerrado por <@'+i.user.id+'>.');

    const g=await prisma.guild.findUnique({where:{id:i.guildId},select:{logChannelId:true}});
    const lc=g?.logChannelId?i.guild.channels.cache.get(g.logChannelId):null;
    if(lc?.isTextBased()){
      await lc.send({
        content:'Transcripción del ticket #'+t.number,
        files:[{attachment:Buffer.from(html,'utf8'),name:'ticket-'+t.number+'.html'}]
      });
    }

    await i.editReply(deny('Ticket cerrado. Transcripción guardada.'));
    setTimeout(()=>i.channel?.delete().catch(()=>{}),2500);
  }catch(e){
    logger.error('Ticket close failed',{error:e.message});
    if(i.replied||i.deferred)await i.editReply(deny('No se pudo cerrar el ticket.')).catch(()=>{}); else await i.reply(deny('No se pudo cerrar el ticket.')).catch(()=>{});
  }finally{
    closeLocks.delete(t.id);
  }
}









let shuttingDown=false;

async function shutdown(signal,exitCode=0){
  if(shuttingDown)return;
  shuttingDown=true;
  logger.info('Shutting down Codek Hub',{signal});
  try{client.destroy();}catch(e){logger.warn('Discord shutdown failed',{error:e.message});}
  try{await prisma.$disconnect();}catch(e){logger.warn('Database shutdown failed',{error:e.message});}
  process.exit(exitCode);
}

process.on('SIGINT',()=>{void shutdown('SIGINT',0);});
process.on('SIGTERM',()=>{void shutdown('SIGTERM',0);});
process.on('unhandledRejection',reason=>{
  logger.error('Unhandled promise rejection',{error:String(reason?.stack||reason)});
});
process.on('uncaughtException',error=>{
  logger.error('Uncaught exception',{error:error.stack||error.message});
  void shutdown('uncaughtException',1);
});

registerInteractionHandler(client,{prisma,logger,commands,env,ADMIN,isAdmin,deny,roleIds,clip,safeUrl,color,normalizeEmoji,emojiExists,context,findUniquePanel,findUniqueCategory,deleteOpenTicketsForCategory,createTicket,closeTicket,locks,findTicket,claimTicket,releaseTicket,addTicketUser,removeTicketUser,renameTicket,moveTicket,ticketStats,recordModeration,moderationHistory,parseDuration,processAutoMod,serverStats,botStats,createGiveaway,toggleParticipant,endGiveaway,cancelGiveaway,audit,handleDiscordError,renderVariables,presence,purgeChannelMessages,purgeEverything,helpEmbed,validChannel,commandsForHandler:commands});

registerEvents(client,{prisma,processAutoMod,endGiveaway,logToChannel,renderVariables,context,clip,configureDiscordLogger,sendConsoleLog,logger,ensureGuild,deploy,presence,ADMIN,helpEmbed,findAutoResponder,color,safeUrl,audit,purgeChannelMessages,purgeEverything});

client.login(env.DISCORD_TOKEN).catch(e=>{
  logger.error('Discord login failed',{error:e.message});
  void shutdown('login_failed',1);
});