import { PermissionFlagsBits } from 'discord.js';

export const ADMIN=PermissionFlagsBits.Administrator;

export function isAdmin(value){
  const permissions=value?.memberPermissions??value?.permissions??value?.member?.permissions;
  return Boolean(permissions?.has?.(ADMIN));
}

export function deny(content){
  return {content:String(content??''),flags:64};
}

export function roleIdsByName(guild,names){
  const cache=guild?.roles?.cache;
  if(!cache)return [];
  const requested=[...new Set(String(names??'')
    .split(',')
    .map(value=>value.trim())
    .filter(Boolean)
    .map(name=>name.toLowerCase()))];

  let roles=[];
  if(typeof cache.values==='function'){
    roles=[...cache.values()];
  }else if(typeof cache[Symbol.iterator]==='function'){
    roles=[...cache];
  }else if(typeof cache==='object'){
    roles=Object.values(cache);
  }

  return requested
    .map(name=>roles.find(role=>String(role?.name??'').toLowerCase()===name))
    .filter(Boolean)
    .map(role=>role.id);
}
