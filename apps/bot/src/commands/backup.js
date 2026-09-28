import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder().setName('backup').setDescription('Backups de configuración.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('create').setDescription('Crea un backup.'))
    .addSubcommand(s=>s.setName('list').setDescription('Lista backups.'))
    .addSubcommand(s=>s.setName('restore').setDescription('Restaura configuración desde un backup.')
      .addStringOption(o=>o.setName('archivo').setDescription('Nombre del archivo de backup').setRequired(true))
      .addBooleanOption(o=>o.setName('confirmar').setDescription('Confirma la restauración').setRequired(true)));
