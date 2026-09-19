# Codek Hub

Bot de Discord modular para comunidades. Sin dashboard, OAuth2, API externa ni funciones innecesarias.

## Módulos

- 🎫 Tickets
- 👋 Welcome
- ⭐ Vouch
- 🤖 Autoresponder
- 🎮 Rich Presence del bot

## Stack

Node.js, JavaScript ES Modules, discord.js, Prisma, PostgreSQL, dotenv y Zod.

## Comandos

- `/tickets` — configuración y publicación de tickets
- `/welcome` — configuración de bienvenida
- `/vouch` — crear una reseña
- `/vouch-config` — configuración de vouches
- `/autoresponder` — gestionar respuestas automáticas
- `/presence` — Rich Presence del bot
- `/variables` — variables disponibles

## Configuración

Copia `.env.example` a `.env` y configura:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DATABASE_URL`
- `DEV_GUILD_ID` (opcional, recomendado durante desarrollo)
- `LOG_LEVEL`

El bot necesita los intents privilegiados **Guild Members** y **Message Content** en Discord Developer Portal. No necesita el intent de presencia de usuarios.

## Base de datos

Usa Prisma con PostgreSQL. Durante desarrollo puedes sincronizar el esquema con:

`npm run db:push`

Antes de producción, revisa y versiona los cambios de esquema con una estrategia de migraciones adecuada. No ejecutes cambios destructivos sobre una base de datos existente sin respaldo.

## Producción

Instala dependencias con `npm install`, genera Prisma con `npm run db:generate` y ejecuta el bot con `npm run bot`.

El bot no necesita abrir ningún puerto HTTP.
