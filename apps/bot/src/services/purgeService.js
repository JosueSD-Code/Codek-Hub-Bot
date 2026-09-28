export async function purgeChannelMessages(channel,limit=100){
  if(!channel?.isTextBased?.()||!channel?.messages?.fetch)return 0;
  const max=Math.max(1,Math.min(Number(limit)||1,10000));let remaining=max;let deleted=0;let before;
  while(remaining>0){
    const batch=await channel.messages.fetch({limit:Math.min(100,remaining),...(before?{before}:{})});
    if(!batch.size)break;
    const recent=[];const old=[];const now=Date.now();
    for(const message of batch.values())(now-message.createdTimestamp<14*24*60*60*1000?recent:old).push(message);
    if(recent.length){const removed=await channel.bulkDelete(recent,true);deleted+=removed.size;remaining-=removed.size}
    for(const message of old){if(remaining<=0)break;try{await message.delete();deleted++;remaining--}catch{}}
    before=batch.last()?.id;if(!before)break;
  }
  return deleted;
}

export async function purgeEverything(channel){
  let total=0;
  while(true){const deleted=await purgeChannelMessages(channel,100);total+=deleted;if(deleted===0||deleted<100)break}
  return total;
}
