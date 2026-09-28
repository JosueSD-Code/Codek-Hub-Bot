import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const levels={debug:10,info:20,warn:30,error:40};
const logFile=path.join(process.cwd(),'logs','codek-hub.log');

async function persist(line){
  try{
    await mkdir(path.dirname(logFile),{recursive:true});
    await appendFile(logFile,line+'\n','utf8');
  }catch{}
}

export const logger=Object.fromEntries(Object.keys(levels).map(level=>[level,(message,meta={})=>{
  if(levels[level]<(levels[process.env.LOG_LEVEL]??20))return;
  const line=JSON.stringify({timestamp:new Date().toISOString(),level,message,...meta});
  void persist(line);
  if(level==='error')console.error(line);
  else if(level==='warn')console.warn(line);
  else console.log(line);
}]));
