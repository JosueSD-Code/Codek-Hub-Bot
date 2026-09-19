import {
  Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes,
  PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActivityType
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
const ADMIN=PermissionFlagsBits.Administrator;

const commands=[
  new SlashCommandBuilder()
    .setName('tickets').setDescription('Configura tickets.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('panel').setDescription('Crea un panel.')
      .addStringOption(o=>o.setName('nombre').setDescription('Nombre').setRequired(true))
      .addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o=>o.setName('titulo').setDescription('Título'))
      .addStringOption(o=>o.setName('descripcion').setDescription('Descripción'))
      .addStringOption(o=>o.setName('color').setDescription('Color HEX'))
      .addStringOption(o=>o.setName('imagen').setDescription('URL imagen'))
      .addStringOption(o=>o.setName('thumbnail').setDescription('URL thumbnail'))
      .addStringOption(o=>o.setName('footer').setDescription('Footer')))
    .addSubcommand(s=>s.setName('categoria').setDescription('Añade categoría.')
      .addStringOption(o=>o.setName('panel').setDescription('ID panel').setRequired(true))
      .addStringOption(o=>o.setName('nombre').setDescription('Nombre').setRequired(true))
      .addStringOption(o=>o.setName('staff').setDescription('Roles separados por comas').setRequired(true))
      .addStringOption(o=>o.setName('emoji').setDescription('Emoji'))
      .addStringOption(o=>o.setName('descripcion').setDescription('Descripción'))
      .addChannelOption(o=>o.setName('categoria-canal').setDescription('Categoría Discord').addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand(s=>s.setName('pregunta').setDescription('Añade pregunta.')
      .addStringOption(o=>o.setName('categoria').setDescription('ID categoría').setRequired(true))
      .addStringOption(o=>o.setName('label').setDescription('Pregunta').setRequired(true))
      .addStringOption(o=>o.setName('placeholder').setDescription('Placeholder'))
      .addBooleanOption(o=>o.setName('obligatoria').setDescription('Obligatoria')))
    .addSubcommand(s=>s.setName('publicar').setDescription('Publica panel.')
      .addStringOption(o=>o.setName('panel').setDescription('ID panel').setRequired(true)))
    .addSubcommand(s=>s.setName('log').setDescription('Configura logs.')
      .addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true))),

  new SlashCommandBuilder()
    .setName('welcome').setDescription('Configura bienvenida.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('set').setDescription('Configura.')
      .addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o=>o.setName('mensaje').setDescription('Mensaje').setRequired(true))
      .addStringOption(o=>o.setName('titulo').setDescription('Título'))
      .addStringOption(o=>o.setName('descripcion').setDescription('Descripción'))
      .addStringOption(o=>o.setName('color').setDescription('Color HEX'))
      .addStringOption(o=>o.setName('imagen').setDescription('URL imagen'))
      .addStringOption(o=>o.setName('thumbnail').setDescription('URL thumbnail'))
      .addStringOption(o=>o.setName('footer').setDescription('Footer'))),

  new SlashCommandBuilder()
    .setName('vouch-config').setDescription('Configura vouches.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('set').setDescription('Activa.')
      .addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o=>o.setName('roles').setDescription('Roles separados por comas'))
      .addIntegerOption(o=>o.setName('cooldown').setDescription('Segundos').setMinValue(0))
      .addStringOption(o=>o.setName('titulo').setDescription('Título'))
      .addStringOption(o=>o.setName('descripcion').setDescription('Descripción'))
      .addStringOption(o=>o.setName('color').setDescription('Color HEX'))
      .addStringOption(o=>o.setName('imagen').setDescription('URL imagen'))
      .addStringOption(o=>o.setName('thumbnail').setDescription('URL thumbnail'))
      .addStringOption(o=>o.setName('footer').setDescription('Footer')))
    .addSubcommand(s=>s.setName('reset').setDescription('Desactiva.')),

  new SlashCommandBuilder()
    .setName('vouch').setDescription('Deja una reseña.')
    .addUserOption(o=>o.setName('member').setDescription('Miembro').setRequired(true))
    .addStringOption(o=>o.setName('tipo').setDescription('Tipo').setRequired(true)
      .addChoices({name:'Legit',value:'Legit'},{name:'No Legit',value:'No Legit'}))
    .addIntegerOption(o=>o.setName('rating').setDescription('1-5').setRequired(true).setMinValue(1).setMaxValue(5)),

  new SlashCommandBuilder()
    .setName('autoresponder').setDescription('Gestiona respuestas.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('add').setDescription('Añade.')
      .addStringOption(o=>o.setName('trigger').setDescription('Trigger').setRequired(true))
      .addStringOption(o=>o.setName('respuesta').setDescription('Respuesta').setRequired(true))
      .addStringOption(o=>o.setName('modo').setDescription('Modo')
        .addChoices({name:'Contiene',value:'contains'},{name:'Exacta',value:'exact'}))
      .addStringOption(o=>o.setName('titulo').setDescription('Título embed'))
      .addStringOption(o=>o.setName('descripcion').setDescription('Descripción embed'))
      .addStringOption(o=>o.setName('color').setDescription('Color HEX')))
    .addSubcommand(s=>s.setName('remove').setDescription('Elimina.')
      .addStringOption(o=>o.setName('trigger').setDescription('Trigger').setRequired(true)))
    .addSubcommand(s=>s.setName('list').setDescription('Lista.')),

  new SlashCommandBuilder()
    .setName('presence').setDescription('Rich Presence del bot.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('set').setDescription('Configura.')
      .addStringOption(o=>o.setName('tipo').setDescription('Tipo').setRequired(true)
        .addChoices({name:'Playing',value:'Playing'},{name:'Watching',value:'Watching'},{name:'Listening',value:'Listening'}))
      .addStringOption(o=>o.setName('texto').setDescription('Texto').setRequired(true)))
    .addSubcommand(s=>s.setName('reset').setDescription('Restablece.')),

  new SlashCommandBuilder().setName('variables').setDescription('Muestra variables.')
];

