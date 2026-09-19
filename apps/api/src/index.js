import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import http from 'http';
import { randomBytes } from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { loadEnvironment, logger, renderVariables } from '../../../packages/shared/src/index.js';
import {
  getGuildCounts,
  getGuildRows,
  getGuildModuleState,
  upsertWelcomeConfig,
  upsertVouchConfig,
  upsertLogConfig,
  upsertAutoModConfig,
  upsertAntiSpamConfig,
  upsertAntiRaidConfig,
  listGuildAuditLogs,
  addGuildAuditLog,
  listAutoRespondersForGuild,
  upsertAutoResponderForGuild,
  deleteAutoResponderById,
} from '../../../packages/shared/src/db.js';
import { exchangeCodeForToken, fetchDiscordUser, fetchUserGuilds, getDiscordAuthUrl, filterGuildsForBotAndAdmin } from './services/discordOauthService.js';
import { getOverviewPayload, getModulePayload, getVariablesPayload } from './services/dashboardService.js';
import { getDiscordProfile, getDiscordPresence, snapshotPresence } from './services/discordProfileService.js';
import { fetchGuildTickets, createGuildTicket, fetchGuildTicketPanels, createGuildTicketPanel, claimTicket } from './services/ticketService.js';

const env = loadEnvironment();
const app = express();
const server = http.createServer(app);
const allowedOrigins = new Set([
  env.dashboardUrl,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
].filter(Boolean));
const io = new SocketIOServer(server, { cors: { origin: Array.from(allowedOrigins), credentials: true } });

if (!env.sessionSecret) {
  throw new Error('SESSION_SECRET is required to start the API server.');
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (!req.session?.guilds) {
    return res.status(403).json({ error: 'Guild access could not be verified.' });
  }

  next();
}

function requireGuildPermission(req, res, next) {
  const guildId = req.params.guildId || req.query.guildId || req.body?.guildId;
  if (!guildId) {
    return res.status(400).json({ error: 'guildId is required.' });
  }

  const guilds = req.session?.guilds ?? [];
  const guild = guilds.find((entry) => entry.id === guildId);
  if (!guild) {
    return res.status(403).json({ error: 'You do not have access to this guild.' });
  }

  const adminPermission = Number(guild.permissions) & 0x20;
  const ownerPermission = guild.owner === true;
  if (!adminPermission && !ownerPermission) {
    return res.status(403).json({ error: 'You do not have permission to manage this guild.' });
  }

  req.guild = guild;
  next();
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'codek-hub-api',
    timestamp: new Date().toISOString(),
    status: 'operational',
    database: process.env.DATABASE_URL ? 'configured' : 'not-configured',
    discord: process.env.DISCORD_CLIENT_ID ? 'configured' : 'not-configured',
  });
});

app.get('/api/overview', requireAuth, async (req, res) => {
  const guildIds = (req.session?.guilds ?? []).map((guild) => guild.id);
  const payload = await getOverviewPayload();
  const guilds = Array.isArray(payload.guilds) ? payload.guilds.filter((guild) => guildIds.length === 0 || guildIds.includes(guild.id)) : [];
  const moduleSummary = Array.isArray(payload.moduleSummary)
    ? payload.moduleSummary.filter((entry) => guildIds.length === 0 || guildIds.includes(entry.guildId))
    : [];

  res.json({
    ...payload,
    guildCount: guilds.length,
    ticketCount: guilds.length ? await Promise.all(guilds.map(async (guild) => {
      const tickets = await fetchGuildTickets(guild.id);
      return tickets.length;
    })).then((counts) => counts.reduce((sum, count) => sum + count, 0)) : 0,
    guilds,
    moduleSummary,
    noDemoData: true,
  });
});

app.get('/api/guilds', requireAuth, async (req, res) => {
  const guilds = await filterGuildsForBotAndAdmin(req.session?.guilds ?? []);
  req.session.guilds = guilds;

  if (!guilds.length) {
    return res.json([]);
  }

  return res.json(guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
    owner: Boolean(guild.owner),
    permissions: Number(guild.permissions ?? 0),
  })));
});

app.get('/api/guilds/:guildId/ticket-panels', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const panels = await fetchGuildTicketPanels(guildId);
  res.json(panels);
});

