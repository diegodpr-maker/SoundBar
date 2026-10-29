// A selected file is fetched once, encrypted on this device, then played locally.
// This is account-scoped device caching, never a public service-worker response.
export function createDeviceAudioCache({audio,fetcher=fetch,isCurrent=()=>true,onStorageError=()=>{},timeout=120000,maxBytes=50*1024*1024}){
 const pending=new Map();let generation=0,warned=false;
 const interrupted=()=>Object.assign(Error('Reprodução interrompida.'),{name:'AbortError'});
 function clear(){generation++;warned=false;for(const job of pending.values())job.controller.abort();pending.clear()}
 async function get({owner,id,url,size=0,network=true,trackId=null}){
  if(!owner||!id)throw Error('Entre novamente para ouvir.');const mapKey=JSON.stringify([owner,id]);
  let job=pending.get(mapKey);
  if(!job){const epoch=generation,controller=new AbortController(),valid=()=>epoch===generation&&isCurrent(owner);job={controller};
   job.promise=(async()=>{
    if(!valid())throw interrupted();const local=await audio.load(owner,id);if(!valid())throw interrupted();if(local&&(!size||local.size===Number(size)))return{blob:local,saved:true};
    if(trackId&&trackId!==id){const legacy=await audio.load(owner,trackId);if(!valid())throw interrupted();if(legacy&&(!size||legacy.size===Number(size)))return{blob:legacy,saved:true,legacy:true}}
    if(!network)throw Error('Este áudio ainda não está disponível no dispositivo.');
    let timer;try{
     const transfer=(async()=>{const address=typeof url==='function'?await url():url;if(!valid())throw interrupted();const response=await fetcher(address,{signal:controller.signal,credentials:'omit',cache:'default'});if(!response.ok)throw Error('Não foi possível baixar o áudio. Tente novamente.');const blob=await response.blob();if(!blob.size||blob.size>maxBytes||size&&blob.size!==Number(size))throw Error('O áudio recebido está incompleto. Tente novamente.');return blob})();
     const blob=await Promise.race([transfer,new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(interrupted()),{once:true});timer=setTimeout(()=>{reject(Error('O download demorou demais. Tente novamente.'));controller.abort()},timeout)})]);
     if(!valid())throw interrupted();let saved=false;try{await audio.save(owner,id,blob);saved=true}catch(error){if(valid()&&!warned){warned=true;onStorageError(error)}}if(!valid())throw interrupted();return{blob,saved};
    }finally{clearTimeout(timer)}
   })().finally(()=>{if(pending.get(mapKey)===job)pending.delete(mapKey)});pending.set(mapKey,job);
  }
  const epoch=generation,result=await job.promise;if(epoch!==generation||!isCurrent(owner))throw interrupted();
  if(trackId&&trackId!==id&&result.saved&&!result.legacy){try{await audio.alias(owner,trackId,id)}catch(error){if(!warned){warned=true;onStorageError(error)}}}
  if(epoch!==generation||!isCurrent(owner))throw interrupted();return result;
 }
 return {get,clear};
}
