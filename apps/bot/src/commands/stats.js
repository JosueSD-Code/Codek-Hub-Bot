import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder().setName('stats').setDescription('Muestra estadísticas.')
    .addSubcommand(s=>s.setName('server').setDescription('Estadísticas del servidor.'))
    .addSubcommand(s=>s.setName('bot').setDescription('Estadísticas de Codek Hub.'));
