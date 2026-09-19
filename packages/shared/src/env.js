import 'dotenv/config';

export function loadEnvironment() {
  const apiHost = process.env.API_HOST || 'localhost';
  const apiPort = Number(process.env.API_PORT || 3001);
  const dashboardHost = process.env.DASHBOARD_HOST || 'localhost';
  const dashboardPort = Number(process.env.DASHBOARD_PORT || 3000);
  const botApiPort = Number(process.env.BOT_API_PORT || 3011);
  const sessionSecret = process.env.SESSION_SECRET || '';

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    apiHost,
    apiPort,
    apiUrl: process.env.API_URL || `http://${apiHost}:${apiPort}`,
    dashboardHost,
    dashboardPort,
    dashboardUrl: process.env.DASHBOARD_URL || `http://${dashboardHost}:${dashboardPort}`,
    botApiPort,
    botApiUrl: process.env.BOT_API_URL || `http://localhost:${botApiPort}`,
    discordToken: process.env.DISCORD_TOKEN || '',
    discordClientId: process.env.DISCORD_CLIENT_ID || '',
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    discordRedirectUri: process.env.DISCORD_REDIRECT_URI || `${process.env.API_URL || `http://${apiHost}:${apiPort}`}/api/auth/discord/callback`,
    databaseUrl: process.env.DATABASE_URL || '',
    sessionSecret,
    logLevel: process.env.LOG_LEVEL || 'info',
    redisUrl: process.env.REDIS_URL || '',
  };
}

export function isProduction() {
  return (process.env.NODE_ENV || 'development') === 'production';
}
