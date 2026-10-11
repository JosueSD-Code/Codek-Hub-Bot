import { REST, Routes } from 'discord.js';
export async function deployCommands(client,env,commands,logger){
  const rest=new REST({version:'10'}).setToken(env.DISCORD_TOKEN);
  const body=commands.map(command=>command.toJSON());
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID),{body:[]});
  let deployed=0;
  for(const guild of client.guilds.cache.values()){
    try{await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID,guild.id),{body});deployed++}
    catch(e){logger.warn('Could not deploy guild commands',{guildId:guild.id,error:e.message})}
  }
  if(client.guilds.cache.size>0&&deployed===0){
    throw new Error('Command registration failed in every connected guild. Check the Discord API validation errors above.');
  }
  logger.info('Commands deployed to guilds',{count:body.length,guilds:deployed});
}