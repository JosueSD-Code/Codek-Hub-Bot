export function registerLifecycle({client,prisma,logger}){
  let shuttingDown=false;
  async function shutdown(signal,exitCode=0){
    if(shuttingDown)return;
    shuttingDown=true;
    logger.info('Shutting down Codek Hub',{signal});
    try{client.destroy()}catch(e){logger.warn('Discord shutdown failed',{error:e.message})}
    try{await prisma.$disconnect()}catch(e){logger.warn('Database shutdown failed',{error:e.message})}
    process.exit(exitCode);
  }
  process.on('SIGINT',()=>{void shutdown('SIGINT',0)});
  process.on('SIGTERM',()=>{void shutdown('SIGTERM',0)});
  process.on('unhandledRejection',reason=>{logger.error('Unhandled promise rejection',{error:String(reason?.stack||reason)})});
  process.on('uncaughtException',error=>{logger.error('Uncaught exception',{error:error.stack||error.message});void shutdown('uncaughtException',1)});
  return shutdown;
}