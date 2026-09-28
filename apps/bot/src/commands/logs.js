import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder().setName('logs').setDescription('Configura los logs.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('set').setDescription('Configura el canal de logs.')
      .addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s=>s.setName('disable').setDescription('Desactiva los logs.'))
    .addSubcommand(s=>s.setName('status').setDescription('Muestra la configuración.'));
