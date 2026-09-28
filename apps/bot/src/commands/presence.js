import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder()
    .setName('presence').setDescription('Rich Presence del bot.')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s=>s.setName('set').setDescription('Configura.')
      .addStringOption(o=>o.setName('tipo').setDescription('Tipo').setRequired(true)
        .addChoices({name:'Playing',value:'Playing'},{name:'Watching',value:'Watching'},{name:'Listening',value:'Listening'}))
      .addStringOption(o=>o.setName('texto').setDescription('Texto').setRequired(true)))
    .addSubcommand(s=>s.setName('reset').setDescription('Restablece.'));
