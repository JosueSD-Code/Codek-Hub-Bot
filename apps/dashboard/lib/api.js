export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function buildApiUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${normalizedPath}`;
}
