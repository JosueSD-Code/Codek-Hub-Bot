import { Events } from 'discord.js';

export function register(client,{logToChannel}){
  client.on(Events.RoleUpdate,async(oldRole,newRole)=>{
    try{
      const changes=[];
      if(oldRole.name!==newRole.name){
        changes.push('Nombre: **'+oldRole.name+'** → **'+newRole.name+'**');
      }
      if(oldRole.color!==newRole.color){
        changes.push('Color: '+(oldRole.hexColor||'#000000')+' → '+(newRole.hexColor||'#000000'));
      }
      if(oldRole.permissions.bitfield!==newRole.permissions.bitfield){
        changes.push('Permisos del rol modificados.');
      }
      if(oldRole.hoist!==newRole.hoist){
        changes.push('Mostrar separado: '+(oldRole.hoist?'sí':'no')+' → '+(newRole.hoist?'sí':'no'));
      }
      if(oldRole.mentionable!==newRole.mentionable){
        changes.push('Mencionable: '+(oldRole.mentionable?'sí':'no')+' → '+(newRole.mentionable?'sí':'no'));
      }
      if(!changes.length)return;

      await logToChannel(
        newRole.guild,
        '✏️ Rol actualizado',
        'Rol: '+newRole.toString()+'\nID: '+newRole.id+'\n'+changes.join('\n'),
        'ROLE_UPDATE'
      );
    }catch{}
  });
}
