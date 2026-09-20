const PUBLIC_VARIABLES={
  user:'user',mention:'mention',username:'username',tag:'tag',usertag:'usertag',
  displayname:'displayname',displayname_raw:'displayname_raw',
  useravatar:'useravatar',avatar:'avatar',user_avatar:'user_avatar',
  server:'server',guild:'guild',membercount:'membercount',
  guildicon:'guildicon',servericon:'servericon',
  channel:'channel',channelname:'channelname',
  ticket:'ticket',category:'category',staff:'staff',
  client:'client',clientavatar:'clientavatar',target:'target',targetavatar:'targetavatar'
};

export function renderVariables(template,context={}){
  if(typeof template!=='string')return '';
  const values={
    user:context.user??context.username??'user',
    mention:context.mention??context.user??context.username??'user',
    username:context.username??'user',
    tag:context.tag??context.usertag??context.username??'user',
    usertag:context.usertag??context.tag??context.username??'user',
    displayname:context.displayname??context.displayName??context.username??'user',
    displayname_raw:context.displayname_raw??context.displayname??context.username??'user',
    useravatar:context.useravatar??context.avatar??context.user_avatar??'',
    avatar:context.avatar??context.useravatar??context.user_avatar??'',
    user_avatar:context.user_avatar??context.useravatar??context.avatar??'',
    server:context.server??context.guild??context.guildName??'server',
    guild:context.guild??context.server??context.guildName??'server',
    membercount:context.membercount??context.memberCount??'0',
    guildicon:context.guildicon??context.servericon??context.guildIcon??'',
    servericon:context.servericon??context.guildicon??context.guildIcon??'',
    channel:context.channel??'channel',
    channelname:context.channelname??context.channelName??'channel',
    ticket:context.ticket??context.ticketNumber??'0',
    category:context.category??context.ticketCategory??'general',
    staff:context.staff??context.ticketStaff??'staff',
    client:context.client??context.reviewer??context.user??'user',
    clientavatar:context.clientavatar??context.reviewerAvatar??context.useravatar??'',
    target:context.target??context.targetMention??'user',
    targetavatar:context.targetavatar??context.targetAvatar??''
  };
  return template.replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g,(_,key)=>{
    const normalized=key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(values,normalized)?String(values[normalized]):'{'+key+'}';
  });
}

export const VARIABLES=Object.freeze(Object.keys(PUBLIC_VARIABLES));
