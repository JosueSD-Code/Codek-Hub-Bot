import { Events } from 'discord.js';
export function register(client,{logToChannel}){
  client.on(Events.ChannelUpdate,async(oldChannel,newChannel)=>{
    if(!newChannel.guild)return;
    const changes=[];
    if(oldChannel.name!==newChannel.name)changes.push('Nombre: **'+oldChannel.name+'** → **'+newChannel.name+'**');
    if(oldChannel.parentId!==newChannel.parentId)changes.push('Categoría: '+(oldChannel.parentId?'<#'+oldChannel.parentId+'>':'ninguna')+' → '+(newChannel.parentId?'<#'+newChannel.parentId+'>':'ninguna'));
    const oldOverwrites=oldChannel.permissionOverwrites?.cache;
    const newOverwrites=newChannel.permissionOverwrites?.cache;
    if(oldOverwrites&&newOverwrites){
      const ids=new Set([...oldOverwrites.keys(),...newOverwrites.keys()]);
      for(const id of ids){
        const a=oldOverwrites.get(id)?.allow?.bitfield?.toString()+':'+oldOverwrites.get(id)?.deny?.bitfield?.toString();
        const b=newOverwrites.get(id)?.allow?.bitfield?.toString()+':'+newOverwrites.get(id)?.deny?.bitfield?.toString();
        if(a!==b){changes.push('Permisos modificados para '+(newChannel.guild.roles.cache.has(id)?'<@&'+id+'>':'<@'+id+'>'));break;}
      }
    }
    if(changes.length)await logToChannel(newChannel.guild,'✏️ Canal actualizado','Canal: '+newChannel.toString()+'\n'+changes.join('\n'),'CHANNEL_UPDATE');
  });
}