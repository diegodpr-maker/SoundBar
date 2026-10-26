const ORIGINS=['https://harmony.sysmacom.com.br','https://diegodpr-maker.github.io'];
export function validateDeletion(body){
 const target=body?.target_user,email=body?.confirmation_email;
 if(typeof target!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target))throw Error('Conta inválida.');
 if(typeof email!=='string'||email.length>254||!email.trim())throw Error('Digite o e-mail da conta para confirmar.');
 return{target:target.toLowerCase(),email:email.trim().toLowerCase()};
}
export function safeDeletionFiles(files,target){
 if(!Array.isArray(files)||files.length>200)throw Error('Invalid file batch');
 const groups=new Map();
 for(const f of files){if(!['soundbar-audio','soundbar-submissions'].includes(f.bucket)||typeof f.path!=='string'||!f.path.startsWith(target+'/')||f.path.split('/').some(s=>s==='..'||s==='.'))throw Error('Unsafe file scope');if(!groups.has(f.bucket))groups.set(f.bucket,[]);groups.get(f.bucket).push(f.path)}
 return groups;
}
export function accountDeletionHandler({authorize,service,maxBatches=1}){
 return async request=>{
  const origin=request.headers.get('origin'),allowed=ORIGINS.includes(origin),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(allowed)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'});
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(!allowed)return reply({error:'Origem não permitida.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'Método não permitido.'},405);
  const bearer=request.headers.get('authorization')||'';if(!/^Bearer \S+$/i.test(bearer))return reply({error:'Entre na sua conta.'},401);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply({error:'Solicitação inválida.'},415);
  let job,phase='files',data;
  try{
   if(Number(request.headers.get('content-length'))>2048)return reply({error:'Solicitação muito grande.'},413);
   if(!request.body)return reply({error:'Solicitação inválida.'},400);
   const reader=request.body.getReader(),chunks=[];let length=0;
   for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>2048){await reader.cancel();return reply({error:'Solicitação muito grande.'},413)}chunks.push(value)}
   const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply({error:'Solicitação inválida.'},400)}
   try{data=validateDeletion(body)}catch(error){return reply({error:error.message||'Dados inválidos.'},400)}
   const actor=await authorize(bearer);
   if(actor.id===data.target)return reply({error:'Sua conta administradora não pode ser excluída.'},403);
   job=await actor.prepare(data.target,data.email);
   if(job.status==='completed')return reply({ok:true,status:'completed'});
   if(job.user_id!==data.target||!job.lease)throw Error('Invalid deletion job');
   const readFiles=async()=>{const files=await service.files(data.target,job.lease);safeDeletionFiles(files,data.target);return files};
   await service.ban(data.target);
   for(let batch=0;batch<maxBatches;batch++){
    const files=await readFiles();if(!files.length)break;
    for(const [bucket,paths]of safeDeletionFiles(files,data.target))await service.remove(bucket,paths);
   }
   if((await readFiles()).length){await service.finish(data.target,job.lease,{status:'queued',phase,http_status:0});return reply({status:'pending'},202)}
   phase='auth';await service.deleteUser(data.target);
   if((await readFiles()).length){await service.finish(data.target,job.lease,{status:'queued',phase:'files',http_status:0});return reply({status:'pending'},202)}
   await service.finish(data.target,job.lease,{status:'completed',phase,http_status:200});
   return reply({ok:true,status:'completed'});
  }catch(error){
   if(job?.lease){await service.finish(data.target,job.lease,{status:'failed',phase,http_status:Number(error.status)||0}).catch(()=>{});console.error(JSON.stringify({event:'account_deletion_failed',phase,status:Number(error.status)||0}));return reply({error:'A conta está bloqueada. Não foi possível concluir a exclusão; tente novamente.'},503)}
   const code=error.code,status=error.status===401?401:code==='42501'?403:code==='22023'?400:code==='P0002'?404:code==='55P03'?409:503;
   return reply({error:status===503?'Não foi possível iniciar a exclusão. Tente novamente.':error.message||'Solicitação não autorizada.'},status);
  }
 };
}
