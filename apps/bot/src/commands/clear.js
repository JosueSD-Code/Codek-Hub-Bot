import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder().setName('clear').setDescription('Elimina mensajes.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o=>o.setName('cantidad').setDescription('Cantidad 1-10000').setMinValue(1).setMaxValue(10000).setRequired(true));
