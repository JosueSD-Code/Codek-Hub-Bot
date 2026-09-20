import 'dotenv/config';
import { z } from 'zod';

const schema=z.object({
  NODE_ENV:z.string().trim().default('development'),
  DISCORD_TOKEN:z.string().trim().min(1,'DISCORD_TOKEN es obligatorio.'),
  DISCORD_CLIENT_ID:z.string().trim().min(1,'DISCORD_CLIENT_ID es obligatorio.'),
  DATABASE_URL:z.string().trim().min(1,'DATABASE_URL es obligatorio.'),
  DEV_GUILD_ID:z.string().trim().min(1).optional(),
  LOG_LEVEL:z.enum(['debug','info','warn','error']).default('info')
});

export function loadEnvironment(){
  const result=schema.safeParse(process.env);
  if(!result.success){
    const details=result.error.issues.map(issue=>issue.path.join('.')+': '+issue.message).join('; ');
    throw new Error('Configuración de entorno inválida: '+details);
  }
  return result.data;
}
