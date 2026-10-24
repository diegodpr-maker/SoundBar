import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {mp3Info,readLimited} from './core.js';
const TOKEN_HASH='__TOKEN_HASH__';
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const MAX=50*1024*1024;
async function digest(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
Deno.serve(async req=>{
if(req.method!=='POST'||await digest(req.headers.get('x-import-token')||'')!==TOKEN_HASH)return new Response('Não autorizado',{status:403});
try{const {ids}=await req.json();if(!Array.isArray(ids)||ids.length<1||ids.length>4||ids.some(i=>!Number.isInteger(i)||i<1||i>26))return Response.json({error:'Lote inválido'},{status:400});
const selection=await client.from('sb_library_imports').select('*').in('id',ids).order('id');if(selection.error)throw selection.error;const results=[];
for(const asset of selection.data||[]){if(asset.status==='ready'){results.push({id:asset.id,status:'ready'});continue}
await client.from('sb_library_imports').update({status:'downloading',error:null,updated_at:new Date().toISOString()}).eq('id',asset.id);
try{let url=new URL(asset.source_url);let response:Response|undefined;
for(let attempt=0;attempt<4;attempt++){if(url.protocol!=='https:'||!['www.opacificador.com.br','opacificador.com.br'].includes(url.hostname)||!url.pathname.startsWith('/music/'))throw Error('Origem inválida');response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(45000)});if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw Error('Redirecionamento inválido');url=new URL(location,url);continue}break}
if(!response?.ok)throw Error('Falha na origem HTTP '+response?.status);if(Number(response.headers.get('content-length'))>MAX)throw Error('Arquivo maior que 50 MB');
const bytes=await readLimited(response.body,MAX);const info=mp3Info(bytes);
const upload=await client.storage.from('soundbar-library').upload(asset.object_path,bytes,{contentType:'audio/mpeg',upsert:true,cacheControl:'3600'});if(upload.error)throw upload.error;
const updated=await client.from('sb_library_tracks').update({active:true,file_size:info.bytes,duration_seconds:info.seconds}).eq('object_path',asset.object_path);if(updated.error)throw updated.error;
await client.from('sb_library_imports').update({status:'ready',file_size:info.bytes,duration_seconds:info.seconds,error:null,updated_at:new Date().toISOString()}).eq('id',asset.id);results.push({id:asset.id,status:'ready',bytes:info.bytes,seconds:info.seconds});
}catch(error){const message=String(error.message||error).slice(0,300);await client.from('sb_library_imports').update({status:'failed',error:message,updated_at:new Date().toISOString()}).eq('id',asset.id);results.push({id:asset.id,status:'failed',error:message})}
}
return Response.json({results});}catch(error){return Response.json({error:String(error.message||error).slice(0,300)},{status:500})}
});
