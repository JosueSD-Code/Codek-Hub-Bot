import { PermissionFlagsBits } from 'discord.js';

const names=Object.fromEntries(Object.entries(PermissionFlagsBits).map(([name,value])=>[String(value),name]));

export async function checkBotPermissions(interaction,required=[]){
  const member=interaction.guild?.members?.me??await interaction.guild?.members?.fetchMe?.().catch(()=>null);
  const missing=required.filter(permission=>!member?.permissions?.has(permission));
  if(missing.length){
    throw new Error('Necesito estos permisos: '+missing.map(permission=>names[String(permission)]||String(permission)).join(', '));
  }
  return true;
}
