# Codek Hub

Codek Hub is a modular Discord automation platform built with Node.js and JavaScript. The repository is structured as a monorepo that includes a Discord bot, an Express API, a Next.js dashboard, a Prisma/PostgreSQL data layer, and Socket.IO-based real-time features.

## Stack

- Node.js + ES Modules
- discord.js
- Express.js
- Next.js
- PostgreSQL + Prisma
- Socket.IO
- Discord OAuth2
- JavaScript (no TypeScript)

## Repository layout

```text
apps/
  api/        # REST API + WebSocket
  bot/        # Discord bot runtime
  dashboard/  # Next.js dashboard frontend
packages/
  shared/     # Variables, logger, env helpers
prisma/
  schema.prisma
scripts/
  check-env.js
```

## Production configuration

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
2. Replace all placeholder values with the real production credentials:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `DISCORD_REDIRECT_URI`
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `DASHBOARD_URL`
   - `API_URL`
   - `NEXT_PUBLIC_API_URL`
3. Validate the production environment:
   ```bash
   npm run check:env:prod
   ```
4. Generate Prisma client and apply migrations:
   ```bash
   npm run db:generate
   npm run db:push
   ```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Fill in your Discord and database values.
4. Generate Prisma client:
   ```bash
   npm run db:generate
   ```
5. Run database migrations (PostgreSQL required):
   ```bash
   npm run db:migrate
   ```
6. Start the full local stack:
   ```bash
   npm run dev
   ```

## Scripts

```bash
npm run bot
npm run api
npm run dashboard
npm run check:env
npm run check:env:prod
npm run build
npm test
```

## Local URLs

- Dashboard: http://localhost:3000
- API: http://localhost:3001
- WebSocket: ws://localhost:3001

## Notes

Codek Hub is a production-oriented Discord management platform. Real data comes from Discord OAuth, the Discord Gateway, and PostgreSQL/Prisma. The dashboard and API validate the session, guild, and permission state on every protected request, and the app is expected to use real credentials in production mode instead of demo values.
