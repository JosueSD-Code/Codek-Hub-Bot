import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder().setName('config').setDescription('Configuración central.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('status').setDescription('Estado de todos los módulos.'))
    .addSubcommand(s=>s.setName('tickets').setDescription('Estado de tickets.'))
    .addSubcommand(s=>s.setName('welcome').setDescription('Estado de bienvenida.'))
    .addSubcommand(s=>s.setName('logs').setDescription('Estado de logs.'))
    .addSubcommand(s=>s.setName('automod').setDescription('Estado de AutoMod.'))
    .addSubcommand(s=>s.setName('vouches').setDescription('Estado de vouches.'));
