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
import { configureDiscordLogger, sendConsoleLog } from './utils/logger.js';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const commands=[
  new SlashCommandBuilder()
     .setName('tickets').setDescription('Sistema de tickets.')
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
      .addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s=>s.setName('log-reset').setDescription('Elimina la configuración de logs.'))
    .addSubcommand(s=>s.setName('panel-list').setDescription('Lista paneles.'))
    .addSubcommand(s=>s.setName('panel-renombrar').setDescription('Renombra un panel.')
      .addStringOption(o=>o.setName('nombre').setDescription('Nombre actual del panel').setRequired(true))
      .addStringOption(o=>o.setName('nuevo-nombre').setDescription('Nuevo nombre del panel').setRequired(true)))
    .addSubcommand(s=>s.setName('panel-eliminar').setDescription('Elimina un panel y su configuración.')
      .addStringOption(o=>o.setName('nombre').setDescription('Nombre del panel').setRequired(true))
      .addBooleanOption(o=>o.setName('confirmar').setDescription('Confirma la eliminación').setRequired(true)))
    .addSubcommand(s=>s.setName('panel-reset').setDescription('Elimina TODOS los paneles y su configuración.')
      .addBooleanOption(o=>o.setName('confirmar').setDescription('Confirma el reinicio total').setRequired(true)))
    .addSubcommand(s=>s.setName('categoria-list').setDescription('Lista categorías de un panel.')
      .addStringOption(o=>o.setName('panel').setDescription('Nombre del panel').setRequired(true)))
    .addSubcommand(s=>s.setName('categoria-eliminar').setDescription('Elimina una categoría y su configuración.')
      .addStringOption(o=>o.setName('nombre').setDescription('Nombre de la categoría').setRequired(true))
      .addBooleanOption(o=>o.setName('confirmar').setDescription('Confirma la eliminación').setRequired(true)))
    .addSubcommand(s=>s.setName('pregunta-list').setDescription('Lista preguntas de una categoría.')
      .addStringOption(o=>o.setName('categoria').setDescription('Nombre de la categoría').setRequired(true)))
    .addSubcommand(s=>s.setName('pregunta-eliminar').setDescription('Elimina una pregunta.')
      .addStringOption(o=>o.setName('categoria').setDescription('Nombre de la categoría').setRequired(true))
      .addStringOption(o=>o.setName('label').setDescription('Texto de la pregunta').setRequired(true))
      .addBooleanOption(o=>o.setName('confirmar').setDescription('Confirma la eliminación').setRequired(true)))
    .addSubcommand(s=>s.setName('reclamar').setDescription('Reclama un ticket.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true)))
    .addSubcommand(s=>s.setName('liberar').setDescription('Libera un ticket reclamado.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true)))
    .addSubcommand(s=>s.setName('adduser').setDescription('Añade un usuario al ticket.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true))
      .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(s=>s.setName('removeuser').setDescription('Quita un usuario del ticket.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true))
      .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(s=>s.setName('cerrar').setDescription('Cierra un ticket.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true))
      .addBooleanOption(o=>o.setName('confirmar').setDescription('Confirma el cierre').setRequired(true))
      .addStringOption(o=>o.setName('razon').setDescription('Razón')))
    .addSubcommand(s=>s.setName('reabrir').setDescription('Reabre un ticket cerrado.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true)))
    .addSubcommand(s=>s.setName('renombrar').setDescription('Renombra el canal del ticket.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true))
      .addStringOption(o=>o.setName('nombre').setDescription('Nuevo nombre').setRequired(true)))
    .addSubcommand(s=>s.setName('mover').setDescription('Mueve el ticket de categoría.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true))
      .addChannelOption(o=>o.setName('categoria').setDescription('Categoría Discord').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand(s=>s.setName('prioridad').setDescription('Cambia la prioridad del ticket.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true))
      .addStringOption(o=>o.setName('nivel').setDescription('Prioridad').setRequired(true)
        .addChoices({name:'Baja',value:'low'},{name:'Normal',value:'normal'},{name:'Alta',value:'high'})))
    .addSubcommand(s=>s.setName('stats').setDescription('Estadísticas de tickets.'))
    .addSubcommand(s=>s.setName('transcript').setDescription('Obtiene la transcripción de un ticket.')
      .addStringOption(o=>o.setName('ticket').setDescription('ID, canal o número').setRequired(true))),

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
      .addStringOption(o=>o.setName('footer').setDescription('Footer')))
    .addSubcommand(s=>s.setName('reset').setDescription('Elimina la configuración de bienvenida.'))
    .addSubcommand(s=>s.setName('test').setDescription('Prueba la bienvenida.'))
    .addSubcommand(s=>s.setName('preview').setDescription('Previsualiza la bienvenida.')),

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

  new SlashCommandBuilder()
    .setName('purge').setDescription('Elimina mensajes del canal actual.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName('cantidad').setDescription('Cantidad de mensajes a eliminar').setMinValue(1).setMaxValue(10000))
    .addBooleanOption(o=>o.setName('canal').setDescription('Elimina todo el historial del canal actual')),
  new SlashCommandBuilder().setName('help').setDescription('Muestra la ayuda completa de Codek Hub.'),
  new SlashCommandBuilder().setName('variables').setDescription('Muestra variables.'),
  new SlashCommandBuilder().setName('warn').setDescription('Advierte a un usuario.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o=>o.setName('razon').setDescription('Razón')),
  new SlashCommandBuilder().setName('mute').setDescription('Aplica timeout a un usuario.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o=>o.setName('duracion').setDescription('Ejemplo: 1h, 30m, 1d').setRequired(true))
    .addStringOption(o=>o.setName('razon').setDescription('Razón')),
  new SlashCommandBuilder().setName('unmute').setDescription('Quita el timeout.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Expulsa a un usuario.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o=>o.setName('razon').setDescription('Razón')),
  new SlashCommandBuilder().setName('ban').setDescription('Banea a un usuario.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o=>o.setName('razon').setDescription('Razón')),
  new SlashCommandBuilder().setName('unban').setDescription('Desbanea por ID.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o=>o.setName('usuario').setDescription('ID del usuario').setRequired(true)),
  new SlashCommandBuilder().setName('timeout').setDescription('Aplica timeout.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o=>o.setName('duracion').setDescription('Ejemplo: 1h, 30m, 1d').setRequired(true))
    .addStringOption(o=>o.setName('razon').setDescription('Razón')),
  new SlashCommandBuilder().setName('untimeout').setDescription('Quita timeout.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)),
  new SlashCommandBuilder().setName('history').setDescription('Historial de moderación.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Elimina mensajes.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName('cantidad').setDescription('Cantidad 1-10000').setMinValue(1).setMaxValue(10000).setRequired(true)),
  new SlashCommandBuilder().setName('logs').setDescription('Configura los logs.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('set').setDescription('Configura el canal de logs.')
      .addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s=>s.setName('disable').setDescription('Desactiva los logs.'))
    .addSubcommand(s=>s.setName('status').setDescription('Muestra la configuración.')),
  new SlashCommandBuilder().setName('automod').setDescription('Configura AutoMod.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('setup').setDescription('Muestra reglas AutoMod.'))
    .addSubcommand(s=>s.setName('spam').setDescription('Configura anti-spam.')
      .addBooleanOption(o=>o.setName('enabled').setRequired(true))
      .addIntegerOption(o=>o.setName('limit').setMinValue(2).setMaxValue(20).setRequired(true))
      .addStringOption(o=>o.setName('action').setRequired(true).addChoices({name:'Eliminar',value:'delete'},{name:'Advertir',value:'warn'},{name:'Timeout',value:'timeout'},{name:'Ban',value:'ban'})))
    .addSubcommand(s=>s.setName('links').setDescription('Configura bloqueo de enlaces.')
      .addBooleanOption(o=>o.setName('enabled').setRequired(true))
      .addStringOption(o=>o.setName('whitelist').setDescription('Dominios separados por coma'))
      .addStringOption(o=>o.setName('action').setRequired(true).addChoices({name:'Eliminar',value:'delete'},{name:'Advertir',value:'warn'},{name:'Timeout',value:'timeout'},{name:'Ban',value:'ban'})))
    .addSubcommand(s=>s.setName('invites').setDescription('Configura bloqueo de invitaciones.')
      .addBooleanOption(o=>o.setName('enabled').setRequired(true))
      .addStringOption(o=>o.setName('action').setRequired(true).addChoices({name:'Eliminar',value:'delete'},{name:'Advertir',value:'warn'},{name:'Timeout',value:'timeout'},{name:'Ban',value:'ban'})))
    .addSubcommand(s=>s.setName('words').setDescription('Configura palabras prohibidas.')
      .addBooleanOption(o=>o.setName('enabled').setRequired(true))
      .addStringOption(o=>o.setName('words').setDescription('Palabras separadas por coma').setRequired(true))
      .addStringOption(o=>o.setName('action').setRequired(true).addChoices({name:'Eliminar',value:'delete'},{name:'Advertir',value:'warn'},{name:'Timeout',value:'timeout'},{name:'Ban',value:'ban'})))
    .addSubcommand(s=>s.setName('mentions').setDescription('Configura límite de menciones.')
      .addBooleanOption(o=>o.setName('enabled').setRequired(true))
      .addIntegerOption(o=>o.setName('limit').setMinValue(1).setMaxValue(20).setRequired(true))
      .addStringOption(o=>o.setName('action').setRequired(true).addChoices({name:'Eliminar',value:'delete'},{name:'Advertir',value:'warn'},{name:'Timeout',value:'timeout'},{name:'Ban',value:'ban'})))
    .addSubcommand(s=>s.setName('caps').setDescription('Configura límite de mayúsculas.')
      .addBooleanOption(o=>o.setName('enabled').setRequired(true))
      .addIntegerOption(o=>o.setName('percentage').setMinValue(50).setMaxValue(100).setRequired(true))
      .addStringOption(o=>o.setName('action').setRequired(true).addChoices({name:'Eliminar',value:'delete'},{name:'Advertir',value:'warn'},{name:'Timeout',value:'timeout'},{name:'Ban',value:'ban'}))),
  new SlashCommandBuilder().setName('giveaway').setDescription('Gestiona sorteos.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('create').setDescription('Crea un sorteo.')
      .addStringOption(o=>o.setName('duracion').setDescription('Ejemplo: 10m, 2h, 1d').setRequired(true))
      .addIntegerOption(o=>o.setName('ganadores').setDescription('Ganadores').setMinValue(1).setMaxValue(20).setRequired(true))
      .addStringOption(o=>o.setName('premio').setDescription('Premio').setMaxLength(256).setRequired(true)))
    .addSubcommand(s=>s.setName('end').setDescription('Finaliza un sorteo.')
      .addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
    .addSubcommand(s=>s.setName('reroll').setDescription('Selecciona nuevos ganadores.')
      .addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
    .addSubcommand(s=>s.setName('cancel').setDescription('Cancela un sorteo.')
      .addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
    .addSubcommand(s=>s.setName('list').setDescription('Lista sorteos activos.')),
  new SlashCommandBuilder().setName('vouches').setDescription('Consulta reputación y vouches.')
    .addSubcommand(s=>s.setName('view').setDescription('Ver perfil de reputación.')
      .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(s=>s.setName('top').setDescription('Top 10 de vouches.'))
    .addSubcommand(s=>s.setName('stats').setDescription('Estadísticas del sistema.')),
  new SlashCommandBuilder().setName('stats').setDescription('Muestra estadísticas.')
    .addSubcommand(s=>s.setName('server').setDescription('Estadísticas del servidor.'))
    .addSubcommand(s=>s.setName('bot').setDescription('Estadísticas de Codek Hub.')),
  new SlashCommandBuilder().setName('config').setDescription('Configuración central.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('status').setDescription('Estado de todos los módulos.'))
    .addSubcommand(s=>s.setName('tickets').setDescription('Estado de tickets.'))
    .addSubcommand(s=>s.setName('welcome').setDescription('Estado de bienvenida.'))
    .addSubcommand(s=>s.setName('logs').setDescription('Estado de logs.'))
    .addSubcommand(s=>s.setName('automod').setDescription('Estado de AutoMod.'))
    .addSubcommand(s=>s.setName('vouches').setDescription('Estado de vouches.')),
  new SlashCommandBuilder().setName('health').setDescription('Estado de salud del bot.'),
  new SlashCommandBuilder().setName('backup').setDescription('Backups de configuración.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('create').setDescription('Crea un backup.'))
    .addSubcommand(s=>s.setName('list').setDescription('Lista backups.'))
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

function helpEmbed(){
  return new EmbedBuilder()
    .setAuthor({name:'Codek Hub',iconURL:client.user?.displayAvatarURL({size:128})})
    .setTitle('✨ Codek Hub • Centro de ayuda')
    .setDescription('Todo lo que puedo hacer en este servidor, organizado en un solo lugar.')
    .setColor(0x5865F2)
    .addFields(
      {name:'🎫 Tickets',value:[
        '/tickets panel',
        '/tickets categoria',
        '/tickets pregunta',
        '/tickets publicar',
        '/tickets panel-list',
        '/tickets panel-renombrar',
        '/tickets panel-eliminar',
        '/tickets panel-reset',
        '⚠️ panel-reset elimina toda la configuración de paneles.',
        '/tickets categoria-list',
        '/tickets categoria-eliminar',
        '/tickets pregunta-list',
        '/tickets pregunta-eliminar',
        '/tickets log',
        '/tickets log-reset'
      ].join('\n')},
      {name:'👋 Bienvenida',value:'/welcome set\n/welcome reset'},
      {name:'⭐ Vouches',value:'/vouch\n/vouch-config set\n/vouch-config reset'},
      {name:'🤖 Autoresponders',value:'/autoresponder add\n/autoresponder remove\n/autoresponder list'},
      {name:'🎮 Rich Presence',value:'/presence set\n/presence reset'},
      {name:'🧩 Variables',value:'/variables'},
      {name:'🧹 Moderación',value:'/purge cantidad:100\n/purge canal:true\nTambién puedes usar **?purge 100** o **?purge canal**.'},
      {name:'ℹ️ Ayuda rápida',value:'También puedes mencionar a @Codek Hub y escribir **help**, **ayuda** o **comandos**.'}
    )
    .setFooter({text:'Los comandos de configuración requieren permisos de administrador.'})
    .setTimestamp();
}

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
});

client.on(Events.InteractionCreate,async i=>{
  try{
    if(!i.guildId||!i.guild){
      if(!i.replied&&!i.deferred)await i.reply(deny('Este comando solo puede usarse dentro de un servidor.'));
      return;
    }
    if(i.isChatInputCommand()&&i.commandName!=='help'){
      try{applyCooldown(i.user.id,i.commandName,2)}catch(e){return i.reply(deny(e.message))}
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
      if(i.commandName==='unban'){const id=i.options.getString('usuario').trim();await i.guild.members.unban(id,'Moderación');await recordModeration({guildId:i.guildId,targetId:id,moderatorId:i.user.id,action:'unban'});return i.reply(deny('Usuario desbaneado.'))}
      const target=i.options.getUser('usuario');
      if(i.commandName==='history'){const rows=await moderationHistory(i.guildId,target.id,20);if(!rows.length)return i.reply(deny('No hay historial de moderación para ese usuario.'));return i.reply(deny(rows.map(x=>'• **'+x.action+'** — '+(x.reason||'Sin razón')+' — <t:'+Math.floor(x.createdAt.getTime()/1000)+':R>').join('\n')))}
      const member=await i.guild.members.fetch(target.id).catch(()=>null);if(!member)return i.reply(deny('El usuario no pertenece al servidor.'));
      const reason=i.options.getString('razon')?.trim()||'Sin razón especificada';
      if(i.commandName==='warn'){await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'warn',reason});await target.send('⚠️ Has recibido una advertencia en **'+i.guild.name+'**. Razón: '+reason).catch(()=>{});return i.reply(deny('Advertencia registrada para '+target.toString()+'.'))}
      if(i.commandName==='kick'){await member.kick(reason);await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'kick',reason});return i.reply(deny('Usuario expulsado.'))}
      if(i.commandName==='ban'){await member.ban({reason});await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'ban',reason});return i.reply(deny('Usuario baneado.'))}
      if(i.commandName==='unmute'||i.commandName==='untimeout'){await member.timeout(null,reason);await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'untimeout',reason});return i.reply(deny('Timeout retirado.'))}
      const parsed=parseDuration(i.options.getString('duracion'));if(!parsed)return i.reply(deny('Duración inválida. Usa 30m, 1h, 1d o 1w.'));if(parsed.ms>28*86400000)return i.reply(deny('Discord permite un máximo de 28 días de timeout.'));
      await member.timeout(parsed.ms,reason);await recordModeration({guildId:i.guildId,targetId:target.id,moderatorId:i.user.id,action:'timeout',reason,duration:parsed.seconds,expiresAt:new Date(Date.now()+parsed.ms)});return i.reply(deny('Timeout aplicado a '+target.toString()+'.'));
    }

    if(i.commandName==='logs'){
      const sub=i.options.getSubcommand();
      if(sub==='set'){const channel=i.options.getChannel('canal');await prisma.guild.update({where:{id:i.guildId},data:{logChannelId:channel.id}});await prisma.logConfig.upsert({where:{guildId:i.guildId},update:{channelId:channel.id},create:{guildId:i.guildId,channelId:channel.id,events:['MESSAGE_DELETE','MESSAGE_EDIT','MEMBER_JOIN','MEMBER_LEAVE','MEMBER_UPDATE','ROLE_CREATE','ROLE_DELETE','CHANNEL_CREATE','CHANNEL_DELETE','MODERATION','TICKET_CREATE','TICKET_CLOSE','TICKET_CLAIM','COMMAND']}});return i.reply(deny('📋 Canal de logs configurado en '+channel.toString()+'.'))}
      if(sub==='disable'){await prisma.guild.update({where:{id:i.guildId},data:{logChannelId:null}});await prisma.logConfig.deleteMany({where:{guildId:i.guildId}});return i.reply(deny('📋 Logs desactivados.'))}
      const row=await prisma.logConfig.findUnique({where:{guildId:i.guildId}});return i.reply(deny(row?'📋 Logs activos en <#'+row.channelId+'>.':'📋 Logs desactivados.'));
    }
    if(i.commandName==='automod'){
      const sub=i.options.getSubcommand();
      if(sub==='setup'){const rows=await prisma.autoModRule.findMany({where:{guildId:i.guildId},orderBy:{type:'asc'}});return i.reply(deny(rows.length?rows.map(r=>'• **'+r.type+'** — '+(r.enabled?'🟢':'⚪')+' — '+r.action+(r.threshold?' — '+r.threshold:'')).join('\n'):'No hay reglas AutoMod.'))}
      const enabled=i.options.getBoolean('enabled');const action=i.options.getString('action');
      const threshold=sub==='spam'?i.options.getInteger('limit'):sub==='mentions'?i.options.getInteger('limit'):sub==='caps'?i.options.getInteger('percentage'):null;
      const whitelist=sub==='links'?String(i.options.getString('whitelist')||'').split(',').map(x=>x.trim()).filter(Boolean):sub==='words'?String(i.options.getString('words')||'').split(',').map(x=>x.trim()).filter(Boolean):[];
      await prisma.autoModRule.upsert({where:{guildId_type:{guildId:i.guildId,type:sub}},update:{enabled,action,threshold,whitelist},create:{guildId:i.guildId,type:sub,enabled,action,threshold,whitelist,exceptions:[]}});
      return i.reply(deny('🤖 Regla AutoMod **'+sub+'** actualizada.'));
    }

    if(i.commandName==='giveaway'){
      const sub=i.options.getSubcommand();
      if(sub==='create'){const parsed=parseDuration(i.options.getString('duracion'));if(!parsed)return i.reply(deny('Duración inválida. Usa 10m, 2h o 1d.'));await i.deferReply({flags:64});const endsAt=new Date(Date.now()+parsed.ms);const message=await i.channel.send({embeds:[new EmbedBuilder().setTitle('🎉 Sorteo').setDescription('**'+i.options.getString('premio')+'**\n\nFinaliza <t:'+Math.floor(endsAt.getTime()/1000)+':R>\nParticipa con el botón de abajo.').setColor(0x5865F2)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway:pending').setLabel('🎉 Participar').setStyle(ButtonStyle.Success))]});const row=await createGiveaway({guildId:i.guildId,channelId:i.channelId,messageId:message.id,prize:i.options.getString('premio'),winners:i.options.getInteger('ganadores'),endsAt,createdBy:i.user.id});await message.edit({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway:join:'+row.id).setLabel('🎉 Participar (0)').setStyle(ButtonStyle.Success))]});return i.editReply(deny('Sorteo creado. ID: `'+row.id+'`'))}
      if(sub==='list'){const rows=await prisma.giveaway.findMany({where:{guildId:i.guildId,ended:false},orderBy:{endsAt:'asc'}});return i.reply(deny(rows.length?rows.map(r=>'• `'+r.id+'` — **'+r.prize+'** — '+r.participants.length+' participantes').join('\n'):'No hay sorteos activos.'))}
      const id=i.options.getString('id');const row=await prisma.giveaway.findFirst({where:{id,guildId:i.guildId}});if(!row)return i.reply(deny('Sorteo no encontrado.'));
      if(sub==='cancel'){await cancelGiveaway(row);return i.reply(deny('Sorteo cancelado.'))}
      if(sub==='end'||sub==='reroll'){const pool=[...(row.participants||[])];const winners=[];while(pool.length&&winners.length<row.winners)winners.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);await prisma.giveaway.update({where:{id:row.id},data:{ended:sub==='end'?true:row.ended,winnerIds:winners}});const channel=i.guild.channels.cache.get(row.channelId);if(channel?.isTextBased())await channel.send('🎉 Ganadores del sorteo **'+row.prize+'**: '+(winners.map(x=>'<@'+x+'>').join(', ')||'ninguno'));return i.reply(deny(sub==='end'?'Sorteo finalizado.':'Reroll realizado.'))}
    }

    if(i.isButton()&&i.customId.startsWith('giveaway:join:')){const id=i.customId.split(':')[2];const row=await toggleParticipant(id,i.user.id);if(!row)return i.reply(deny('Este sorteo ya terminó.'));await i.message.edit({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway:join:'+row.id).setLabel('🎉 Participar ('+row.participants.length+')').setStyle(ButtonStyle.Success))]}).catch(()=>{});return i.reply(deny(row.participants.includes(i.user.id)?'Participación registrada.':'Has salido del sorteo.'))}

    if(i.commandName==='vouches'){const sub=i.options.getSubcommand();if(sub==='view'){const user=i.options.getUser('usuario');const rows=await prisma.vouch.findMany({where:{guildId:i.guildId,targetId:user.id},orderBy:{createdAt:'desc'},take:20});const avg=rows.length?rows.reduce((sum,r)=>sum+r.rating,0)/rows.length:0;return i.reply({embeds:[new EmbedBuilder().setTitle('⭐ Reputación de '+user.username).setDescription('Vouches: **'+rows.length+'**\nRating promedio: **'+avg.toFixed(2)+'/5**\nNivel: **'+(Math.floor(rows.length/10)+1)+'**').setColor(0xFEE75C).setThumbnail(user.displayAvatarURL({size:256}))]})}if(sub==='top'){const grouped=await prisma.vouch.groupBy({by:['targetId'],where:{guildId:i.guildId},_count:{targetId:true},orderBy:{_count:{targetId:'desc'}},take:10});const lines=[];for(const row of grouped){const user=await client.users.fetch(row.targetId).catch(()=>null);lines.push('**'+(lines.length+1)+'.** '+(user?.toString()||row.targetId)+' — '+row._count.targetId)}return i.reply(deny(lines.length?lines.join('\n'):'No hay vouches.'))}const total=await prisma.vouch.count({where:{guildId:i.guildId}});const avg=await prisma.vouch.aggregate({where:{guildId:i.guildId},_avg:{rating:true}});return i.reply(deny('⭐ Vouches totales: **'+total+'**\nRating promedio: **'+(avg._avg.rating?.toFixed(2)||'0')+'/5'))}

    if(i.commandName==='stats'){const sub=i.options.getSubcommand();if(sub==='server'){const st=await serverStats(i.guild);return i.reply({embeds:[new EmbedBuilder().setTitle('📊 Estadísticas de '+i.guild.name).addFields({name:'👥 Miembros',value:String(st.members),inline:true},{name:'👤 Humanos',value:String(st.humans),inline:true},{name:'🤖 Bots',value:String(st.bots),inline:true},{name:'🎭 Roles',value:String(st.roles),inline:true},{name:'📚 Canales',value:String(st.channels),inline:true},{name:'📁 Categorías',value:String(st.categories),inline:true},{name:'🚀 Boosts',value:String(st.boosts)+' • Nivel '+st.boostLevel,inline:true},{name:'👑 Owner',value:'<@'+st.ownerId+'>',inline:true}).setColor(0x5865F2)]})}const st=await botStats(i.guildId);return i.reply(deny('🤖 Codek Hub\nTickets: '+st.tickets+'\nVouches: '+st.vouches+'\nComandos: '+st.commands+'\nModeración: '+st.moderation+'\nUptime: '+formatUptime(process.uptime())+'\nNode: '+process.version))}

    if(i.commandName==='config'){const sub=i.options.getSubcommand();const [welcome,vouch,panels,autoRules,logs]=await Promise.all([prisma.welcomeConfig.findUnique({where:{guildId:i.guildId}}),prisma.vouchConfig.findUnique({where:{guildId:i.guildId}}),prisma.ticketPanel.count({where:{guildId:i.guildId}}),prisma.autoModRule.count({where:{guildId:i.guildId,enabled:true}}),prisma.logConfig.findUnique({where:{guildId:i.guildId}})]);if(sub==='tickets')return i.reply(deny('🎫 Tickets: '+(panels?'✅':'❌')+' ('+panels+' paneles)'));if(sub==='welcome')return i.reply(deny('👋 Welcome: '+(welcome?.enabled?'✅':'❌')));if(sub==='logs')return i.reply(deny('📋 Logs: '+(logs?'✅':'❌')));if(sub==='automod')return i.reply(deny('🤖 AutoMod: '+(autoRules?'✅':'❌')+' ('+autoRules+' reglas)'));if(sub==='vouches')return i.reply(deny('⭐ Vouches: '+(vouch?.enabled?'✅':'❌')));return i.reply(deny('⚙️ Configuración\n🎫 Tickets '+(panels?'✅':'❌')+'\n👋 Welcome '+(welcome?.enabled?'✅':'❌')+'\n⭐ Vouches '+(vouch?.enabled?'✅':'❌')+'\n🤖 AutoMod '+(autoRules?'✅':'❌')+'\n📋 Logs '+(logs?'✅':'❌')))}

    if(i.commandName==='health'){const started=Date.now();await prisma.$queryRawUnsafe('SELECT 1');const dbMs=Date.now()-started;const since=new Date(Date.now()-86400000);const commands24=await prisma.auditLog.count({where:{guildId:i.guildId,module:'command',createdAt:{gte:since}}});return i.reply(deny('🩺 Health Check\nPostgreSQL: 🟢 '+dbMs+' ms\nDiscord: 🟢 '+Math.max(0,Math.round(client.ws.ping))+' ms\nUptime: '+formatUptime(process.uptime())+'\nMemoria: '+Math.round(process.memoryUsage().rss/1024/1024)+' MB\nComandos 24h: '+commands24))}

    if(i.commandName==='backup'){const sub=i.options.getSubcommand();const dir=path.join(process.cwd(),'backups');await mkdir(dir,{recursive:true});if(sub==='create'){const data=await prisma.guild.findUnique({where:{id:i.guildId},include:{welcomeConfig:true,vouchConfig:true,presenceConfig:true,panels:{include:{categories:{include:{questions:true}}}},autoResponders:true,logConfig:true,autoModRules:true}});const file='guild-'+i.guildId+'-'+Date.now()+'.json';await writeFile(path.join(dir,file),JSON.stringify(data,null,2),'utf8');return i.reply(deny('💾 Backup creado: `'+file+'`'))}const files=(await readdir(dir)).filter(x=>x.startsWith('guild-'+i.guildId+'-')&&x.endsWith('.json'));return i.reply(deny(files.length?files.map(x=>'• '+x).join('\n'):'No hay backups para este servidor.'))}
    if(i.commandName==='tickets'){
      const sub=i.options.getSubcommand();
      const staffSubs=new Set(['reclamar','liberar','adduser','removeuser','cerrar','reabrir','renombrar','mover','prioridad','stats','transcript']);
      if(staffSubs.has(sub)){
        if(sub==='stats'){const st=await ticketStats(i.guildId);return i.reply(deny('🎫 Estadísticas\nAbiertos: '+st.open+'\nCerrados: '+st.closed+'\nReclamos: '+st.claims+'\nCategorías: '+st.categories.length))}
        const ticket=await findTicket(i.guildId,i.options.getString('ticket'));
        if(!ticket)return i.reply(deny('Ticket no encontrado.'));
        if(sub==='reclamar'){const result=await claimTicket(ticket,i.user.id);await audit(i.guildId,i.user.id,'tickets','claimed','ticket:'+ticket.id);return i.reply(deny(result.message))}
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
      await i.reply(deny('Ocurrió un error al ejecutar el comando. Revisa los logs del bot.')).catch(()=>{});
    }
  }
});

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
  try{await processAutoMod(message)}catch(e){originalConsole.error('AutoMod failed',e)}
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

client.once(Events.ClientReady,()=>{installConsoleBridge();void processDueGiveaways()});

client.login(env.DISCORD_TOKEN).catch(e=>{
  logger.error('Discord login failed',{error:e.message});
  void shutdown('login_failed',1);
});