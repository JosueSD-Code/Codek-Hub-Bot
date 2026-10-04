const cooldowns=new Map();
const MAX_COOLDOWNS=10000;

export function applyCooldown(userId,commandName,seconds=0){
  if(!seconds)return;
  const key=`${userId}:${commandName}`;
  const now=Date.now();
  const expires=cooldowns.get(key);
  if(expires&&now<expires){
    throw new Error(`Cooldown: ${Math.ceil((expires-now)/1000)}s restantes`);
  }

  const until=now+seconds*1000;
  if(cooldowns.size>=MAX_COOLDOWNS&&!cooldowns.has(key)){
    for(const [entry,expiry] of cooldowns){
      if(expiry<=now)cooldowns.delete(entry);
      if(cooldowns.size<MAX_COOLDOWNS)break;
    }
    if(cooldowns.size>=MAX_COOLDOWNS){
      const oldest=cooldowns.keys().next().value;
      if(oldest)cooldowns.delete(oldest);
    }
  }
  cooldowns.set(key,until);
  setTimeout(()=>{
    if(cooldowns.get(key)===until)cooldowns.delete(key);
  },seconds*1000);
}

export function clearCooldowns(){cooldowns.clear();}
