const levelOrder = ['debug', 'info', 'warn', 'error'];
const current = process.env.LOG_LEVEL || 'info';

function levelValue(level) {
  return levelOrder.indexOf(level.toLowerCase());
}

export function log(level, message, meta = {}) {
  if (levelValue(level) < levelValue(current)) {
    return;
  }
  const timestamp = new Date().toISOString();
  const body = { timestamp, level: level.toUpperCase(), message, ...meta };
  console.log(JSON.stringify(body));
}

export const logger = {
  debug: (message, meta) => log('debug', message, meta),
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};
