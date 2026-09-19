import http from 'http';
import {
  Client,
  Events,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { loadEnvironment, logger, renderVariables } from '../../../packages/shared/src/index.js';
import { findMatchingAutoResponder, listAutoRespondersForGuild, prisma } from '../../../packages/shared/src/db.js';

const env = loadEnvironment();

if (!env.discordToken) {
  logger.warn('DISCORD_TOKEN is not set. The bot will not start until you provide a token in your environment.');
  process.exit(0);
}

const spamTracker = new Map();
const raidTracker = new Map();
const vouchCooldowns = new Map();

const VOUCH_COMMAND = new SlashCommandBuilder()
  .setName('vouch')
  .setDescription('Leave a real vouch for a member in this server.')
  .addUserOption((option) => option.setName('member').setDescription('Member to review').setRequired(true))
  .addIntegerOption((option) => option.setName('rating').setDescription('Rating from 1 to 5').setRequired(true).setMinValue(1).setMaxValue(5))
  .addStringOption((option) => option.setName('review').setDescription('Optional review summary').setRequired(false));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
  ],
});

const botApiServer = http.createServer((req, res) => {
  if (req.url === '/api/bot/guilds') {
    const guilds = client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.ownerId,
      memberCount: guild.memberCount,
      permissions: guild.members.me ? Number(guild.members.me.permissions ?? 0) : null,
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(guilds));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'codek-hub-bot' }));
});

botApiServer.listen(env.botApiPort || 3011, '0.0.0.0', () => {
  logger.info('Bot API gateway started', { port: env.botApiPort || 3011 });
});

async function fetchGuildModuleSettings(guildId) {
  if (!guildId) {
    return null;
  }

  try {
    return await prisma.guild.findUnique({
      where: { id: String(guildId) },
      include: {
        config: true,
        welcomeConfig: true,
        vouchConfig: true,
        automodConfig: true,
        antispamConfig: true,
        antiraidConfig: true,
        logConfig: true,
      },
    });
  } catch (error) {
    return null;
  }
}

async function sendAuditMessage(guildId, content) {
  if (!guildId || !content) {
    return;
  }

  try {
    const settings = await fetchGuildModuleSettings(guildId);
    const channelId = settings?.logConfig?.channelId;
    if (!channelId) {
      return;
    }

    const guild = client.guilds.cache.get(String(guildId));
    if (!guild) {
      return;
    }

    const channel = guild.channels.cache.get(String(channelId)) || (await guild.channels.fetch(String(channelId)).catch(() => null));
    if (channel && channel.isTextBased()) {
      await channel.send(content);
    }
  } catch (error) {
    logger.warn('Unable to send guild audit log message', { error: error.message, guildId });
  }
}

async function registerSlashCommands() {
  if (!env.discordClientId || !env.discordToken) {
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(env.discordToken);
    await rest.put(Routes.applicationCommands(env.discordClientId), {
      body: [VOUCH_COMMAND.toJSON()],
    });
    logger.info('Slash commands deployed', { command: 'vouch' });
  } catch (error) {
    logger.error('Unable to register slash commands', { error: error.message });
  }
}

