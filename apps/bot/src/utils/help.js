import { EmbedBuilder } from 'discord.js';

export function createHelpEmbed(client){
  return new EmbedBuilder()
    .setAuthor({name:'Codek Hub',iconURL:client.user?.displayAvatarURL({size:128})})
    .setTitle('✨ Codek Hub • Centro de ayuda')
    .setDescription('Todo lo que puedo hacer en este servidor, organizado en un solo lugar.')
    .setColor(0x5865F2)
    .addFields(
      {name:'🎫 Tickets',value:['/tickets panel • categoria • pregunta • publicar','/tickets reclamar • liberar • adduser • removeuser','/tickets cerrar • reabrir • renombrar • mover • prioridad','/tickets stats • transcript','/tickets panel-list • panel-renombrar • panel-eliminar • panel-reset','/tickets categoria-list • categoria-eliminar','/tickets pregunta-list • pregunta-eliminar','/tickets log • log-reset'].join('\n')},
      {name:'👋 Bienvenida',value:'/welcome set • reset • test • preview'},
      {name:'⭐ Vouches',value:'/vouch\n/vouch-config set\n/vouch-config reset'},
      {name:'🤖 Autoresponders',value:'/autoresponder add\n/autoresponder remove\n/autoresponder list'},
      {name:'🎮 Rich Presence',value:'/presence set\n/presence reset'},
      {name:'🧩 Variables',value:'/variables'},
      {name:'🛡️ Moderación',value:'/warn • /mute • /unmute • /kick • /ban • /unban\n/timeout • /untimeout • /history • /clear\n/purge cantidad:100 • ?purge 100 • ?purge canal'},
      {name:'📋 Logs',value:'/logs set • /logs disable • /logs status'},
      {name:'🤖 AutoMod',value:'/automod setup • spam • links • invites • words • mentions • caps'},
      {name:'🎉 Giveaways',value:'/giveaway create • end • reroll • cancel • list'},
      {name:'📊 Estadísticas',value:'/stats server • /stats bot • /vouches view • /vouches top • /vouches stats'},
      {name:'⚙️ Configuración',value:'/config status • tickets • welcome • logs • automod • vouches\n/health • /backup create • /backup list • /backup restore'},
      {name:'ℹ️ Ayuda rápida',value:'También puedes mencionar a @Codek Hub y escribir **help**, **ayuda** o **comandos**.'}
    )
    .setFooter({text:'Los comandos de configuración requieren permisos de administrador.'})
    .setTimestamp();
}