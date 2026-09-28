import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ADMIN } from '../utils/permissions.js';

export const command=new SlashCommandBuilder()
    .setName('vouch').setDescription('Deja una reseña.')
    .addUserOption(o=>o.setName('member').setDescription('Miembro').setRequired(true))
    .addStringOption(o=>o.setName('tipo').setDescription('Tipo').setRequired(true)
      .addChoices({name:'Legit',value:'Legit'},{name:'No Legit',value:'No Legit'}))
    .addIntegerOption(o=>o.setName('rating').setDescription('1-5').setRequired(true).setMinValue(1).setMaxValue(5));
