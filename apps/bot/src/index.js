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
import { ADMIN,isAdmin,deny,roleIdsByName } from './utils/permissions.js';
import { clip,safeUrl,isHexColor,requiredText } from './utils/validation.js';
import { color } from './utils/embeds.js';

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
      .addStringOption(o=>o.setName('panel').setDescription('Nombre del panel').setRequired(true))
      .addStringOption(o=>o.setName('nombre').setDescription('Nombre').setRequired(true))
      .addStringOption(o=>o.setName('staff').setDescription('Nombres de roles separados por comas').setRequired(true))
      .addStringOption(o=>o.setName('emoji').setDescription('Emoji'))
      .addStringOption(o=>o.setName('descripcion').setDescription('Descripción'))
      .addChannelOption(o=>o.setName('categoria-canal').setDescription('Categoría Discord').addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand(s=>s.setName('pregunta').setDescription('Añade pregunta.')
      .addStringOption(o=>o.setName('categoria').setDescription('Nombre de la categoría').setRequired(true))
      .addStringOption(o=>o.setName('label').setDescription('Pregunta').setRequired(true))
      .addStringOption(o=>o.setName('placeholder').setDescription('Placeholder'))
      .addBooleanOption(o=>o.setName('obligatoria').setDescription('Obligatoria')))
    .addSubcommand(s=>s.setName('publicar').setDescription('Publica panel.')
      .addStringOption(o=>o.setName('panel').setDescription('Nombre del panel').setRequired(true)))
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
      .addStringOption(o=>o.setName('roles').setDescription('Nombres de roles separados por comas'))
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

  let ch=null;
  try{
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
    const a=answers.length?'\\n\\n'+answers.map(x=>'**'+renderVariables(x.label,ticketContext)+':** '+renderVariables(x.answer,ticketContext)).join('\\n'):'';

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
      .setTitle(clip(renderVariables(c.title||'¡Bienvenido!',x),256))
      .setDescription(clip(renderVariables(c.description||'',x),4096))
      .setColor(color(c.color))
      .setTimestamp();

    const welcomeImage=safeUrl(renderVariables(c.image||'',x));
    const welcomeThumbnail=safeUrl(renderVariables(c.thumbnail||'',x));
    if(welcomeImage)emb.setImage(welcomeImage);
    if(welcomeThumbnail)emb.setThumbnail(welcomeThumbnail);
    if(c.footer)emb.setFooter({text:clip(renderVariables(c.footer,x),2048)});

    await ch.send({
      content:clip(renderVariables(c.message||'¡Bienvenido {user} a {server}!',x),2000),
      embeds:[emb]
    });
    await audit(m.guild.id,m.id,'welcome','sent',ch.name);
  }catch(e){
    logger.error('Welcome failed',{error:e.message});
  }
});

client.on(Events.MessageCreate,async m=>{
  if(m.author.bot||!m.guildId)return;
  try{
    const botMentioned=client.user&&m.mentions.users.has(client.user.id);
    if(botMentioned){
      if(!m.member?.permissions?.has(ADMIN))return;

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
            data:{claimedById:i.user.id}
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

      const memoryLast=cooldowns.get(i.guildId+':'+i.user.id)||0;
      const dbLast=await prisma.vouch.findFirst({
        where:{guildId:i.guildId,reviewerId:i.user.id},
        orderBy:{createdAt:'desc'},
        select:{createdAt:true}
      });
      const last=Math.max(memoryLast,dbLast?.createdAt?.getTime()||0);
      if(Date.now()-last<c.cooldown*1000)return i.reply(deny('Espera antes de enviar otro vouch.'));

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

    if(i.commandName==='tickets'){
      if(!isAdmin(i))return i.reply(deny('Necesitas permisos de administrador.'));
      const sub=i.options.getSubcommand();

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
      await i.reply(deny('Ocurrió un error al ejecutar el comando. Revisa los logs del bot.')).catch(()=>{});
    }
  }
});

client.login(env.DISCORD_TOKEN).catch(e=>{
  logger.error('Discord login failed',{error:e.message});
  process.exit(1);
});