async function submitVouch(interaction, { targetId, rating, review }) {
  if (!interaction.guild || !interaction.member || !targetId) {
    return;
  }

  const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!targetMember) {
    await interaction.reply({ content: 'That member is not available in this server.', ephemeral: true });
    return;
  }

  const guildSettings = await fetchGuildModuleSettings(interaction.guildId);
  const vouchConfig = guildSettings?.vouchConfig;
  if (!vouchConfig?.enabled) {
    await interaction.reply({ content: 'Vouch is not enabled for this guild.', ephemeral: true });
    return;
  }

  const allowedRoleIds = Array.isArray(vouchConfig.allowedRoleIds) ? vouchConfig.allowedRoleIds.map(String) : [];
  if (allowedRoleIds.length > 0) {
    const hasPermission = interaction.member.roles.cache.some((role) => allowedRoleIds.includes(role.id));
    if (!hasPermission) {
      await interaction.reply({ content: 'You do not have permission to leave a vouch in this guild.', ephemeral: true });
      return;
    }
  }

  const cooldownSeconds = Number(vouchConfig.cooldown ?? 60);
  const key = `${interaction.guildId}:${interaction.user.id}`;
  const lastTimestamp = vouchCooldowns.get(key) || 0;
  const now = Date.now();
  if (now - lastTimestamp < cooldownSeconds * 1000) {
    await interaction.reply({ content: `Vouch cooldown is active. Please wait ${Math.ceil((cooldownSeconds * 1000 - (now - lastTimestamp)) / 1000)} seconds.`, ephemeral: true });
    return;
  }

  const finalRating = Math.max(1, Math.min(5, Number(rating) || 5));
  const finalReview = String(review || 'No review provided').trim() || 'No review provided';

  await prisma.vouch.create({
    data: {
      guildId: interaction.guildId,
      userId: targetMember.id,
      reviewerId: interaction.user.id,
      review: finalReview,
      rating: finalRating,
      note: `review:${finalRating}`,
    },
  });

  vouchCooldowns.set(key, now);

  const channelId = vouchConfig.channelId ? String(vouchConfig.channelId) : interaction.channelId;
  const channel = interaction.guild.channels.cache.get(channelId) || (await interaction.guild.channels.fetch(channelId).catch(() => null));
  const embed = new EmbedBuilder()
    .setTitle(`Vouch • ${finalRating}/5`)
    .setDescription(`**${targetMember.user.tag}** received a review from **${interaction.user.tag}**.`)
    .setColor(finalRating >= 4 ? 0x22c55e : finalRating === 3 ? 0xfbbf24 : 0xef4444)
    .setThumbnail(targetMember.user.displayAvatarURL({ extension: 'png', size: 128 }))
    .addFields(
      { name: 'Review', value: finalReview, inline: false },
      { name: 'Rating', value: `${'⭐'.repeat(finalRating)} (${finalRating}/5)`, inline: true },
      { name: 'Reviewer', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setTimestamp();

  if (channel && channel.isTextBased()) {
    await channel.send({ embeds: [embed] });
  }

  await interaction.reply({ content: `Vouch recorded for ${targetMember.user.tag} with a ${finalRating}/5 rating.`, ephemeral: true });
}

client.once(Events.ClientReady, () => {
  logger.info('Discord bot connected', { username: client.user.username, id: client.user.id });
  registerSlashCommands();
});

client.on(Events.GuildMemberAdd, async (member) => {
  const settings = await fetchGuildModuleSettings(member.guild.id);
  const welcomeConfig = settings?.welcomeConfig;

  if (welcomeConfig?.enabled && welcomeConfig.channelId) {
    const channel = member.guild.channels.cache.get(String(welcomeConfig.channelId)) || (await member.guild.channels.fetch(String(welcomeConfig.channelId)).catch(() => null));
    if (channel && channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(welcomeConfig.title || 'Welcome')
        .setDescription(renderVariables(welcomeConfig.description || 'Welcome {user}! We are glad to have you here.', {
          user: member.user.username,
          username: member.user.username,
          guild: member.guild.name,
          guild_name: member.guild.name,
          user_id: member.user.id,
          guild_id: member.guild.id,
        }))
        .setColor(Number.parseInt(welcomeConfig.color || '0x3b82f6', 16))
        .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 128 }))
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }
  }

  const antiRaidConfig = settings?.antiRaidConfig;
  if (antiRaidConfig?.enabled) {
    const key = `${member.guild.id}`;
    const now = Date.now();
    const entries = raidTracker.get(key) || [];
    const recent = entries.filter((timestamp) => now - timestamp < (Number(antiRaidConfig.interval || 60) * 1000));
    recent.push(now);
    raidTracker.set(key, recent);

    if (recent.length >= Number(antiRaidConfig.threshold || 8)) {
      const auditMessage = `AntiRaid triggered in ${member.guild.name}: ${recent.length} joins within ${antiRaidConfig.interval || 60}s.`;
      await sendAuditMessage(member.guild.id, auditMessage);
    }
  }
});

