import { prisma } from '../../../packages/shared/src/index.js';

const spamState=new Map();

function actionOf(rule){
  return ['warn','delete','timeout','ban'].includes(rule.action)?rule.action:'delete';
}

function matchesRule(message,rule){
  const text=String(message.content??'');
  const lower=text.toLowerCase();
  if(rule.type==='links')return /https?:\\/\\/|www\\./i.test(text)&&!(rule.whitelist||[]).some(x=>lower.includes(String(x).toLowerCase()));
  if(rule.type==='invites')return /discord(?:app)?\\.com\\/invite\\/|discord\\.gg\\//i.test(text);
  if(rule.type==='words')return (rule.whitelist||[]).some(word=>lower.includes(String(word).toLowerCase()));
  if(rule.type==='mentions')return message.mentions.users.size>=Number(rule.threshold||5);
  if(rule.type==='caps'){
    const letters=text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)||[];
    const caps=letters.filter(x=>x===x.toUpperCase()).length;
    return letters.length>=8&&(caps/letters.length)*100>=Number(rule.threshold||70);
  }
  return false;
}

export async function processAutoMod(message){
  if(!message.guild||message.author?.bot)return null;
  const rules=await prisma.autoModRule.findMany({where:{guildId:message.guild.id,enabled:true}});
  const member=message.member;
  const exempt=rules.some(rule=>(rule.exceptions||[]).some(id=>member?.roles?.cache?.has(id)));
  if(exempt)return null;

  const now=Date.now();
  const key=message.guild.id+':'+message.author.id;
  const recent=(spamState.get(key)||[]).filter(ts=>now-ts<10000);
  recent.push(now);
  spamState.set(key,recent);
  const matched=rules.find(rule=>rule.type==='spam'
    ?recent.length>=Number(rule.threshold||5)
    :matchesRule(message,rule));
  if(!matched)return null;

  const action=actionOf(matched);
  if(action==='delete')await message.delete().catch(()=>{});
  if(action==='timeout')await member?.timeout(3600000,'AutoMod').catch(()=>{});
  if(action==='ban')await member?.ban({reason:'AutoMod'}).catch(()=>{});
  await prisma.moderationAction.create({
    data:{guildId:message.guild.id,targetId:message.author.id,moderatorId:message.client.user.id,action:'automod_'+action,reason:'Regla: '+matched.type}
  });
  return matched;
}