const deny=content=>({content,flags:64});
const color=v=>{
  const h=String(v||'5865F2').replace(/^#/,'').trim();
  return /^[0-9a-fA-F]{6}$/.test(h)?parseInt(h,16):0x5865F2;
};
const isAdmin=i=>Boolean(i.memberPermissions?.has(ADMIN));
const roleIds=(g,v)=>String(v||'').split(',')
  .map(x=>x.trim().replace(/[<@&>]/g,''))
  .filter(id=>g?.roles.cache.has(id));
const clean=v=>String(v||'ticket').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')
  .replace(/^-+|-+$/g,'').slice(0,45)||'ticket';\nconst normalizeEmoji=(guild,value)=>{
  const raw=String(value||'').trim();
  if(!raw)return null;

  const custom=raw.match(/^<a?:([\\w~]+):(\\d+)>$/);
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
    userid:u?.id||'0',
    useravatar:avatar,
    avatar,
    user_avatar:avatar,
    server:g?.name||'server',
    guild:g?.name||'server',
    membercount:g?.memberCount??0,
    guildid:g?.id||'0',
    guildicon:guildIcon,
    servericon:guildIcon,
    channel:ch?.toString?.()||'channel',
    channelname:ch?.name||'channel',
    channelid:ch?.id||'0',
    ...extra
  };
};

async function logToChannel(g,title,description){
  try{
    const x=await prisma.guild.findUnique({where:{id:g.id},select:{logChannelId:true}});
    const ch=x?.logChannelId?g.channels.cache.get(x.logChannelId):null;
    if(ch?.isTextBased()){
      await ch.send({embeds:[new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865F2).setTimestamp()]});
    }
  }catch(e){
    logger.warn('Log failed',{error:e.message});
  }
}

