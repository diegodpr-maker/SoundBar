export function validPushEndpoint(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.port&&value.length<=4096&&
 (['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))}catch{return false}
}
export function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let different=0;for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);return different===0}
export function createDispatcher({rpc,generateKeys,requestDetails,fetch:send=globalThis.fetch}){
 const call=async(action,data={})=>{const result=await rpc(action,data);if(result.error)throw Error('push_database_failure');return result.data};
 async function config(){let keys=await call('config');if(!keys.publicKey){keys=await call('init',generateKeys())}return keys}
 async function dispatch(keys){
  const jobs=await call('claim');let accepted=0;
  for(const job of jobs){
   await Promise.all(job.subscriptions.map(async sub=>{
    let status=0;
    try{
     if(!validPushEndpoint(sub.endpoint))status=410;
     else{
      const details=requestDetails({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({type:job.kind==='test'?'harmony-push-test':'harmony-new-account',id:job.id}),{TTL:86400,urgency:'normal',vapidDetails:{subject:'https://harmony.sysmacom.com.br',publicKey:keys.publicKey,privateKey:keys.privateKey}});
      const response=await send(sub.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(8000)});
      status=response.status;await response.body?.cancel();if(status>=200&&status<300)accepted++;
     }
    }catch{status=0}
    await call('record',{event:job.id,lease:job.lease,subscription:sub.id,status});
   }));
   await call('finish',{event:job.id,lease:job.lease});
  }
  return {processed:jobs.length,accepted};
 }
 return {config,dispatch};
}
export function pushHandler({readConfig,initialize,dispatch}){
 return async request=>{
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(request.headers.has('origin'))return reply({error:'Forbidden'},403);
  try{
   const keys=await readConfig();
   if(!constantEqual(request.headers.get('authorization'),'Bearer '+keys.dispatchSecret))return reply({error:'Unauthorized'},401);
   const initialized=keys.publicKey?keys:await initialize();
   return reply(await dispatch(initialized));
  }catch{console.error(JSON.stringify({event:'admin_push_dispatch_failed'}));return reply({error:'Dispatch unavailable'},503)}
 };
}
