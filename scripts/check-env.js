import 'dotenv/config';

const requiredKeys = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_REDIRECT_URI',
  'DATABASE_URL',
  'SESSION_SECRET',
];

const strict = process.argv.includes('--strict');
const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const missing = requiredKeys.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (!strict && !isProduction) {
  console.log('Environment status: development mode. Optional runtime checks skipped.');
  process.exit(0);
}

if (missing.length > 0) {
  console.error('Missing required production environment variables:');
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log('Environment status: production configuration is valid.');
