import { applyCooldown } from '../middleware/rateLimit.js';
import { checkBotPermissions } from '../middleware/botPermissions.js';
import { handleComponentInteraction } from '../interactions/componentHandler.js';
import { handleCommandInteraction } from '../interactions/commandHandler.js';
import { Events } from 'discord.js';

export function registerInteractionHandler(client,deps){
  const clean=v=>String(v||'ticket').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,45)||'ticket';
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
  const cooldowns=new Map();

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

    if(await handleComponentInteraction(i,{client,prisma,deny,clip,safeUrl,color,context,renderVariables,audit,createTicket,closeTicket,cooldowns}))return;

    if(i.isChatInputCommand())return handleCommandInteraction(i,{...deps,client,cooldowns});
  }catch(e){
    logger.error('Interaction error',{error:e.message,stack:e.stack});
    if(!i.replied&&!i.deferred){
      await i.reply(deny(handleDiscordError(e))).catch(()=>{});
    }
  }
  });
}
