import {normalizeUploadError} from './upload-error.js?v=32';
import {inspectAudio,checkPlayable,verifyStoredAudio,withAudioTimeout} from './audio-validation.js?v=17';
export function transientNetwork(error){const status=Number(error?.status||error?.statusCode||error?.code);return error?.retryable===true||[408,429].includes(status)||status>=500||/falha na conexão|networkerror|failed to fetch|fetch failed|network request|load failed|tempo esgotado|timeout/i.test(error?.message||'')}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function retryRead(task,{wait=pause,attempts=3}={}){for(let i=0;;i++){try{return await task()}catch(error){if(i>=attempts-1||!transientNetwork(error))throw error;await wait(500*2**i)}}}
export async function uploadStage(label,task){try{return await task()}catch(original){const cause=normalizeUploadError(original);const e=new Error(`${label}: ${cause.message}`);e.cause=cause;e.status=cause.status;e.stage=label;e.retryable=transientNetwork(cause);throw e}}
// One stable identifier per selected Blob. Never remove media on an ambiguous commit.
export function createLibraryTransfer({storage,find,insert,unwrap,wait=pause,makeId=()=>crypto.randomUUID(),canDecode=typeof Audio!=='undefined',upload=storage.upload.bind(storage),uploadTimeout=120000}){
 const jobs=new WeakMap();
 return async function transfer(blob,{filename,metadata,onProgress=()=>{}}){
  let job=jobs.get(blob);if(!job){const id=makeId();job={id,path:'custom/'+id+'.'+filename.split('.').pop().toLowerCase()};jobs.set(blob,job)}
  if(job.result)return job.result;
  const stage=async(label,task)=>{onProgress(label);return uploadStage(label,task)};
  const read=task=>retryRead(task,{wait});
  const isMissing=e=>[400,404].includes(Number(e?.status||e?.statusCode))&&/not.?found|does not exist|object not found/i.test(e?.message||'');
  const loadStored=()=>read(async()=>unwrap(await withAudioTimeout(storage.download(job.path))));
  const reconcileRow=async()=>{const row=await read(()=>find(job.id));if(row){if(row.object_path!==job.path)throw Error('O cadastro encontrado não corresponde a este envio.');job.result=row;return row}return null};
  // Complete local read first: files from cloud folders may become unavailable mid-batch.
  const bytes=await stage('Leitura do arquivo no computador',()=>blob.arrayBuffer());
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(job.fingerprint&&job.fingerprint!==fingerprint)throw Error('O arquivo foi alterado no computador. Selecione-o novamente.');job.fingerprint=fingerprint;
  const snapshot=new Blob([bytes],{type:blob.type});
  const {mime}=await stage('Validação do áudio',()=>inspectAudio(snapshot,filename));
  if(canDecode)await stage('Validação da reprodução',()=>checkPlayable(new Blob([bytes],{type:mime})));
  if(job.catalogAttempted){const existing=await stage('Confirmação do cadastro',reconcileRow);if(existing)return existing}
  await stage('Envio ao armazenamento',async()=>{
   for(let attempt=0;!job.stored;attempt++){
    if(job.uncertain){try{await verifyStoredAudio(snapshot,await loadStored());job.stored=true;break}catch(error){if(!isMissing(error))throw error;job.uncertain=false}}
    try{unwrap(await withAudioTimeout(upload(job.path,bytes,{contentType:mime,upsert:false,onProgress:percent=>onProgress('Enviando áudio… '+percent+'%')}),uploadTimeout,'Tempo esgotado ao enviar o áudio. Tente novamente.'));job.stored=true}
    catch(error){const duplicate=Number(error.status||error.statusCode)===409||/already exists|duplicate/i.test(error.message||'');if(!transientNetwork(error)&&!duplicate)throw error;job.uncertain=true;if(attempt>=2)throw error;await wait(500*2**attempt)}
   }
  });
  if(!job.verified){await stage('Conferência do arquivo gravado',async()=>{const stored=await loadStored();try{await verifyStoredAudio(snapshot,stored)}catch(error){await storage.remove([job.path]).catch(()=>{});job.stored=false;job.uncertain=false;throw error}job.verified=true})}
  const row={...metadata,id:job.id,object_path:job.path,audio_url:storage.getPublicUrl(job.path).data.publicUrl,filename,mime,file_size:snapshot.size,active:true,position:-1};
  return stage('Gravação do cadastro',async()=>{
   for(let attempt=0;attempt<3;attempt++){
    job.catalogAttempted=true;
    try{job.result=await insert(row);return job.result}catch(error){const duplicate=error.code==='23505';if(!transientNetwork(error)&&!duplicate)throw error;const existing=await reconcileRow();if(existing)return existing;if(attempt===2)throw error;await wait(500*2**attempt)}
   }
  });
 };
}
