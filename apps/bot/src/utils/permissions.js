import { PermissionFlagsBits } from 'discord.js';

export const ADMIN=PermissionFlagsBits.Administrator;

export function isAdmin(value){
  return Boolean(
    value?.memberPermissions?.has?.(ADMIN) ||
    value?.permissions?.has?.(ADMIN) ||
    value?.member?.permissions?.has?.(ADMIN)
  );
}

export function deny(content){
  return {content:String(content??''),flags:64};
}

export function roleIdsByName(guild,names){
  return String(names??'')
    .split(',')
    .map(value=>value.trim())
    .filter(Boolean)
    .map(name=>guild?.roles?.cache?.find(role=>role.name.toLowerCase()===name.toLowerCase()))
    .filter(Boolean)
    .map(role=>role.id);
}
