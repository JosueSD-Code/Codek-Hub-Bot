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
  - Los paneles y categorías se administran por **nombre**, no por IDs visibles.
- `/welcome` — configuración de bienvenida
- `/vouch` — crear una reseña
- `/vouch-config` — configuración de vouches
- `/autoresponder` — gestionar respuestas automáticas
- `/presence` — Rich Presence del bot
- `/variables` — variables disponibles

## Mantenimiento

Los administradores pueden mencionar **@Codek Hub** dentro de un servidor para recibir un resumen interno del estado del bot.

La respuesta de mantenimiento incluye, entre otros datos:

- estado del bot y latencia
- estado de PostgreSQL
- paneles, categorías y tickets abiertos
- estado de Vouch
- autoresponders activos
- Rich Presence
- versión de Node.js, uptime y memoria

Los usuarios sin permisos de administrador que mencionen al bot no reciben ninguna respuesta.

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
