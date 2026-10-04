import { applyCooldown } from '../middleware/rateLimit.js';
import { handleComponentInteraction } from '../interactions/componentHandler.js';
import { handleCommandInteraction } from '../interactions/commandHandler.js';
import { Events } from 'discord.js';

export function registerInteractionHandler(client,deps){
  const {prisma,logger,deny,clip,safeUrl,color,context,audit,createTicket,closeTicket,handleDiscordError,renderVariables}=deps;
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
    const message=deny(handleDiscordError(e));
    if(i.deferred){
      await i.editReply(message).catch(()=>{});
    }else if(!i.replied){
      await i.reply(message).catch(()=>{});
    }
  }
  });
}
