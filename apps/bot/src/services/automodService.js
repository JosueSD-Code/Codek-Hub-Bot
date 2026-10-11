import { prisma } from '../../../../packages/shared/src/index.js';

const spamState=new Map();
const SPAM_WINDOW_MS=10000;
const CLEANUP_INTERVAL_MS=60000;

function actionOf(rule){
  return ['warn','delete','timeout','ban'].includes(rule.action)?rule.action:'delete';
}

export function durationMs(rule){
  const seconds=Number(rule?.durationSeconds);
  const normalizedSeconds=Number.isFinite(seconds)&&seconds>0
    ?Math.min(seconds,28*24*60*60)
    :3600;
  return normalizedSeconds*1000;
}

function extractUrls(text){
  const candidates=(String(text??'').match(/(?:https?:\/\/|www\.)[^\s<>]+/gi)||[]).flatMap(candidate=>candidate.split(/(?=https?:\/\/|www\.)/i));
  return candidates.map(candidate=>{
    const cleaned=candidate.replace(/[),.!?;]+$/g,'');
    try{
      const url=new URL(/^www\./i.test(cleaned)?'https://'+cleaned:cleaned);
      return {host:url.hostname.toLowerCase(),pathname:url.pathname.toLowerCase()};
    }catch{
      return null;
    }
  });
}

function normalizeDomain(value){
  const raw=String(value??'').trim().toLowerCase();
  if(!raw)return null;
  const candidate=raw.replace(/^https?:\/\//,'').replace(/^www\./,'').split(/[/?#]/,1)[0].replace(/:\d+$/,'').replace(/\.$/,'');
  if(!candidate||candidate.includes('@'))return null;
  try{return new URL('https://'+candidate).hostname.toLowerCase()}catch{return null}
}

function isAllowedDomain(host,whitelist){
  return (whitelist||[]).some(value=>{
    const domain=normalizeDomain(value);
    return Boolean(domain)&&(host===domain||host.endsWith('.'+domain));
  });
}

export function matchesRule(message,rule){
  const text=String(message.content??'');
  const lower=text.toLowerCase();
  if(rule.type==='links'){
    if(!/(?:https?:\/\/|www\.)/i.test(text))return false;
    const urls=extractUrls(text);
    if(!urls.length||urls.some(url=>!url))return true;
    return urls.some(url=>!isAllowedDomain(url.host,rule.whitelist));
  }
  if(rule.type==='invites'){
    const linkedInvites=extractUrls(text).some(url=>url&&(
      (url.host==='discord.gg'&&url.pathname.length>1)||
      (['discord.com','discordapp.com'].includes(url.host)&&/^\/invite\/[^/]+/i.test(url.pathname))
    ));
    const bareInvites=/(?:^|[\s(<])(?:discord\.gg\/[a-z0-9-]+|discord(?:app)?\.com\/invite\/[a-z0-9-]+)/i.test(text);
    return linkedInvites||bareInvites;
  }
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
  if(action==='delete')await message.delete();
  const durationMilliseconds=durationMs(matched);
  const hasCustomDuration=Number.isFinite(Number(matched.durationSeconds))&&Number(matched.durationSeconds)>0;
  if(action==='timeout'){
    if(!message.member)throw new Error('AutoMod timeout failed: guild member is unavailable.');
    await message.member.timeout(durationMilliseconds,'AutoMod');
  }
  if(action==='ban'){
    if(!message.member)throw new Error('AutoMod ban failed: guild member is unavailable.');
    await message.member.ban({reason:'AutoMod'});
  }
  await message.author.send('⚠️ Tu mensaje fue moderado automáticamente en **'+message.guild.name+'**. Regla: '+matched.type+'. Acción: '+action+'.').catch(()=>{});
  const temporaryBan=action==='ban'&&hasCustomDuration;
  await prisma.moderationAction.create({
    data:{
      guildId:message.guild.id,
      targetId:message.author.id,
      moderatorId:message.client.user.id,
      action:'automod_'+action,
      reason:'Regla: '+matched.type,
      duration:(action==='timeout'||temporaryBan)?Math.floor(durationMilliseconds/1000):null,
      expiresAt:(action==='timeout'||temporaryBan)?new Date(Date.now()+durationMilliseconds):null
    }
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
