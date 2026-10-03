export function registerLifecycle({client,prisma,logger,sendConsoleLog}){
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
  process.on('unhandledRejection',reason=>{
    const details=String(reason?.stack||reason);
    logger.error('Unhandled promise rejection',{error:details});
    void (async()=>{try{await sendConsoleLog?.('error','Unhandled promise rejection',{error:details})}catch{}})();
  });
  process.on('uncaughtException',error=>{
    const details=error?.stack||error?.message||String(error);
    logger.error('Uncaught exception',{error:details});
    void (async()=>{
      try{await sendConsoleLog?.('error','Uncaught exception',{error:details})}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
      await shutdown('uncaughtException',1);
    })();
  });
  return shutdown;
}