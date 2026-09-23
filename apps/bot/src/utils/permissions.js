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
  if(!guild?.roles?.cache)return [];
  const requested=[...new Set(String(names??'')
    .split(',')
    .map(value=>value.trim())
    .filter(Boolean)
    .map(name=>name.toLowerCase()))];
  const roles=[...guild.roles.cache.values?.() ?? guild.roles.cache];
  return requested
    .map(name=>roles.find(role=>role.name.toLowerCase()===name))
    .filter(Boolean)
    .map(role=>role.id);
}
