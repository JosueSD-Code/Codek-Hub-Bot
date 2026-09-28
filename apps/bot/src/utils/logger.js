import { EmbedBuilder } from 'discord.js';

let client=null;
let getChannelId=async()=>null;
let forwarding=false;

export function configureDiscordLogger(discordClient,channelResolver){
  client=discordClient;
  getChannelId=channelResolver;
}

function color(level){
  return level==='error'?0xED4245:level==='warn'?0xFEE75C:level==='debug'?0x5865F2:0x57F287;
}

export async function sendConsoleLog(level,message,metadata={}){
  if(!client||forwarding)return;
  const channelId=await getChannelId().catch(()=>null);
  if(!channelId)return;
  const channel=await client.channels.fetch(channelId).catch(()=>null);
  if(!channel?.isTextBased())return;
  const body=String(message??'').slice(0,3900);
  const embed=new EmbedBuilder()
    .setTitle('📝 Console Log • '+String(level).toUpperCase())
    .setDescription('```\\n'+body+'\\n```')
    .setColor(color(level))
    .setTimestamp();
  if(Object.keys(metadata).length){
    embed.addFields({name:'Metadata',value:'```json\\n'+JSON.stringify(metadata,null,2).slice(0,900)+'\\n```'});
  }
  forwarding=true;
  try{await channel.send({embeds:[embed]})}finally{forwarding=false}
}
