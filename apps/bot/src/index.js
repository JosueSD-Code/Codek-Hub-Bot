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
import { createTicketRuntime } from './services/ticketService.js';
import { purgeChannelMessages,purgeEverything } from './services/purgeService.js';
import { createHelpEmbed } from './utils/help.js';

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

const helpEmbed=()=>createHelpEmbed(client);


const {logToChannel}=createLogService(prisma,logger);
const ticketRuntime=createTicketRuntime({client,logger,audit,renderVariables,context,clip,deny,logToChannel});
const {findUniquePanel,findUniqueCategory,deleteOpenTicketsForCategory,createTicket,closeTicket}=ticketRuntime;

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