# Codek Hub

Bot de Discord modular para comunidades, desarrollado con JavaScript ES Modules. Mantiene los sistemas dentro del propio bot; no requiere dashboard web ni servidor HTTP.

## Sistemas incluidos

- **Tickets:** paneles, categorías, preguntas, publicación, reclamación/liberación, gestión, cierre, reapertura y transcripciones.
- **Moderación:** advertencias, timeouts, expulsiones, baneos, historial y limpieza de mensajes.
- **AutoMod:** anti-spam, enlaces, invitaciones, palabras, menciones, mayúsculas, excepciones y acciones configurables.
- **Giveaways:** crear, participar, listar, finalizar, cancelar y volver a sortear ganadores.
- **Welcome / Goodbye:** mensajes y embeds personalizables con variables.
- **Logs:** mensajes, miembros, canales, roles, moderación y tickets, según los eventos seleccionados.
- **Vouches:** reseñas, calificaciones, estadísticas y cooldowns.
- **Autoresponder:** respuestas por coincidencia exacta o parcial.
- **Rich Presence:** presencia configurable del bot.
- **Backups:** exportación y restauración transaccional de configuración.
- **Health / Config / Stats:** estado operativo y resúmenes.

## Stack

Node.js 22, discord.js 14, Prisma ORM 5, PostgreSQL, dotenv y Zod. La versión mayor de Prisma se mantiene deliberadamente mientras se valida una migración mayor compatible con el esquema y las migraciones actuales; no se deben actualizar los paquetes de Prisma de forma independiente.

## Requisitos de Discord

El bot requiere los intents privilegiados **Guild Members** y **Message Content** activados en Discord Developer Portal. No necesita el intent de presencia de usuarios.

## Configuración inicial

1. Instala una versión compatible de Node.js (Node 22 es la línea validada en CI).
2. Copia `.env.example` a `.env`.
3. Completa `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL` y, opcionalmente, `DEV_GUILD_ID` y `LOG_LEVEL`.
4. Desde la raíz del repositorio, ejecuta:

```powershell
npm install
npx prisma validate
npx prisma generate
npx prisma migrate status
```

Si la base de datos aún no tiene el historial de migraciones de este repositorio, no asumas que basta con ejecutar `migrate deploy`: primero verifica si el esquema existente coincide con el baseline `prisma/migrations/0_init` y reconcilia el historial sin borrar datos.

## Base de datos y migraciones

Las migraciones SQL versionadas están en `prisma/migrations`. Para una base de datos cuya historia ya está alineada:

```powershell
npm run db:status
npm run db:deploy
npm run db:status
npm run db:generate
```

- `npm run db:deploy` aplica únicamente las migraciones pendientes.
- `npm run db:status` muestra si el esquema está sincronizado.
- `npm run db:validate` valida el esquema Prisma.
- `npm run db:generate` genera Prisma Client.
- `npm run db:push` se conserva por compatibilidad, pero se reserva para bases desechables de desarrollo. No lo uses como sustituto de las migraciones en bases con datos importantes.

No ejecutes `prisma migrate reset`, ni borres `_prisma_migrations`, ni edites la base manualmente para “arreglar” el estado sin revisar primero el esquema y el historial.

## Desarrollo, pruebas y arranque

```powershell
npm test
npm run bot
```

El workflow de GitHub Actions valida Prisma, comprueba la sintaxis JavaScript y ejecuta las pruebas. Si se configura una base de datos remota para la comprobación de integridad, también verifica el historial de migraciones y campos críticos. Las comprobaciones que no pueden ejecutarse contra `localhost` en GitHub Actions se omiten explícitamente.

## Seguridad operativa

- Nunca subas `.env`, tokens, contraseñas o backups con datos sensibles.
- El bot debe tener solo los permisos de Discord que necesite en el servidor.
- Los logs de un servidor deben quedarse en su propia configuración; no se envían logs globales de consola a los canales de todas las comunidades.
- Los backups de configuración no sustituyen a una copia de seguridad de PostgreSQL.
