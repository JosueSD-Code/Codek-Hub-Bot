import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events,
  GatewayIntentBits, ModalBuilder, PermissionFlagsBits, REST, Routes,
  SlashCommandBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, ActivityType
} from 'discord.js';
import { loadEnvironment, logger, renderVariables, prisma, ensureGuild, getGuild, findAutoResponder, audit } from '../../../packages/shared/src/index.js';

const env = loadEnvironment();
const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent, GatewayIntentBits.GuildPresences
]});
const cooldowns = new Map();
const ticketLocks = new Set();

const admin = PermissionFlagsBits.Administrator;
const commands = [
  new SlashCommandBuilder().setName('tickets').setDescription('Configura el sistema de tickets.').setDefaultMemberPermissions(admin)
    .addSubcommand(s=>s.setName('panel').setDescription('Crea un panel de tickets.').addStringOption(o=>o.setName('nombre').setDescription('Nombre interno').setRequired(true)).addChannelOption(o=>o.setName('canal').setDescription('Canal donde se publicará').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s=>s.setName('categoria').setDescription('Añade una categoría a un panel.').addStringOption(o=>o.setName('panel').setDescription('ID del panel').setRequired(true)).addStringOption(o=>o.setName('nombre').setDescription('Nombre').setRequired(true)).addStringOption(o=>o.setName('emoji').setDescription('Emoji').setRequired(false)).addRoleOption(o=>o.setName('staff').setDescription('Rol de soporte').setRequired(true)))
    .addSubcommand(s=>s.setName('publicar').setDescription('Publica un panel existente.').addStringOption(o=>o.setName('panel').setDescription('ID del panel').setRequired(true))),
  new SlashCommandBuilder().setName('welcome').setDescription('Configura bienvenida.').setDefaultMemberPermissions(admin)
    .addSubcommand(s=>s.setName('set').setDescription('Configura bienvenida.').addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)).addStringOption(o=>o.setName('mensaje').setDescription('Mensaje').setRequired(true))),
  new SlashCommandBuilder().setName('vouch-config').setDescription('Configura vouches.').setDefaultMemberPermissions(admin)
    .addSubcommand(s=>s.setName('set').setDescription('Configura vouches.').addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)).addRoleOption(o=>o.setName('rol').setDescription('Rol permitido').setRequired(false)).addIntegerOption(o=>o.setName('cooldown').setDescription('Cooldown en segundos').setMinValue(0).setRequired(false)))
    .addSubcommand(s=>s.setName('reset').setDescription('Desactiva vouches.')),
  new SlashCommandBuilder().setName('vouch').setDescription('Deja una reseña a un miembro.')
    .addUserOption(o=>o.setName('member').setDescription('Miembro').setRequired(true)).addStringOption(o=>o.setName('tipo').setDescription('Tipo de reseña').setRequired(true).addChoices({name:'Legit',value:'Legit'},{name:'No Legit',value:'No Legit'})).addIntegerOption(o=>o.setName('rating').setDescription('1 a 5').setMinValue(1).setMaxValue(5).setRequired(true)),
  new SlashCommandBuilder().setName('autoresponder').setDescription('Gestiona autoresponders.').setDefaultMemberPermissions(admin)
    .addSubcommand(s=>s.setName('add').setDescription('Añade uno.').addStringOption(o=>o.setName('trigger').setDescription('Disparador').setRequired(true)).addStringOption(o=>o.setName('respuesta').setDescription('Respuesta').setRequired(true)).addStringOption(o=>o.setName('modo').setDescription('Coincidencia').addChoices({name:'Contiene',value:'contains'},{name:'Exacta',value:'exact'}).setRequired(false)))
    .addSubcommand(s=>s.setName('remove').setDescription('Elimina uno.').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
    .addSubcommand(s=>s.setName('list').setDescription('Lista autoresponders.')),
  new SlashCommandBuilder().setName('presence').setDescription('Configura la Rich Presence del bot.').setDefaultMemberPermissions(admin)
    .addSubcommand(s=>s.setName('set').setDescription('Establece actividad.').addStringOption(o=>o.setName('tipo').setDescription('Tipo').addChoices({name:'Playing',value:'Playing'},{name:'Watching',value:'Watching'},{name:'Listening',value:'Listening'},{name:'Streaming',value:'Streaming'}).setRequired(true)).addStringOption(o=>o.setName('texto').setDescription('Texto').setRequired(true)))
    .addSubcommand(s=>s.setName('reset').setDescription('Restablece actividad.')),
  new SlashCommandBuilder().setName('variables').setDescription('Muestra las variables disponibles.')
];
async function deploy() {
  const rest = new REST({version:'10'}).setToken(env.DISCORD_TOKEN);
  const route = env.DEV_GUILD_ID ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DEV_GUILD_ID) : Routes.applicationCommands(env.DISCORD_CLIENT_ID);
  await rest.put(route, {body: commands.map(c=>c.toJSON())});
}
async function applyPresence() {
  const row = await prisma.presenceConfig.findFirst({where:{enabled:true}, orderBy:{updatedAt:'desc'}});
  if (!row) return client.user?.setPresence({activities:[],status:'online'});
  const typeMap = {Playing:ActivityType.Playing, Watching:ActivityType.Watching, Listening:ActivityType.Listening, Streaming:ActivityType.Streaming};
  client.user?.setPresence({activities:[{name:row.text,type:typeMap[row.type] ?? ActivityType.Watching}],status:'online'});
}
async function getConfig(guildId) {
  await ensureGuild(client.guilds.cache.get(guildId));
  return getGuild(guildId);
}
function ephemeral(content) { return {content, flags:64}; }
function safeColor(value) { const n=Number.parseInt(String(value||'0x5865F2').replace('#',''),16); return Number.isFinite(n)?n:0x5865F2; }

