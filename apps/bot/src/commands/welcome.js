import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder()
    .setName('welcome').setDescription('Configura bienvenida.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('set').setDescription('Configura.')
      .addChannelOption(o=>o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o=>o.setName('mensaje').setDescription('Mensaje').setRequired(true))
      .addStringOption(o=>o.setName('titulo').setDescription('Título'))
      .addStringOption(o=>o.setName('descripcion').setDescription('Descripción'))
      .addStringOption(o=>o.setName('color').setDescription('Color HEX'))
      .addStringOption(o=>o.setName('imagen').setDescription('URL imagen'))
      .addStringOption(o=>o.setName('thumbnail').setDescription('URL thumbnail'))
      .addStringOption(o=>o.setName('footer').setDescription('Footer'))
      .addChannelOption(o=>o.setName('canal-despedida').setDescription('Canal de despedidas').addChannelTypes(ChannelType.GuildText))
      .addStringOption(o=>o.setName('despedida').setDescription('Mensaje de despedida')))
    .addSubcommand(s=>s.setName('reset').setDescription('Elimina la configuración de bienvenida.'))
    .addSubcommand(s=>s.setName('test').setDescription('Prueba la bienvenida.'))
    .addSubcommand(s=>s.setName('preview').setDescription('Previsualiza la bienvenida.'));
