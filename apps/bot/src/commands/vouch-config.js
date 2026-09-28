import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder()
    .setName('vouch-config').setDescription('Configura vouches.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('set').setDescription('Activa.')
      .addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o=>o.setName('roles').setDescription('Nombres de roles separados por comas'))
      .addIntegerOption(o=>o.setName('cooldown').setDescription('Segundos').setMinValue(0))
      .addStringOption(o=>o.setName('titulo').setDescription('Título'))
      .addStringOption(o=>o.setName('descripcion').setDescription('Descripción'))
      .addStringOption(o=>o.setName('color').setDescription('Color HEX'))
      .addStringOption(o=>o.setName('imagen').setDescription('URL imagen'))
      .addStringOption(o=>o.setName('thumbnail').setDescription('URL thumbnail'))
      .addStringOption(o=>o.setName('footer').setDescription('Footer')))
    .addSubcommand(s=>s.setName('reset').setDescription('Desactiva.'));
