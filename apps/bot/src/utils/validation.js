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
