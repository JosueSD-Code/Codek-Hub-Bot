import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder().setName('ban').setDescription('Banea a un usuario.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o=>o.setName('razon').setDescription('Razón'));
