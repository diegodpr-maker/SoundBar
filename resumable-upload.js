// Upload URLs remain in memory only; no tokens or private filenames are persisted.
export function createResumableUploader({client,bucket,config=globalThis.SOUNDBAR_CONFIG,loadTus=()=>import('https://esm.sh/tus-js-client@4.3.1/lib.esm/browser/index.js?bundle'),timeout=180000}){
 const pending=new Map();
 return async(path,bytes,{contentType,onProgress=()=>{}}={})=>{
  // Unit-test clients and intentionally unconfigured instances keep the SDK transport.
  if(!config?.supabaseUrl)return client.storage.from(bucket).upload(path,bytes,{contentType,upsert:false});
  const base=new URL(config.supabaseUrl);if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co'))throw Error('Não foi possível preparar o envio.');
  base.hostname=base.hostname.replace(/\.supabase\.co$/,'.storage.supabase.co');
  const endpoint=base.origin+'/storage/v1/upload/resumable';
  const current=await client.auth.getSession();if(current.error)throw current.error;const session=current.data?.session;if(!session?.access_token)throw Object.assign(Error('Sua sessão terminou. Entre novamente.'),{status:401});
  const key=session.user.id+'/'+bucket+'/'+path,{Upload}=await loadTus();
  return new Promise((resolve,reject)=>{let settled=false,upload;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else{pending.delete(key);resolve({data:{path}})}};
   const timer=setTimeout(()=>{if(upload?.url)pending.set(key,upload.url);upload?.abort().catch(()=>{});finish(Error('Tempo esgotado ao enviar. Tente novamente; a conversão será reaproveitada.'))},timeout);
   try{upload=new Upload(new Blob([bytes],{type:contentType}),{
    endpoint,uploadUrl:pending.get(key)||undefined,
    chunkSize:6*1024*1024,uploadDataDuringCreation:false,storeFingerprintForResuming:false,
    retryDelays:[0,1500,3000,6000,10000],requestTimeout:45000,
    headers:{authorization:'Bearer '+session.access_token,apikey:config.supabaseKey,'x-upsert':'false'},
    metadata:{bucketName:bucket,objectName:path,contentType,cacheControl:'3600'},
    onBeforeRequest:async request=>{const refreshed=await client.auth.getSession();if(refreshed.error)throw refreshed.error;const token=refreshed.data?.session?.access_token;if(!token)throw Object.assign(Error('Sua sessão terminou. Entre novamente.'),{status:401});request.setHeader('authorization','Bearer '+token)},
    onProgress:(sent,total)=>{if(settled)return;if(upload.url)pending.set(key,upload.url);onProgress(total?Math.round(sent/total*100):0)},
    onSuccess:()=>finish(),
    onError:cause=>{if(upload.url)pending.set(key,upload.url);const status=cause.originalResponse?.getStatus?.()||cause.status||0;const message=status===401?'Sua sessão terminou. Entre novamente.':status===403?'Sua conta não tem permissão para este envio.':status===409?'O arquivo já existe.':status&&status<500&&status!==408&&status!==429?'O armazenamento recusou o envio ('+status+').':'Falha na conexão durante o envio. Tente novamente apenas os pendentes; a conversão será reaproveitada.';finish(Object.assign(Error(message),{status,cause}))}
   });upload.start()}catch(error){finish(error)}
  });
 };
}
