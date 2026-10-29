import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const allCategories=process.argv.includes('--all');
const base=new URL('https://sysmacom.com.br/musicas-harmony/'),appOrigin='https://harmony.sysmacom.com.br';
const report={base:base.href,checkedAt:new Date().toISOString(),root:null,folder:null,files:[],errors:[]};
const allowed=url=>url.origin===base.origin&&url.pathname.startsWith(base.pathname)&&!url.username&&!url.password&&!/%(?:2f|5c)/i.test(url.pathname);
async function request(url,{method='GET',range=false,limit=500000}={}){
 let current=new URL(url);for(let redirects=0;redirects<4;redirects++){
  if(!allowed(current))throw Error('Address outside the requested music directory.');
  const response=await fetch(current,{method,redirect:'manual',headers:{Origin:appOrigin,...(range?{Range:'bytes=0-65535'}:{})},signal:AbortSignal.timeout(20000)});
  if([301,302,303,307,308].includes(response.status)){const target=new URL(response.headers.get('location'),current);await response.body?.cancel();current=target;continue}
  let bytes=new Uint8Array();if(method!=='HEAD'&&response.body){const reader=response.body.getReader(),chunks=[];let size=0;try{while(size<limit){const {value,done}=await reader.read();if(done)break;const chunk=value.subarray(0,limit-size);chunks.push(chunk);size+=chunk.length}}finally{await reader.cancel()}bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}}
  return{url:current.href,status:response.status,type:response.headers.get('content-type'),length:response.headers.get('content-length'),range:response.headers.get('content-range'),allowOrigin:response.headers.get('access-control-allow-origin'),text:new TextDecoder().decode(bytes),bytes};
 }throw Error('Too many redirects.');
}
function links(result){return [...result.text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m=>{try{return new URL(m[1].replaceAll('&amp;','&'),result.url)}catch{return null}}).filter(u=>u&&allowed(u)&&!u.search&&!u.hash)}
const visible=r=>({url:r.url,status:r.status,type:r.type,allowOrigin:r.allowOrigin});
const normalize=name=>name.normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z]/gi,'').toLowerCase();
try{
 const catalogResponse=await request(new URL('harmony-catalogo.php',base),{limit:4000000});report.root=visible(catalogResponse);
 if(catalogResponse.status!==200)throw Error('Catalogue returned '+catalogResponse.status);
 const catalog=JSON.parse(catalogResponse.text);if(catalog.format!=='harmony-cpanel-catalog'||catalog.version!==1||!Array.isArray(catalog.files))throw Error('Invalid catalogue');
 report.totalCatalogFiles=catalog.files.length;report.ignoredCount=catalog.ignored?.length||0;report.ignored=catalog.ignored||[];report.catalogTruncated=!!catalog.truncated;
 const selected=catalog.files.filter(f=>{const name=normalize(String(f.category||''));return allCategories||name.includes('abertura')&&name.includes('trabalh')});report.selectedCategories=[...new Set(selected.map(f=>f.category))];
 if(!selected.length){report.availableCategories=[...new Set(catalog.files.map(f=>f.category))];throw Error('Requested category not found in catalogue.');}
 report.folder={url:catalogResponse.url,status:200,type:'application/json',allowOrigin:catalogResponse.allowOrigin};
 const limit=allCategories?5000:100;let next=0;
 async function worker(){while(next<Math.min(selected.length,limit)){const item=selected[next++];
  try{
   const file=new URL(item.path,base);if(!allowed(file)||file.search||file.hash||!/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.pathname))throw Error('Invalid audio address');
   const head=await request(file,{method:'HEAD'});const probe=await request(file,{range:true,limit:65536});const total=probe.range?.match(/\/(\d+)$/)?.[1]||(probe.status===200?probe.length:head.length);
   report.files.push({name:item.name,filename:item.filename,category:item.category,url:file.href,status:probe.status,mime:probe.type,size:total?Number(total):null,expectedSize:Number(item.file_size),allowOrigin:probe.allowOrigin,cors:probe.allowOrigin==='*'||probe.allowOrigin===appOrigin,audioHeader:/^(ID3|RIFF|OggS|fLaC)/.test(probe.text)||probe.bytes[0]===255&&(probe.bytes[1]&224)===224||new TextDecoder().decode(probe.bytes.subarray(4,8))==='ftyp'||Buffer.from(probe.bytes.subarray(0,4)).toString('hex')==='1a45dfa3',probeBytes:probe.bytes.length,headHash:createHash('sha256').update(probe.bytes).digest('hex')});
  }catch(error){report.files.push({name:item.name,category:item.category,error:error.message})}
 }
 }
 await Promise.all([worker(),worker(),worker()]);report.files.sort((a,b)=>String(a.url||a.name).localeCompare(String(b.url||b.name)));
 if(selected.length>limit)report.errors.push('Catalogue exceeds inspection limit.');
}catch(error){report.errors.push(error.message)}
writeFileSync('cpanel-inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