async function nextNumber(guildId,categoryId){
  return prisma.$transaction(async tx=>{
    const k='codek:'+guildId+':'+categoryId;
    let locked=false;

    while(!locked){
      const rows=await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${k})) AS locked`;
      locked=Boolean(rows[0]?.locked);
      if(!locked)await new Promise(resolve=>setTimeout(resolve,25));
    }

    const last=await tx.ticket.findFirst({
      where:{guildId,categoryId},
      orderBy:{number:'desc'},
      select:{number:true}
    });
    return (last?.number||0)+1;
  });
}

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

  if(env.DEV_GUILD_ID){
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID,env.DEV_GUILD_ID),
      {body}
    );
    await rest.put(
      Routes.applicationCommands(env.DISCORD_CLIENT_ID),
      {body:[]}
    );

    for(const guild of client.guilds.cache.values()){
      if(guild.id===env.DEV_GUILD_ID)continue;
      await rest.put(
        Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID,guild.id),
        {body:[]}
      ).catch(e=>logger.warn('Could not clear guild commands',{guildId:guild.id,error:e.message}));
    }

    logger.info('Commands deployed to development guild',{guildId:env.DEV_GUILD_ID,count:body.length});
    return;
  }

  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID),{body});
  for(const guild of client.guilds.cache.values()){
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID,guild.id),
      {body:[]}
    ).catch(e=>logger.warn('Could not clear guild commands',{guildId:guild.id,error:e.message}));
  }
  logger.info('Commands deployed globally',{count:body.length});
}

async function createTicket(i,cat,answers=[]){
  const key=i.guildId+':'+cat.id+':'+i.user.id;
  if(locks.has(key))return i.reply(deny('Ya se está creando tu ticket.'));
  locks.add(key);

  try{
    const supportRoleIds=cat.supportRoleIds.filter(id=>i.guild.roles.cache.has(id));
    if(!supportRoleIds.length){
      return i.reply(deny('Esta categoría no tiene ningún rol de soporte válido.'));
    }

    const old=await prisma.ticket.findFirst({
      where:{guildId:i.guildId,categoryId:cat.id,userId:i.user.id,status:'open'}
    });
    if(old){
      const oldChannel=i.guild.channels.cache.get(old.channelId);
      return i.reply(deny(oldChannel?'Ya tienes un ticket abierto: '+oldChannel:'Ya tienes un ticket abierto para esta categoría.'));
    }

    const n=await nextNumber(i.guildId,cat.id);
    const overwrites=[
      {id:i.guild.roles.everyone.id,deny:['ViewChannel']},
      {id:i.user.id,allow:['ViewChannel','SendMessages','ReadMessageHistory']},
      ...supportRoleIds.map(id=>({
        id,
        allow:['ViewChannel','SendMessages','ReadMessageHistory']
      }))
    ];

    const ch=await i.guild.channels.create({
      name:clean(cat.name)+'-'+n,
      type:ChannelType.GuildText,
      parent:cat.discordCategoryId&&i.guild.channels.cache.has(cat.discordCategoryId)?cat.discordCategoryId:undefined,
      permissionOverwrites:overwrites
    });

    let t;
    try{
      t=await prisma.ticket.create({
        data:{
          guildId:i.guildId,
          categoryId:cat.id,
          userId:i.user.id,
          channelId:ch.id,
          number:n,
          answers:answers.length?{create:answers}:undefined
        }
      });
    }catch(e){
      await ch.delete().catch(()=>{});
      throw e;
    }

    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:claim:'+t.id).setLabel('Reclamar').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket:close:'+t.id).setLabel('Cerrar ticket').setStyle(ButtonStyle.Danger)
    );
    const ticketContext=context(i.user,i.guild,ch,{
      ticket:String(n),
      category:cat.name,
      staff:supportRoleIds.map(x=>'<@&'+x+'>').join(' '),
      ticketid:t.id
    });
    const a=answers.length?'\n\n'+answers.map(x=>'**'+renderVariables(x.label,ticketContext)+':** '+renderVariables(x.answer,ticketContext)).join('\n'):'';

    const ticketEmbed=new EmbedBuilder()
      .setTitle(renderVariables('Ticket • '+cat.name,ticketContext))
      .setDescription(renderVariables(cat.description||'El equipo te atenderá pronto.',ticketContext)+a)
      .setColor(0x5865F2)
      .setThumbnail(i.user.displayAvatarURL({size:512}))
      .setTimestamp();

    await ch.send({
      content:i.user.toString()+' '+supportRoleIds.map(x=>'<@&'+x+'>').join(' '),
      embeds:[ticketEmbed],
      components:[row]
    });

    await audit(i.guildId,i.user.id,'tickets','created','#'+n);
    await logToChannel(i.guild,'Ticket creado','<@'+i.user.id+'> creó **'+cat.name+' #'+n+'**.');
    return i.reply(deny('Ticket creado: '+ch));
  }catch(e){
    logger.error('Ticket creation failed',{error:e.message});
    return i.reply(deny('No se pudo crear el ticket. Revisa los permisos del bot y la configuración de la categoría.'));
  }finally{
    locks.delete(key);
  }
}

async function transcript(ch,t){
  const xs=[...(await ch.messages.fetch({limit:100})).values()].reverse();
  const esc=x=>String(x||'').replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));
  return '<!doctype html><html><body>'+
    '<h1>Ticket #'+t.number+'</h1>'+
    '<p>Usuario: '+esc(t.userId)+'<br>Categoría: '+esc(t.category.name)+'<br>Creado: '+t.createdAt.toISOString()+'</p>'+
    xs.map(m=>'<p><b>'+esc(m.author.tag)+'</b> '+new Date(m.createdTimestamp).toISOString()+
      '<br>'+esc(m.content||'[embed/archivo]')+'</p>').join('')+
    '</body></html>';
}

async function closeTicket(i,t){
  if(closeLocks.has(t.id))return i.reply(deny('El cierre ya está en proceso.'));
  closeLocks.add(t.id);
  try{
    const html=await transcript(i.channel,t);
    await prisma.ticket.update({
      where:{id:t.id},
      data:{
        status:'closed',
        closedAt:new Date(),
        transcript:{
          upsert:{
            update:{html},
            create:{html}
          }
        }
      }
    });
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

    await i.reply(deny('Ticket cerrado. Transcripción guardada.'));
    setTimeout(()=>i.channel?.delete().catch(()=>{}),2500);
  }catch(e){
    logger.error('Ticket close failed',{error:e.message});
    if(!i.replied&&!i.deferred)await i.reply(deny('No se pudo cerrar el ticket.'));
  }finally{
    closeLocks.delete(t.id);
  }
}

client.once(Events.ClientReady,async c=>{
  try{
    await prisma.$queryRaw`SELECT 1`;
    for(const g of c.guilds.cache.values())await ensureGuild(g);
    await deploy();
    await presence();
    logger.info('Codek Hub conectado',{user:c.user.tag,guilds:c.guilds.cache.size});
  }catch(e){
    logger.error('Startup failed',{error:e.message});
    process.exit(1);
  }
});

client.on(Events.GuildCreate,g=>ensureGuild(g).catch(e=>logger.warn('Guild sync failed',{error:e.message})));

client.on(Events.GuildMemberAdd,async m=>{
  try{
    const c=await prisma.welcomeConfig.findUnique({where:{guildId:m.guild.id}});
    if(!c?.enabled||!c.channelId)return;
    const ch=m.guild.channels.cache.get(c.channelId);
    if(!ch?.isTextBased())return;

    const x=context(m.user,m.guild,ch);
    const emb=new EmbedBuilder()
      .setTitle(renderVariables(c.title||'¡Bienvenido!',x))
      .setDescription(renderVariables(c.description||'',x))
      .setColor(color(c.color))
      .setTimestamp();

    if(c.image)emb.setImage(renderVariables(c.image,x));
    if(c.thumbnail)emb.setThumbnail(renderVariables(c.thumbnail,x));
    if(c.footer)emb.setFooter({text:renderVariables(c.footer,x)});

    await ch.send({
      content:renderVariables(c.message||'¡Bienvenido {user} a {server}!',x),
      embeds:[emb]
    });
    await audit(m.guild.id,m.id,'welcome','sent',ch.id);
  }catch(e){
    logger.error('Welcome failed',{error:e.message});
  }
});

client.on(Events.MessageCreate,async m=>{
  if(m.author.bot||!m.guildId)return;
  try{
    const r=await findAutoResponder(m.content,m.guildId);
    if(!r||!r.response?.trim())return;

    const x=context(m.author,m.guild,m.channel);
    const payload={content:renderVariables(r.response,x)};
    if(r.embedTitle||r.embedDescription){
      payload.embeds=[new EmbedBuilder()
        .setTitle(renderVariables(r.embedTitle||'',x))
        .setDescription(renderVariables(r.embedDescription||r.response,x))
        .setColor(color(r.embedColor))
        .setTimestamp()];
    }
    await m.reply(payload);
    await audit(m.guildId,m.author.id,'autoresponder','used',r.trigger);
  }catch(e){
    logger.error('Autoresponder failed',{error:e.message});
  }
});

client.on(Events.InteractionCreate,async i=>{
  try{
    if(!i.guildId||!i.guild){
      if(!i.replied&&!i.deferred)await i.reply(deny('Este comando solo puede usarse dentro de un servidor.'));
      return;
    }

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
        include:{category:true}
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

      await prisma.$transaction(async tx=>{
        await tx.ticket.update({where:{id},data:{claimedById:i.user.id}});
        await tx.ticketClaim.create({
          data:{
            ticket:{connect:{id}},
            userId:i.user.id
          }
        });
      });
      await audit(i.guildId,i.user.id,'tickets','claimed','#'+t.number);
      return i.reply(deny('Ticket reclamado por '+i.user.toString()+'.'));
    }

    if(i.isButton()&&i.customId.startsWith('ticket:close:')){
      const id=i.customId.split(':')[2];
      const t=await prisma.ticket.findFirst({
        where:{id,guildId:i.guildId},
        include:{category:true}
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
        include:{category:true}
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
      const text=i.fields.getTextInputValue('review').trim();
      if(!text)return i.reply(deny('La reseña no puede estar vacía.'));

      const c=await prisma.vouchConfig.findUnique({where:{guildId:i.guildId}});
      if(!c?.enabled)return i.reply(deny('Vouches desactivados.'));

      const member=i.member;
      if(c.allowedRoleIds.length&&!c.allowedRoleIds.some(x=>member?.roles?.cache?.has(x))){
        return i.reply(deny('No tienes permiso para usar /vouch.'));
      }

      const last=cooldowns.get(i.guildId+':'+i.user.id)||0;
      if(Date.now()-last<c.cooldown*1000)return i.reply(deny('Espera antes de enviar otro vouch.'));

      const duplicate=await prisma.vouch.findFirst({
        where:{guildId:i.guildId,targetId,reviewerId:i.user.id}
      });
      if(duplicate)return i.reply(deny('Ya has dejado un vouch para este usuario.'));

      const target=await client.users.fetch(targetId).catch(()=>null);
      const ch=c.channelId?i.guild.channels.cache.get(c.channelId):null;
      if(!target||!ch?.isTextBased())return i.reply(deny('El usuario o canal de vouches ya no existe.'));

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

      const x=context(target,i.guild,ch,{
        target:target.toString(),
        targetid:target.id,
        targetavatar:target.displayAvatarURL({size:1024,extension:'png'}),
        client:i.user.toString(),
        clientid:i.user.id,
        clientavatar:i.user.displayAvatarURL({size:1024,extension:'png'}),
        category:'vouch'
      });
      const emb=new EmbedBuilder()
        .setTitle(renderVariables(c.title||'Nueva reseña',x))
        .setDescription(renderVariables(c.description||'',x))
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

      if(c.image)emb.setImage(renderVariables(c.image,x));
      if(c.thumbnail)emb.setThumbnail(renderVariables(c.thumbnail,x));
      if(c.footer)emb.setFooter({text:renderVariables(c.footer,x)});

      await ch.send({embeds:[emb]});
      cooldowns.set(i.guildId+':'+i.user.id,Date.now());
      await audit(i.guildId,i.user.id,'vouch','created',targetId);
      return i.reply(deny('¡Vouch registrado correctamente!'));
    }

    if(!i.isChatInputCommand())return;

    if(i.commandName==='variables'){
      return i.reply(deny([
        'Usuarios: {user} {mention} {username} {tag} {displayname} {userid}',
        'Avatares: {useravatar} {avatar} {user_avatar}',
        'Servidor: {server} {guild} {membercount} {guildid} {guildicon} {servericon}',
        'Canal: {channel} {channelname} {channelid}',
        'Ticket: {ticket} {ticketid} {category} {staff}',
        'Vouch: {client} {clientid} {clientavatar} {target} {targetid} {targetavatar}'
      ].join('\n')));
    }

    if(i.commandName==='welcome'){
      if(!isAdmin(i))return i.reply(deny('Necesitas permisos de administrador.'));
      const ch=i.options.getChannel('canal');
      if(!ch?.isTextBased())return i.reply(deny('El canal indicado no es válido.'));

      const data={
        enabled:true,
        channelId:ch.id,
        message:i.options.getString('mensaje'),
        title:i.options.getString('titulo'),
        description:i.options.getString('descripcion'),
        color:i.options.getString('color'),
        image:i.options.getString('imagen'),
        thumbnail:i.options.getString('thumbnail'),
        footer:i.options.getString('footer')
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

      if(!ch?.isTextBased())return i.reply(deny('El canal indicado no es válido.'));
      if(raw&&!roles.length)return i.reply(deny('No se encontró ningún rol válido.'));

      const data={
        enabled:true,
        channelId:ch.id,
        allowedRoleIds:roles,
        cooldown:cool,
        title:i.options.getString('titulo'),
        description:i.options.getString('descripcion'),
        color:i.options.getString('color'),
        image:i.options.getString('imagen'),
        thumbnail:i.options.getString('thumbnail'),
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

      const last=cooldowns.get(i.guildId+':'+i.user.id)||0;
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
      if(!isAdmin(i))return i.reply(deny('Necesitas permisos de administrador.'));
      const sub=i.options.getSubcommand();

      if(sub==='add'){
        const trigger=i.options.getString('trigger').trim();
        const response=i.options.getString('respuesta').trim();
        if(!trigger||!response)return i.reply(deny('Trigger y respuesta son obligatorios.'));

        const exists=await prisma.autoResponder.findFirst({
          where:{guildId:i.guildId,trigger:{equals:trigger,mode:'insensitive'}}
        });
        if(exists)return i.reply(deny('Ya existe un autoresponder con ese trigger.'));

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

    if(i.commandName==='tickets'){
      if(!isAdmin(i))return i.reply(deny('Necesitas permisos de administrador.'));
      const sub=i.options.getSubcommand();

      if(sub==='log'){
        const ch=i.options.getChannel('canal');
        if(!ch?.isTextBased())return i.reply(deny('El canal indicado no es válido.'));
        await prisma.guild.update({where:{id:i.guildId},data:{logChannelId:ch.id}});
        await audit(i.guildId,i.user.id,'tickets','log_channel',ch.id);
        return i.reply(deny('Canal de logs configurado.'));
      }

      if(sub==='pregunta'){
        const c=await prisma.ticketCategory.findFirst({
          where:{id:i.options.getString('categoria'),panel:{guildId:i.guildId}}
        });
        if(!c)return i.reply(deny('Categoría no encontrada.'));
        const n=await prisma.ticketQuestion.count({where:{categoryId:c.id}});
        if(n>=5)return i.reply(deny('Máximo 5 preguntas por categoría.'));

        await prisma.ticketQuestion.create({
          data:{
            category:{connect:{id:c.id}},
            label:i.options.getString('label').trim(),
            placeholder:i.options.getString('placeholder'),
            required:i.options.getBoolean('obligatoria')??true
          }
        });
        await audit(i.guildId,i.user.id,'tickets','question_added',c.id);
        return i.reply(deny('Pregunta añadida.'));
      }

      if(sub==='panel'){
        const ch=i.options.getChannel('canal');
        if(!ch?.isTextBased())return i.reply(deny('El canal indicado no es válido.'));

        const data={
          name:i.options.getString('nombre').trim(),
          channelId:ch.id,
          title:i.options.getString('titulo'),
          description:i.options.getString('descripcion'),
          color:i.options.getString('color'),
          image:i.options.getString('imagen'),
          thumbnail:i.options.getString('thumbnail'),
          footer:i.options.getString('footer')
        };

        const p=await prisma.ticketPanel.create({
          data:{guild:{connect:{id:i.guildId}},...data}
        });
        await audit(i.guildId,i.user.id,'tickets','panel_created',p.id);
        return i.reply(deny('Panel creado. ID: '+p.id));
      }

      if(sub==='categoria'){
        const p=await prisma.ticketPanel.findFirst({
          where:{id:i.options.getString('panel'),guildId:i.guildId}
        });
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

        const c=await prisma.ticketCategory.create({
          data:{
            panel:{connect:{id:p.id}},
            name:i.options.getString('nombre').trim(),
            description:i.options.getString('descripcion'),
            emoji:i.options.getString('emoji'),
            supportRoleIds:ids,
            discordCategoryId:discordCategory?.id||null
          }
        });
        await audit(i.guildId,i.user.id,'tickets','category_created',c.id);
        return i.reply(deny('Categoría creada. ID: '+c.id));
      }

      const p=await prisma.ticketPanel.findFirst({
        where:{id:i.options.getString('panel'),guildId:i.guildId},
        include:{categories:true}
      });
      if(!p)return i.reply(deny('Panel no encontrado.'));

      const ch=i.guild.channels.cache.get(p.channelId);
      if(!ch?.isTextBased())return i.reply(deny('El canal configurado del panel ya no existe.'));

      if(!p.categories.length)return i.reply(deny('El panel no tiene categorías.'));

      const options=p.categories.slice(0,25).map(c=>({
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
        .setTitle(p.title||p.name)
        .setDescription(p.description||'Selecciona una categoría.')
        .setColor(color(p.color));

      if(p.image)emb.setImage(p.image);
      if(p.thumbnail)emb.setThumbnail(p.thumbnail);
      if(p.footer)emb.setFooter({text:p.footer});

      await ch.send({
        embeds:[emb],
        components:[new ActionRowBuilder().addComponents(menu)]
      });
      await audit(i.guildId,i.user.id,'tickets','panel_published',p.id);
      return i.reply(deny('Panel publicado.'));
    }
  }catch(e){
    logger.error('Interaction error',{error:e.message,stack:e.stack});
    if(!i.replied&&!i.deferred){
      await i.reply(deny('Ocurrió un error al ejecutar el comando. Revisa los logs del bot.')).catch(()=>{});
    }
  }
});

client.login(env.DISCORD_TOKEN).catch(e=>{
  logger.error('Discord login failed',{error:e.message});
  process.exit(1);
});
