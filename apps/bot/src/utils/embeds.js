import { EmbedBuilder } from 'discord.js';
import { clip,safeUrl } from './validation.js';

export function color(value){
  const hex=String(value??'5865F2').replace(/^#/,'').trim();
  return /^[0-9a-fA-F]{6}$/.test(hex)?parseInt(hex,16):0x5865F2;
}

export function baseEmbed({title,description,color:embedColor='5865F2',image,thumbnail,footer,timestamp=true}={}){
  const embed=new EmbedBuilder()
    .setColor(color(embedColor));

  if(title)embed.setTitle(clip(title,256));
  if(description)embed.setDescription(clip(description,4096));

  const imageUrl=safeUrl(image);
  const thumbnailUrl=safeUrl(thumbnail);
  if(imageUrl)embed.setImage(imageUrl);
  if(thumbnailUrl)embed.setThumbnail(thumbnailUrl);
  if(footer)embed.setFooter({text:clip(footer,2048)});
  if(timestamp)embed.setTimestamp();

  return embed;
}