app.post('/api/guilds/:guildId/ticket-panels', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const panel = await createGuildTicketPanel(guildId, {
    ...req.body,
    guildName: req.guild?.name,
    ownerId: req.session?.user?.id,
  });

  if (!panel) {
    return res.status(500).json({ error: 'Unable to create the ticket panel.' });
  }

  res.status(201).json(panel);
});

app.get('/api/guilds/:guildId/tickets', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const tickets = await fetchGuildTickets(guildId);
  res.json(tickets);
});

app.post('/api/guilds/:guildId/tickets', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const sessionUserId = req.session?.user?.id;

  if (!sessionUserId) {
    return res.status(401).json({ error: 'Discord session is missing.' });
  }

  const ticket = await createGuildTicket(guildId, {
    ...req.body,
    userId: sessionUserId,
    guildName: req.guild?.name,
    ownerId: sessionUserId,
  });

  if (!ticket) {
    return res.status(500).json({ error: 'Unable to create the ticket.' });
  }

  res.status(201).json(ticket);
});

app.post('/api/guilds/:guildId/tickets/:ticketId/claim', requireAuth, requireGuildPermission, async (req, res) => {
  const { ticketId } = req.params;
  const staffId = req.session?.user?.id;

  if (!staffId) {
    return res.status(401).json({ error: 'A valid authenticated staff session is required.' });
  }

  const claim = await claimTicket(ticketId, staffId);
  if (!claim) {
    return res.status(500).json({ error: 'Unable to claim this ticket.' });
  }

  res.status(200).json(claim);
});

app.get('/api/modules', async (req, res) => {
  const modules = await getModulePayload();
  res.json(modules);
});

app.get('/api/guilds/:guildId/modules', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const state = await getGuildModuleState(guildId);
  res.json(state ?? {
    id: guildId,
    name: req.guild?.name ?? null,
    config: {
      ticketsEnabled: false,
      welcomeEnabled: false,
      vouchEnabled: false,
      richPresenceEnabled: false,
    },
    welcomeConfig: null,
    vouchConfig: null,
    automodConfig: null,
    antispamConfig: null,
    antiraidConfig: null,
    logConfig: null,
  });
});

app.post('/api/guilds/:guildId/modules/welcome', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const payload = req.body || {};
  const config = await upsertWelcomeConfig(guildId, payload);

  if (!config) {
    return res.status(500).json({ error: 'Unable to save the welcome configuration.' });
  }

  await addGuildAuditLog(guildId, 'welcome', 'updated', null, JSON.stringify(payload), req.session?.user?.id ?? null);
  res.json(config);
});

app.post('/api/guilds/:guildId/modules/vouch', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const payload = req.body || {};
  const config = await upsertVouchConfig(guildId, payload);

  if (!config) {
    return res.status(500).json({ error: 'Unable to save the vouch configuration.' });
  }

  await addGuildAuditLog(guildId, 'vouch', 'updated', null, JSON.stringify(payload), req.session?.user?.id ?? null);
  res.json(config);
});

app.post('/api/guilds/:guildId/modules/logs', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const payload = req.body || {};
  const config = await upsertLogConfig(guildId, payload);

  if (!config) {
    return res.status(500).json({ error: 'Unable to save the log configuration.' });
  }

  await addGuildAuditLog(guildId, 'logs', 'updated', null, JSON.stringify(payload), req.session?.user?.id ?? null);
  res.json(config);
});

app.post('/api/guilds/:guildId/modules/automod', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const payload = req.body || {};
  const config = await upsertAutoModConfig(guildId, payload);

  if (!config) {
    return res.status(500).json({ error: 'Unable to save the AutoMod configuration.' });
  }

  await addGuildAuditLog(guildId, 'automod', 'updated', null, JSON.stringify(payload), req.session?.user?.id ?? null);
  res.json(config);
});

app.post('/api/guilds/:guildId/modules/antispam', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const payload = req.body || {};
  const config = await upsertAntiSpamConfig(guildId, payload);

  if (!config) {
    return res.status(500).json({ error: 'Unable to save the AntiSpam configuration.' });
  }

  await addGuildAuditLog(guildId, 'antispam', 'updated', null, JSON.stringify(payload), req.session?.user?.id ?? null);
  res.json(config);
});

