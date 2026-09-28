import { prisma } from '../../../../packages/shared/src/index.js';

const spamState=new Map();
const SPAM_WINDOW_MS=10000;
const CLEANUP_INTERVAL_MS=60000;

function actionOf(rule){
  return ['warn','delete','timeout','ban'].includes(rule.action)?rule.action:'delete';
}

function durationMs(rule){
  const seconds=Number(rule.durationSeconds);
  return Number.isFinite(seconds)&&seconds>0?Math.min(seconds,28*24*60*60):3600;
}

function matchesRule(message,rule){
  const text=String(message.content??'');
  const lower=text.toLowerCase();
  if(rule.type==='links')return /https?:\/\/|www\./i.test(text)&&!(rule.whitelist||[]).some(x=>lower.includes(String(x).toLowerCase()));
  if(rule.type==='invites')return /(?:discord(?:app)?\.com\/invite|discord\.gg)\//i.test(text);
  if(rule.type==='words')return (rule.whitelist||[]).some(word=>lower.includes(String(word).toLowerCase()));
  if(rule.type==='mentions')return message.mentions.users.size>=Number(rule.threshold||5);
  if(rule.type==='caps'){
    const letters=text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)||[];
    const caps=letters.filter(x=>x===x.toUpperCase()).length;
    return letters.length>=8&&(caps/letters.length)*100>=Number(rule.threshold||70);
  }
  return false;
}

function isExcepted(message,rule){
  const values=rule.exceptions||[];
  return values.includes(message.channelId)||values.some(id=>message.member?.roles?.cache?.has(id));
}

export async function processAutoMod(message){
  if(!message.guild||message.author?.bot)return null;
  const rules=await prisma.autoModRule.findMany({where:{guildId:message.guild.id,enabled:true}});
  const key=message.guild.id+':'+message.author.id;
  const now=Date.now();
  const recent=(spamState.get(key)||[]).filter(ts=>now-ts<SPAM_WINDOW_MS);
  recent.push(now);
  spamState.set(key,recent);

  const matched=rules.find(rule=>{
    if(isExcepted(message,rule))return false;
    return rule.type==='spam'?recent.length>=Number(rule.threshold||5):matchesRule(message,rule);
  });
  if(!matched)return null;

  const action=actionOf(matched);
  if(action==='delete')await message.delete().catch(()=>{});
  if(action==='timeout')await message.member?.timeout(durationMs(matched)*1000,'AutoMod').catch(()=>{});
  if(action==='ban')await message.member?.ban({reason:'AutoMod'}).catch(()=>{});
  if(action==='warn')await message.author.send('⚠️ Tu mensaje fue moderado automáticamente en **'+message.guild.name+'**. Regla: '+matched.type+'.').catch(()=>{});
  await message.author.send('⚠️ Tu mensaje fue moderado automáticamente en **'+message.guild.name+'**. Regla: '+matched.type+'. Acción: '+action+'.').catch(()=>{});
  await prisma.moderationAction.create({
    data:{guildId:message.guild.id,targetId:message.author.id,moderatorId:message.client.user.id,action:'automod_'+action,reason:'Regla: '+matched.type,duration:action==='timeout'?durationMs(matched):null,expiresAt:action==='timeout'?new Date(Date.now()+durationMs(matched)*1000):null}
  });
  return matched;
}

setInterval(()=>{
  const cutoff=Date.now()-SPAM_WINDOW_MS;
  for(const [key,timestamps] of spamState){
    const recent=timestamps.filter(ts=>ts>cutoff);
    if(recent.length)spamState.set(key,recent);else spamState.delete(key);
  }
},CLEANUP_INTERVAL_MS).unref?.();
