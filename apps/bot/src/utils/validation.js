export const clip=(value,max)=>String(value??'').slice(0,max);

export function requiredText(value,label='Este campo'){
  const text=String(value??'').trim();
  if(!text)throw new Error(label+' es obligatorio.');
  return text;
}

export function isHexColor(value){
  return /^[0-9a-fA-F]{6}$/.test(String(value??'').replace(/^#/,'').trim());
}

export function safeUrl(value){
  try{
    const url=new URL(String(value??''));
    return /^https?:$/.test(url.protocol)?url.toString():null;
  }catch{
    return null;
  }
}

export function isUnicodeEmoji(value){
  const text=String(value??'').trim();
  if(!text)return false;

  const graphemes=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)]
    .map(item=>item.segment);

  if(graphemes.length!==1)return false;

  const emoji=graphemes[0];
  return /\p{Extended_Pictographic}/u.test(emoji) ||
    /\p{Regional_Indicator}{2}/u.test(emoji) ||
    /[0-9#*]\uFE0F?\u20E3/u.test(emoji);
}
