import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder()
    .setName('purge').setDescription('Elimina mensajes del canal actual.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName('cantidad').setDescription('Cantidad de mensajes a eliminar').setMinValue(1).setMaxValue(10000))
    .addBooleanOption(o=>o.setName('canal').setDescription('Elimina todo el historial del canal actual'));
