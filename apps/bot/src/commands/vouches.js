import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder().setName('vouches').setDescription('Consulta reputación y vouches.')
    .addSubcommand(s=>s.setName('view').setDescription('Ver perfil de reputación.')
      .addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(s=>s.setName('top').setDescription('Top 10 de vouches.'))
    .addSubcommand(s=>s.setName('stats').setDescription('Estadísticas del sistema.'));
