const DEFAULT_MAX_TEXT_LENGTH=2000;

export const clip=(value,max=DEFAULT_MAX_TEXT_LENGTH)=>String(value??'').slice(0,Math.max(0,max));

export function requiredText(value,label='Este campo'){
  const text=String(value??'').trim();
  if(!text)throw new Error(label+' es obligatorio.');
  return text;
}

export function isHexColor(value){
  return /^[0-9a-fA-F]{6}$/.test(String(value??'').replace(/^#/,'').trim());
}

export function safeUrl(value){
  const raw=String(value??'').trim();
  if(!raw||raw.length>2048)return null;
  try{
    const url=new URL(raw);
    if(!['http:','https:'].includes(url.protocol))return null;
    if(url.username||url.password)return null;
    return url.toString();
  }catch{
    return null;
  }
}

export function isUnicodeEmoji(value){
  const text=String(value??'').trim();
  if(!text)return false;
  const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
  const graphemes=[...segmenter.segment(text)].map(item=>item.segment);
  if(graphemes.length!==1)return false;
  const emoji=graphemes[0];
  return /\p{Extended_Pictographic}/u.test(emoji) ||
    /\p{Regional_Indicator}{2}/u.test(emoji) ||
    /[0-9#*]\uFE0F?\u20E3/u.test(emoji);
}