app.post('/api/guilds/:guildId/modules/antiraid', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const payload = req.body || {};
  const config = await upsertAntiRaidConfig(guildId, payload);

  if (!config) {
    return res.status(500).json({ error: 'Unable to save the AntiRaid configuration.' });
  }

  await addGuildAuditLog(guildId, 'antiraid', 'updated', null, JSON.stringify(payload), req.session?.user?.id ?? null);
  res.json(config);
});

app.get('/api/guilds/:guildId/logs', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const logs = await listGuildAuditLogs(guildId);
  res.json(logs);
});

app.get('/api/guilds/:guildId/autoresponders', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const responders = await listAutoRespondersForGuild(guildId);
  res.json(responders);
});

app.post('/api/guilds/:guildId/autoresponders', requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const payload = req.body || {};
  const responder = await upsertAutoResponderForGuild(guildId, payload);

  if (!responder) {
    return res.status(500).json({ error: 'Unable to save the auto-responder.' });
  }

  await addGuildAuditLog(guildId, 'autoresponder', 'updated', null, JSON.stringify(payload), req.session?.user?.id ?? null);
  res.status(201).json(responder);
});

app.delete('/api/guilds/:guildId/autoresponders/:id', requireAuth, requireGuildPermission, async (req, res) => {
  const deleted = await deleteAutoResponderById(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Auto-responder not found.' });
  }

  await addGuildAuditLog(req.params.guildId, 'autoresponder', 'deleted', null, req.params.id, req.session?.user?.id ?? null);
  res.status(204).send();
});

app.get('/api/variables', (req, res) => {
  res.json(getVariablesPayload());
});

app.get('/api/oauth/discord/url', (req, res) => {
  const state = randomBytes(32).toString('hex');
  req.session.oauthState = state;
  const authUrl = getDiscordAuthUrl(state);
  if (!authUrl) {
    return res.status(500).json({ error: 'Discord OAuth2 is not configured.' });
  }

  res.json({ authUrl, state });
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Discord OAuth callback is missing a code.' });
  }

  const expectedState = req.session?.oauthState;
  if (expectedState && state && String(state) !== expectedState) {
    return res.status(400).json({ error: 'OAuth state mismatch.' });
  }

  const tokenData = await exchangeCodeForToken(String(code));
  if (!tokenData) {
    return res.status(400).json({ error: 'Discord OAuth exchange failed.' });
  }

  const user = await fetchDiscordUser(tokenData.access_token);
  const rawGuilds = await fetchUserGuilds(tokenData.access_token);
  const guilds = await filterGuildsForBotAndAdmin(rawGuilds);

  req.session.user = {
    id: user?.id ?? null,
    username: user?.username ?? null,
    globalName: user?.global_name ?? null,
    avatar: user?.avatar ?? null,
    avatarUrl: user?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
  };
  req.session.guilds = guilds;
  req.session.accessToken = tokenData.access_token;
  delete req.session.oauthState;

  return res.redirect(env.dashboardUrl || 'http://localhost:3000');
});

app.get('/api/me', requireAuth, async (req, res) => {
  const guilds = await filterGuildsForBotAndAdmin(req.session?.guilds ?? []);
  req.session.guilds = guilds;

  res.json({
    user: req.session.user,
    guilds,
    authenticated: true,
  });
});

app.get('/api/guilds/:guildId/permissions', requireAuth, requireGuildPermission, (req, res) => {
  const permissions = Number(req.guild?.permissions ?? 0);

  res.json({
    guildId: req.params.guildId,
    permissions: {
      canManageGuild: Boolean((permissions & 0x20) || req.guild?.owner === true),
      canViewAudit: Boolean((permissions & 0x20) || (permissions & 0x08) || req.guild?.owner === true),
      canModifyModules: Boolean((permissions & 0x20) || req.guild?.owner === true),
    },
  });
});

app.get('/api/config/guilds', requireAuth, async (req, res) => {
  const guilds = req.session?.guilds ?? [];
  if (!guilds.length) {
    return res.json([]);
  }

  res.json(guilds.map((guild) => ({
    id: guild.id,
    name: guild.name,
    ownerId: req.session?.user?.id ?? guild.owner ?? null,
    icon: guild.icon,
    modules: [],
    permissions: Number(guild.permissions ?? 0),
  })));
});

