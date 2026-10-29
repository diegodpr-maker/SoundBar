import {writeFileSync} from 'node:fs';
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
 const root=await request(base);report.root=visible(root);const candidates=links(root).filter(u=>u.pathname.endsWith('/')&&u.href!==base.href);let folder=candidates.find(u=>{const name=normalize(decodeURIComponent(u.pathname.split('/').at(-2)));return name.includes('abertura')&&name.includes('trabalh')});
 if(!folder){for(const name of ['abertura trabalhos','Abertura Trabalhos','Abertura dos Trabalhos','abertura dos trabalhos']){const candidate=new URL(encodeURIComponent(name)+'/',base),probe=await request(candidate);if(probe.status===200&&links(probe).some(u=>/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(u.pathname))){folder=candidate;break}}}
 if(!folder){report.errors.push('The requested folder could not be identified from the public index.');report.directoryNames=candidates.map(u=>decodeURIComponent(u.pathname.split('/').at(-2)));}
 else{
  const index=await request(folder);report.folder=visible(index);const files=[...new Map(links(index).filter(u=>/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(u.pathname)).map(u=>[u.href,u])).values()];
  for(const file of files.slice(0,100)){try{const head=await request(file,{method:'HEAD'});const probe=await request(file,{range:true,limit:65536});const total=probe.range?.match(/\/(\d+)$/)?.[1]||(probe.status===200?probe.length:head.length);report.files.push({name:decodeURIComponent(file.pathname.split('/').at(-1)),url:file.href,status:probe.status,mime:probe.type,size:total?Number(total):null,allowOrigin:probe.allowOrigin,cors:probe.allowOrigin==='*'||probe.allowOrigin===appOrigin,audioHeader:/^(ID3|RIFF|OggS|fLaC)/.test(probe.text)||probe.bytes[0]===255&&(probe.bytes[1]&224)===224,probeBytes:probe.bytes.length})}catch(error){report.files.push({url:file.href,error:error.message})}}
  if(files.length>100)report.errors.push('More than 100 files in this folder; inspect the remaining files separately.');
 }
}catch(error){report.errors.push(error.message)}
writeFileSync('cpanel-inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
