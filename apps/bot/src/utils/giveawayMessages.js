import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function disableGiveawayMessage(client,giveaway,logger){
  try{
    const channel=client.channels.cache.get(giveaway.channelId)
      ?? await client.channels.fetch(giveaway.channelId).catch(()=>null);
    if(!channel?.isTextBased()||!channel.messages?.fetch)return false;

    const message=await channel.messages.fetch(giveaway.messageId).catch(()=>null);
    if(!message)return false;

    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('giveaway:join:'+giveaway.id)
        .setLabel('Sorteo finalizado')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await message.edit({components:[row]});
    return true;
  }catch(error){
    logger?.warn?.('Could not disable giveaway participation button',{
      giveawayId:giveaway.id,
      messageId:giveaway.messageId,
      error:error.message
    });
    return false;
  }
}