async function createTicket(interaction, category) {
  const key = guildKey = interaction.guildId + ':' + category.id + ':' + interaction.user.id;
  if (ticketLocks.has(key)) return interaction.reply(ephemeral('Ya se está creando tu ticket.'));
  ticketLocks.add(key);
  try {
    const existing = await prisma.ticket.findFirst({where:{guildId:interaction.guildId,categoryId:category.id,userId:interaction.user.id,status:'open'}});
    if (existing) return interaction.reply(ephemeral('Ya tienes un ticket abierto para esta categoría.'));
    const count = await prisma.ticket.count({where:{guildId:interaction.guildId,categoryId:category.id}});
    const number = count + 1;
    const parent = category.discordCategoryId ? interaction.guild.channels.cache.get(category.discordCategoryId) : null;
    const support = category.supportRoleIds.map(String);
    const channel = await interaction.guild.channels.create({name:category.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)+'-'+number,type:ChannelType.GuildText,parent:parent?.id,permissionOverwrites:[
      {id:interaction.guild.roles.everyone.id,deny:['ViewChannel']},
      {id:interaction.user.id,allow:['ViewChannel','SendMessages','ReadMessageHistory']},
      ...support.map(id=>({id,allow:['ViewChannel','SendMessages','ReadMessageHistory','ManageMessages']}))
    ]});
    const ticket=await prisma.ticket.create({data:{guildId:interaction.guildId,categoryId:category.id,userId:interaction.user.id,channelId:channel.id,number}});
    const mentions=support.map(id=>'<@&'+id+'>').join(' ');
    const embed=new EmbedBuilder().setTitle('Ticket • '+category.name).setDescription('Hola <@'+interaction.user.id+'>, tu ticket ha sido creado.\n\n'+(category.description||'Un miembro del equipo te atenderá pronto.')).setColor(0x5865F2).addFields({name:'Número',value:String(number),inline:true},{name:'Categoría',value:category.name,inline:true}).setTimestamp();
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:claim:'+ticket.id).setLabel('Reclamar').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('ticket:close:'+ticket.id).setLabel('Cerrar ticket').setStyle(ButtonStyle.Danger));
    await channel.send({content:'<@'+interaction.user.id+'> '+mentions,embeds:[embed],components:[row]});
    await audit(interaction.guildId,interaction.user.id,'tickets','created',String(ticket.id));
    await interaction.reply(ephemeral('Ticket creado: '+channel));
  } finally { ticketLocks.delete(key); }
}
async function closeTicket(interaction,ticket) {
  if (!ticket || ticket.status !== 'open') return interaction.reply(ephemeral('Este ticket ya está cerrado.'));
  const messages=[]; let before;
  for(let i=0;i<10;i++){ const batch=await interaction.channel.messages.fetch({limit:100,before}).catch(()=>new Map()); if(!batch.size) break; messages.push(...batch.values()); before=batch.last()?.id; if(batch.size<100) break; }
  messages.reverse();
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Ticket '+ticket.number+'</title></head><body><h1>Ticket #'+ticket.number+'</h1><p>Usuario: '+esc(ticket.userId)+' | Categoría: '+esc(ticket.category.name)+'</p>'+messages.map(m=>'<p><b>'+esc(m.author.tag)+'</b> <small>'+esc(m.createdAt.toISOString())+'</small><br>'+esc(m.content)+'</p>').join('')+'</body></html>';
  await prisma.ticket.update({where:{id:ticket.id},data:{status:'closed',closedAt:new Date()}});
  await prisma.ticketTranscript.upsert({where:{ticketId:ticket.id},update:{html},create:{ticketId:ticket.id,html}});
  await audit(interaction.guildId,interaction.user.id,'tickets','closed',String(ticket.id));
  await interaction.reply(ephemeral('Ticket cerrado. El canal se eliminará en unos segundos.'));
  setTimeout(()=>interaction.channel.delete().catch(()=>{}),3000);
}
client.once(Events.ClientReady, async c=>{ await deploy(); await applyPresence(); logger.info('Codek Hub conectado',{user:c.user.tag,guilds:c.guilds.cache.size}); });
client.on(Events.GuildCreate,g=>ensureGuild(g).catch(()=>{}));
client.on(Events.GuildMemberAdd,async member=>{
  const cfg=await prisma.welcomeConfig.findUnique({where:{guildId:member.guild.id}}).catch(()=>null);
  if(!cfg?.enabled||!cfg.channelId) return;
  const ch=member.guild.channels.cache.get(cfg.channelId); if(!ch?.isTextBased()) return;
  const ctx={user:member.toString(),username:member.user.username,displayname:member.displayName,userid:member.id,server:member.guild.name,membercount:member.guild.memberCount};
  const content=renderVariables(cfg.message||'¡Bienvenido {user} a {server}!',ctx);
  const embed=new EmbedBuilder().setTitle(cfg.title||'Bienvenido').setDescription(renderVariables(cfg.description||content,ctx)).setColor(safeColor(cfg.color)).setThumbnail(cfg.thumbnail||member.displayAvatarURL()).setTimestamp();
  if(cfg.image) embed.setImage(cfg.image); if(cfg.footer) embed.setFooter({text:cfg.footer});
  await ch.send({content:cfg.message?renderVariables(cfg.message,ctx):undefined,embeds:[embed]}).catch(()=>{});
});
client.on(Events.MessageCreate,async message=>{
  if(message.author.bot||!message.guildId) return;
  const responder=await findAutoResponder(message.content,message.guildId).catch(()=>null);
  if(!responder||!String(responder.response).trim()) return;
  const rendered=renderVariables(responder.response,{user:message.author.toString(),username:message.author.username,displayname:message.member?.displayName,userid:message.author.id,server:message.guild.name,membercount:message.guild.memberCount,channel:message.channel.toString(),channelname:message.channel.name});
  if(!rendered.trim()) return;
  await message.reply(rendered).catch(e=>logger.warn('Autoresponder failed',{error:e.message}));
});
client.on(Events.InteractionCreate,async interaction=>{
  try {
    if(interaction.isStringSelectMenu()&&interaction.customId.startsWith('ticket:select:')) { const cat=await prisma.ticketCategory.findUnique({where:{id:interaction.values[0]}}); if(cat) return createTicket(interaction,cat); }
    if(interaction.isButton()&&interaction.customId.startsWith('ticket:claim:')) { const id=interaction.customId.split(':')[2]; const t=await prisma.ticket.findUnique({where:{id}}); if(!t) return interaction.reply(ephemeral('Ticket no encontrado.')); await prisma.ticket.update({where:{id},data:{claimedById:interaction.user.id}}); return interaction.reply(ephemeral('Ticket reclamado por '+interaction.user+'.')); }
    if(interaction.isButton()&&interaction.customId.startsWith('ticket:close:')) { const id=interaction.customId.split(':')[2]; const t=await prisma.ticket.findUnique({where:{id},include:{category:true}}); return closeTicket(interaction,t); }
    if(interaction.isModalSubmit()&&interaction.customId.startsWith('vouch:')) { const [,targetId,type,rating]=interaction.customId.split(':'); const text=interaction.fields.getTextInputValue('text').trim(); if(!text) return interaction.reply(ephemeral('La reseña no puede estar vacía.')); const cfg=await prisma.vouchConfig.findUnique({where:{guildId:interaction.guildId}}); if(!cfg?.enabled) return interaction.reply(ephemeral('Los vouches están desactivados.')); await prisma.vouch.create({data:{guildId:interaction.guildId,targetId,reviewerId:interaction.user.id,reviewType:type,rating:Number(rating),text}}); const ch=cfg.channelId?interaction.guild.channels.cache.get(cfg.channelId):interaction.channel; const embed=new EmbedBuilder().setTitle(cfg.title||'Nueva reseña').setDescription(cfg.description||'').setColor(safeColor(cfg.color)).setThumbnail((await interaction.guild.members.fetch(targetId)).displayAvatarURL()).addFields({name:'Usuario',value:'<@'+targetId+'>',inline:true},{name:'Tipo',value:type,inline:true},{name:'Rating',value:'⭐'.repeat(Number(rating)),inline:true},{name:'Reseña',value:text}).setTimestamp(); if(cfg.image)embed.setImage(cfg.image); if(cfg.footer)embed.setFooter({text:cfg.footer}); await ch.send({embeds:[embed]}).catch(()=>{}); cooldowns.set(interaction.guildId+':'+interaction.user.id,Date.now()); return interaction.reply(ephemeral('¡Tu vouch fue registrado!')); }
    if(!interaction.isChatInputCommand()) return;
    if(interaction.commandName==='variables') return interaction.reply(ephemeral('Variables: {user} {username} {displayname} {userid} {server} {membercount} {channel} {channelname} {ticket} {category} {staff}'));
    if(interaction.commandName==='welcome') { const sub=interaction.options.getSubcommand(); if(sub==='set'){const channel=interaction.options.getChannel('canal'),message=interaction.options.getString('mensaje'); await ensureGuild(interaction.guild); await prisma.welcomeConfig.upsert({where:{guildId:interaction.guildId},update:{enabled:true,channelId:channel.id,message},create:{guildId:interaction.guildId,enabled:true,channelId:channel.id,message}}); return interaction.reply(ephemeral('Bienvenida configurada.'));}}
    if(interaction.commandName==='vouch-config'){const sub=interaction.options.getSubcommand(); if(sub==='reset'){await prisma.vouchConfig.upsert({where:{guildId:interaction.guildId},update:{enabled:false},create:{guildId:interaction.guildId,enabled:false,allowedRoleIds:[]}}); return interaction.reply(ephemeral('Vouches desactivados.'));} const ch=interaction.options.getChannel('canal'),role=interaction.options.getRole('rol'),cool=interaction.options.getInteger('cooldown')??60; await prisma.vouchConfig.upsert({where:{guildId:interaction.guildId},update:{enabled:true,channelId:ch.id,allowedRoleIds:role?[role.id]:[],cooldown:cool},create:{guildId:interaction.guildId,enabled:true,channelId:ch.id,allowedRoleIds:role?[role.id]:[],cooldown:cool}}); return interaction.reply(ephemeral('Vouches configurados.')); }
    if(interaction.commandName==='vouch'){const key=interaction.guildId+':'+interaction.user.id,last=cooldowns.get(key)||0,cfg=await prisma.vouchConfig.findUnique({where:{guildId:interaction.guildId}}); if(!cfg?.enabled)return interaction.reply(ephemeral('Los vouches están desactivados.')); if(Date.now()-last<cfg.cooldown*1000)return interaction.reply(ephemeral('Espera antes de enviar otro vouch.')); if(cfg.allowedRoleIds.length&&!cfg.allowedRoleIds.some(id=>interaction.member.roles.cache.has(id)))return interaction.reply(ephemeral('No tienes permiso para usar /vouch.')); const target=interaction.options.getUser('member'),type=interaction.options.getString('tipo'),rating=interaction.options.getInteger('rating'); if(target.id===interaction.user.id)return interaction.reply(ephemeral('No puedes hacerte un vouch a ti mismo.')); const modal=new ModalBuilder().setCustomId('vouch:'+target.id+':'+type+':'+rating).setTitle('Danos tu reseña'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Danos tu reseña').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Escribe una reseña...'))); return interaction.showModal(modal); }
    if(interaction.commandName==='autoresponder'){const sub=interaction.options.getSubcommand(); if(sub==='add'){const trigger=interaction.options.getString('trigger'),response=interaction.options.getString('respuesta'),mode=interaction.options.getString('modo')||'contains'; await prisma.autoResponder.create({data:{guildId:interaction.guildId,trigger,response,matchType:mode}}); return interaction.reply(ephemeral('Autoresponder creado.'));} if(sub==='remove'){await prisma.autoResponder.delete({where:{id:interaction.options.getString('id')}}).catch(()=>{}); return interaction.reply(ephemeral('Autoresponder eliminado si existía.'));} const rows=await prisma.autoResponder.findMany({where:{guildId:interaction.guildId}}); return interaction.reply(ephemeral(rows.length?rows.map(r=>r.id+' • '+r.trigger+' • '+r.matchType).join('\n'):'No hay autoresponders.')); }
    if(interaction.commandName==='presence'){const sub=interaction.options.getSubcommand(); if(sub==='reset'){await prisma.presenceConfig.updateMany({data:{enabled:false}}); await applyPresence(); return interaction.reply(ephemeral('Rich Presence restablecida.'));} const type=interaction.options.getString('tipo'),text=interaction.options.getString('texto'); await prisma.presenceConfig.updateMany({data:{enabled:false}}); await prisma.presenceConfig.upsert({where:{guildId:interaction.guildId},update:{enabled:true,type,text},create:{guildId:interaction.guildId,enabled:true,type,text}}); await applyPresence(); return interaction.reply(ephemeral('Rich Presence actualizada.')); }
    if(interaction.commandName==='tickets'){const sub=interaction.options.getSubcommand(); if(sub==='panel'){const p=await prisma.ticketPanel.create({data:{guildId:interaction.guildId,name:interaction.options.getString('nombre'),channelId:interaction.options.getChannel('canal').id}}); return interaction.reply(ephemeral('Panel creado. ID: '+p.id));} if(sub==='categoria'){const p=await prisma.ticketPanel.findFirst({where:{id:interaction.options.getString('panel'),guildId:interaction.guildId}}); if(!p)return interaction.reply(ephemeral('Panel no encontrado.')); const c=await prisma.ticketCategory.create({data:{panelId:p.id,name:interaction.options.getString('nombre'),emoji:interaction.options.getString('emoji'),supportRoleIds:[interaction.options.getRole('staff').id]}}); return interaction.reply(ephemeral('Categoría creada. ID: '+c.id));} const p=await prisma.ticketPanel.findFirst({where:{id:interaction.options.getString('panel'),guildId:interaction.guildId},include:{categories:true}}); if(!p)return interaction.reply(ephemeral('Panel no encontrado.')); const ch=interaction.guild.channels.cache.get(p.channelId); if(!ch?.isTextBased())return interaction.reply(ephemeral('Canal del panel no encontrado.')); const menu=new StringSelectMenuBuilder().setCustomId('ticket:select:'+p.id).setPlaceholder('Selecciona una categoría').addOptions(p.categories.slice(0,25).map(c=>({label:c.name.slice(0,100),value:c.id,description:(c.description||'Abrir ticket').slice(0,100),emoji:c.emoji||undefined}))); const embed=new EmbedBuilder().setTitle(p.title||p.name).setDescription(p.description||'Selecciona una categoría para abrir un ticket.').setColor(safeColor(p.color)); if(p.image)embed.setImage(p.image); if(p.thumbnail)embed.setThumbnail(p.thumbnail); if(p.footer)embed.setFooter({text:p.footer}); await ch.send({embeds:[embed],components:[new ActionRowBuilder().addComponents(menu)]}); return interaction.reply(ephemeral('Panel publicado.')); }
  } catch(error) { logger.error('Interaction error',{error:error.message}); if(interaction.replied||interaction.deferred) await interaction.followUp(ephemeral('Ocurrió un error.')); else await interaction.reply(ephemeral('Ocurrió un error.')); }
});
client.login(env.DISCORD_TOKEN);