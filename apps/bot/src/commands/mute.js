import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder().setName('mute').setDescription('Aplica timeout a un usuario.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addStringOption(o=>o.setName('duracion').setDescription('Ejemplo: 1h, 30m, 1d').setRequired(true))
    .addStringOption(o=>o.setName('razon').setDescription('Razón'));