app.get('/api/guilds/:guildId/profile/:userId', requireAuth, requireGuildPermission, async (req, res) => {
  const { userId } = req.params;
  const profile = await getDiscordProfile(userId);
  res.json({
    ...profile,
    guildId: req.params.guildId,
    guildName: req.guild?.name ?? null,
  });
});

app.get('/api/guilds/:guildId/presence/:userId', requireAuth, requireGuildPermission, async (req, res) => {
  const { userId } = req.params;
  const presence = await getDiscordPresence(userId);
  res.json({
    ...presence,
    guildId: req.params.guildId,
    guildName: req.guild?.name ?? null,
  });
});

app.get('/api/discord/profile/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (!req.session?.user || (req.session.user.id !== userId && !req.session.guilds?.some((guild) => guild.owner || Number(guild.permissions ?? 0) & 0x20))) {
    return res.status(403).json({ error: 'You are not authorized to view this profile.' });
  }

  const profile = await getDiscordProfile(userId);
  res.json(profile);
});

app.get('/api/discord/presence/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (!req.session?.user || (req.session.user.id !== userId && !req.session.guilds?.some((guild) => guild.owner || Number(guild.permissions ?? 0) & 0x20))) {
    return res.status(403).json({ error: 'You are not authorized to view this presence.' });
  }

  const presence = await getDiscordPresence(userId);
  res.json(presence);
});

app.get('/api/discord/activity/:userId', requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (!req.session?.user || (req.session.user.id !== userId && !req.session.guilds?.some((guild) => guild.owner || Number(guild.permissions ?? 0) & 0x20))) {
    return res.status(403).json({ error: 'You are not authorized to view this activity.' });
  }

  const presence = await getDiscordPresence(userId);
  res.json({ userId, activities: presence.activities || [] });
});

app.get('/api/discord/guild/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const guilds = await getGuildRows();
  const guildEntry = guilds.find((entry) => entry.id === guildId);

  res.json({
    id: guildId,
    name: guildEntry?.name ?? null,
    icon: guildEntry?.icon ?? null,
    owner: guildEntry?.ownerId ?? null,
    note: guildEntry ? 'Data available from the database.' : 'No guild metadata available in the database or Discord API.',
  });
});

app.post('/api/stream/presence', (req, res) => {
  const payload = snapshotPresence(req.body || {});
  const guildId = payload.guildId || req.body?.guildId;

  if (guildId) {
    io.to(`guild:${guildId}`).emit('presence:update', payload);
  } else {
    io.emit('presence:update', payload);
  }

  res.json({ ok: true, data: payload });
});

app.get('/api/stream/status', (req, res) => {
  res.json({
    ok: true,
    connectedClients: io.engine.clientsCount,
    namespace: '/',
    lastPresenceUpdate: snapshotPresence({}).updatedAt ?? null,
  });
});

app.post('/api/variables/render', (req, res) => {
  const { template = '', context = {} } = req.body || {};
  res.json({ rendered: renderVariables(template, context) });
});

app.get('/api/logs', requireAuth, async (req, res) => {
  const guildId = req.query.guildId || req.query.guild_id;
  const { guildCount, ticketCount } = await getGuildCounts();

  if (!guildId) {
    return res.json({ guildCount, ticketCount, entries: [] });
  }

  const guilds = req.session?.guilds ?? [];
  const guild = guilds.find((entry) => entry.id === guildId);
  if (!guild) {
    return res.status(403).json({ error: 'You do not have access to this guild.' });
  }

  const entries = await listGuildAuditLogs(guildId);
  res.json({ guildCount, ticketCount, entries });
});

io.on('connection', (socket) => {
  logger.info('Socket client connected', { id: socket.id });
  socket.emit('hello', { ok: true, connectedClients: io.engine.clientsCount });

  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });

  socket.on('subscribe:presence', ({ guildId } = {}) => {
    if (!guildId) {
      return;
    }

    socket.join(`guild:${guildId}`);
    socket.emit('presence:subscribed', { guildId, ok: true });
  });
});

server.listen(env.apiPort, env.apiHost, () => {
  logger.info('API server started', { host: env.apiHost, port: env.apiPort });
});
