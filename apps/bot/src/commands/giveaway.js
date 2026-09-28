import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder().setName('giveaway').setDescription('Gestiona sorteos.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('create').setDescription('Crea un sorteo.')
      .addStringOption(o=>o.setName('duracion').setDescription('Ejemplo: 10m, 2h, 1d').setRequired(true))
      .addIntegerOption(o=>o.setName('ganadores').setDescription('Ganadores').setMinValue(1).setMaxValue(20).setRequired(true))
      .addStringOption(o=>o.setName('premio').setDescription('Premio').setMaxLength(256).setRequired(true)))
    .addSubcommand(s=>s.setName('end').setDescription('Finaliza un sorteo.')
      .addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
    .addSubcommand(s=>s.setName('reroll').setDescription('Selecciona nuevos ganadores.')
      .addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
    .addSubcommand(s=>s.setName('cancel').setDescription('Cancela un sorteo.')
      .addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
    .addSubcommand(s=>s.setName('list').setDescription('Lista sorteos activos.'));
