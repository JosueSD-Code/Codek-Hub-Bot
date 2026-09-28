import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder()
    .setName('autoresponder').setDescription('Gestiona respuestas.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('add').setDescription('Añade.')
      .addStringOption(o=>o.setName('trigger').setDescription('Trigger').setRequired(true))
      .addStringOption(o=>o.setName('respuesta').setDescription('Respuesta').setRequired(true))
      .addStringOption(o=>o.setName('modo').setDescription('Modo')
        .addChoices({name:'Contiene',value:'contains'},{name:'Exacta',value:'exact'}))
      .addStringOption(o=>o.setName('titulo').setDescription('Título embed'))
      .addStringOption(o=>o.setName('descripcion').setDescription('Descripción embed'))
      .addStringOption(o=>o.setName('color').setDescription('Color HEX')))
    .addSubcommand(s=>s.setName('remove').setDescription('Elimina.')
      .addStringOption(o=>o.setName('trigger').setDescription('Trigger').setRequired(true)))
    .addSubcommand(s=>s.setName('list').setDescription('Lista.'));
