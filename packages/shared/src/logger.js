const levels={debug:10,info:20,warn:30,error:40};
export const logger=Object.fromEntries(Object.keys(levels).map(level=>[level,(message,meta={})=>{
  if(levels[level]<(levels[process.env.LOG_LEVEL]??20))return;
  const line=JSON.stringify({timestamp:new Date().toISOString(),level,message,...meta});
  if(level==='error')console.error(line);
  else if(level==='warn')console.warn(line);
  else console.log(line);
}]));