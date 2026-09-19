# Codek Hub

Bot de Discord modular. No dashboard ni OAuth2.

## Módulos
- Tickets
- Welcome
- Vouch
- Autoresponder
- Rich Presence del bot
- API de perfil/presencia

## Stack
Node.js, JavaScript ES Modules, discord.js, Express, Prisma y PostgreSQL.

## Comandos
`/tickets`, `/welcome`, `/vouch`, `/vouch-config`, `/autoresponder`, `/presence`, `/variables`.

## Producción
Configura `.env` con `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL` y `PORT`. Habilita Guild Members, Message Content y Guild Presences en Discord Developer Portal.

## API
`GET /health`, `GET /api/discord/user/:userId`, `GET /api/discord/presence/:userId`.

La API usa datos recibidos oficialmente por Discord Gateway; no usa self-bots ni scraping.