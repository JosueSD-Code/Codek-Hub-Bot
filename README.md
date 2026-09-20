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

Usa Prisma con PostgreSQL.

### Desarrollo

Para sincronizar el esquema con la base de datos local:

`npm run db:push`

Para validar el esquema:

`npm run db:validate`

Para generar Prisma Client:

`npm run db:generate`

Actualmente el proyecto está orientado a desarrollo con `db push`; no se mantiene una historia de migraciones versionada en el repositorio todavía. Antes de llevar la base de datos a staging/producción conviene baselinar el esquema estable y empezar a versionar migraciones. No ejecutes `db:push` sobre una base de datos de producción sin revisar previamente el impacto del cambio.

## Producción

Instala dependencias con `npm install`, genera Prisma con `npm run db:generate` y ejecuta el bot con `npm run bot`.

El bot no necesita abrir ningún puerto HTTP.
