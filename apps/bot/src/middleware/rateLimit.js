const cooldowns=new Map();

export function applyCooldown(userId,commandName,seconds=0){
  if(!seconds)return;
  const key=`${userId}:${commandName}`;
  const expires=cooldowns.get(key);
  if(expires&&Date.now()<expires){
    throw new Error(`Cooldown: ${Math.ceil((expires-Date.now())/1000)}s restantes`);
  }
  const until=Date.now()+seconds*1000;
  cooldowns.set(key,until);
  setTimeout(()=>{if(cooldowns.get(key)===until)cooldowns.delete(key)},seconds*1000);
}

export function clearCooldowns(){cooldowns.clear();}