async function handleAutoResponder(message) {
  if (!message.guildId || message.author.bot) {
    return;
  }

  const responders = await listAutoRespondersForGuild(message.guildId);
  const responder = findMatchingAutoResponder(message.content, responders);

  if (!responder) {
    return;
  }

  const rendered = renderVariables(String(responder.response), {
    user: message.author.username,
    username: message.author.username,
    guild: message.guild?.name || 'server',
    guild_name: message.guild?.name || 'server',
    user_id: message.author.id,
    guild_id: message.guildId,
    channel: message.channel?.name || 'channel',
  });

  await message.reply(rendered);
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) {
    return;
  }

  const content = message.content.trim();
  if (!content) {
    return;
  }

  const lower = content.toLowerCase();
  if (lower.includes('help')) {
    await message.reply('Codek Hub is online. Available modules include tickets, welcome, vouch, logs, moderation, and profile presence services.');
  }

  if (lower.includes('status')) {
    await message.reply('Codek Hub is operational.');
  }

  if (message.guildId) {
    const settings = await fetchGuildModuleSettings(message.guildId);

    const automodConfig = settings?.automodConfig;
    if (automodConfig?.enabled && Array.isArray(automodConfig.bannedWords) && automodConfig.bannedWords.length > 0) {
      const bannedWords = automodConfig.bannedWords.map((word) => String(word).trim().toLowerCase());
      const foundWord = bannedWords.find((word) => message.content.toLowerCase().includes(word));
      if (foundWord) {
        await message.delete().catch(() => null);
        await sendAuditMessage(message.guildId, `AutoMod blocked a message from ${message.author.tag} containing: ${foundWord}`);
        return;
      }
    }

    const antispamConfig = settings?.antispamConfig;
    if (antispamConfig?.enabled) {
      const key = `${message.guildId}:${message.author.id}`;
      const now = Date.now();
      const windows = spamTracker.get(key) || [];
      const recent = windows.filter((timestamp) => now - timestamp < (Number(antispamConfig.timeframe || 10) * 1000));
      recent.push(now);
      spamTracker.set(key, recent);

      if (recent.length > Number(antispamConfig.maxMessages || 5)) {
        await message.delete().catch(() => null);
        await sendAuditMessage(message.guildId, `AntiSpam triggered for ${message.author.tag} in ${message.guild?.name || 'this server'}`);
        return;
      }
    }

  }

  await handleAutoResponder(message);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isModalSubmit() && interaction.customId.startsWith('vouch-review:')) {
    const [, targetId, ratingText] = interaction.customId.split(':');
    const review = interaction.fields.getTextInputValue('vouch_review_input');
    await submitVouch(interaction, {
      targetId,
      rating: Number(ratingText) || 5,
      review,
    });
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName !== 'vouch') {
    return;
  }

  const target = interaction.options.getMember('member');
  const rating = interaction.options.getInteger('rating') ?? 5;
  const review = interaction.options.getString('review');

  if (!target) {
    await interaction.reply({ content: 'Please select a valid member to review.', ephemeral: true });
    return;
  }

  if (target.id === interaction.user.id) {
    await interaction.reply({ content: 'You cannot vouch for yourself.', ephemeral: true });
    return;
  }

  if (review) {
    await submitVouch(interaction, { targetId: target.id, rating, review });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`vouch-review:${target.id}:${rating}`)
    .setTitle('Danos tu reseña');

  const reviewInput = new TextInputBuilder()
    .setCustomId('vouch_review_input')
    .setLabel('Danos tu reseña')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Escribe una reseña útil y respetuosa...');

  const actionRow = new ActionRowBuilder().addComponents(reviewInput);
  modal.addComponents(actionRow);
  await interaction.showModal(modal);
});

client.on(Events.PresenceUpdate, async (_oldPresence, newPresence) => {
  const payload = {
    userId: newPresence?.userId || null,
    guildId: newPresence?.guild?.id || null,
    status: newPresence?.status || null,
    activities: (newPresence?.activities || []).map((activity) => ({
      name: activity.name,
      type: activity.type,
      details: activity.details || null,
      state: activity.state || null,
    })),
    updatedAt: new Date().toISOString(),
  };

  if (!payload.userId) {
    return;
  }

  try {
    await fetch(`http://${env.apiHost}:${env.apiPort}/api/stream/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    logger.warn('Unable to push presence update to API', { error: error.message });
  }
});

process.on('SIGINT', async () => {
  logger.info('Shutting down Discord bot');
  await client.destroy();
  process.exit(0);
});

client.login(env.discordToken).catch((error) => {
  logger.error('Failed to connect to Discord', { error: error.message });
  process.exit(1);
});
