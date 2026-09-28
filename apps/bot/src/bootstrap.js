import { Client, GatewayIntentBits } from 'discord.js';
import {
  loadEnvironment,
  logger,
  renderVariables,
  prisma,
  ensureGuild,
  findAutoResponder,
  audit
} from '../../../packages/shared/src/index.js';

import { ADMIN, isAdmin, deny, roleIdsByName } from './utils/permissions.js';
import { clip, safeUrl, isHexColor } from './utils/validation.js';
import { color } from './utils/embeds.js';
import { handleDiscordError } from './middleware/validation.js';
import { recordModeration, history as moderationHistory, parseDuration } from './services/moderationService.js';
import { processAutoMod } from './services/automodService.js';
import { serverStats, botStats } from './services/statsService.js';
import {
  findTicket,
  claim as claimTicket,
  release as releaseTicket,
  addUser as addTicketUser,
  removeUser as removeTicketUser,
  rename as renameTicket,
  move as moveTicket,
  stats as ticketStats,
  createTicketRuntime
} from './services/ticketService.js';
import {
  create as createGiveaway,
  toggleParticipant,
  end as endGiveaway,
  cancel as cancelGiveaway
} from './services/giveawayService.js';
import { configureDiscordLogger, sendConsoleLog } from './utils/logger.js';
import { registerInteractionHandler } from './handlers/interactionHandler.js';
import { registerEvents } from './events/index.js';
import { createLogService } from './services/logService.js';
import { purgeChannelMessages, purgeEverything } from './services/purgeService.js';
import { createPresenceService } from './services/presenceService.js';
import { deployCommands } from './handlers/commandHandler.js';
import { registerLifecycle } from './handlers/lifecycleHandler.js';
import { createHelpEmbed } from './utils/help.js';
import { commands } from './commands/index.js';

const roleIds=(guild,value)=>roleIdsByName(guild,value);

const normalizeEmoji=(guild,value)=>{
  const raw=String(value||'').trim();
  if(!raw)return null;

  const custom=raw.match(/^<a?:([\\w~]+):(\\d+)>$/);
  if(custom){
    const emoji=guild?.emojis?.cache?.get(custom[2]);
    if(!emoji)return null;
    return {id:emoji.id,name:emoji.name||custom[1],animated:emoji.animated};
  }

  const byName=guild?.emojis?.cache?.find(
    emoji=>emoji.name?.toLowerCase()===raw.toLowerCase()
  );
  if(byName){
    return {id:byName.id,name:byName.name||raw,animated:byName.animated};
  }

  return raw;
};

const emojiExists=(guild,value)=>Boolean(normalizeEmoji(guild,value));

const context=(user,guild,channel,extra={})=>{
  const avatar=user?.displayAvatarURL?.({size:1024,extension:'png'})
    ||user?.displayAvatarURL?.()
    ||'';
  const guildIcon=guild?.iconURL?.({size:1024,extension:'png'})||'';

  return {
    user:user?.toString?.()||'user',
    mention:user?.toString?.()||'user',
    username:user?.username||'user',
    tag:user?.tag||user?.username||'user',
    usertag:user?.tag||user?.username||'user',
    displayname:user?.globalName||user?.displayName||user?.username||'user',
    displayname_raw:user?.globalName||user?.displayName||user?.username||'user',
    useravatar:avatar,
    avatar,
    user_avatar:avatar,
    server:guild?.name||'server',
    guild:guild?.name||'server',
    membercount:guild?.memberCount??0,
    guildicon:guildIcon,
    servericon:guildIcon,
    channel:channel?.toString?.()||'channel',
    channelname:channel?.name||'channel',
    ...extra
  };
};

export async function startBot(){
  const env=loadEnvironment();
  const client=new Client({
    intents:[
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  const {logToChannel}=createLogService(prisma,logger);
  const ticketRuntime=createTicketRuntime({
    client,
    logger,
    audit,
    renderVariables,
    context,
    clip,
    deny,
    logToChannel
  });
  const presence=createPresenceService(client,prisma);
  const deploy=()=>deployCommands(client,env,commands,logger);
  const shutdown=registerLifecycle({client,prisma,logger});
  const helpEmbed=()=>createHelpEmbed(client);

  const {
    findUniquePanel,
    findUniqueCategory,
    deleteOpenTicketsForCategory,
    createTicket,
    closeTicket
  }=ticketRuntime;

  const shared={
    prisma,
    logger,
    commands,
    env,
    ADMIN,
    isAdmin,
    deny,
    roleIds,
    clip,
    safeUrl,
    isHexColor,
    color,
    normalizeEmoji,
    emojiExists,
    context,
    findUniquePanel,
    findUniqueCategory,
    deleteOpenTicketsForCategory,
    createTicket,
    closeTicket,
    findTicket,
    claimTicket,
    releaseTicket,
    addTicketUser,
    removeTicketUser,
    renameTicket,
    moveTicket,
    ticketStats,
    recordModeration,
    moderationHistory,
    parseDuration,
    processAutoMod,
    serverStats,
    botStats,
    createGiveaway,
    toggleParticipant,
    endGiveaway,
    cancelGiveaway,
    audit,
    handleDiscordError,
    renderVariables,
    presence,
    purgeChannelMessages,
    purgeEverything,
    helpEmbed,
    findAutoResponder,
    ensureGuild,
    deploy,
    configureDiscordLogger,
    sendConsoleLog,
    logToChannel
  };

  registerInteractionHandler(client,shared);
  registerEvents(client,shared);

  client.login(env.DISCORD_TOKEN).catch(error=>{
    logger.error('Discord login failed',{error:error.message});
    void shutdown('login_failed',1);
  });
}
