import {prepareAudioUpload} from './audio-conversion.js?v=33';
export function createPlaylistBatch(files,{owner,playlistId,playlistName,makeId=()=>crypto.randomUUID()}={}){
 const selected=Array.from(files||[]);if(!selected.length||selected.length>300)throw Error('Selecione de 1 a 300 áudios.');
 return{owner,playlistId,playlistName,busy:false,entries:selected.map(file=>({id:makeId(),file,filename:file.name,status:'pending',stage:'',error:''}))};
}
export function batchCounts(job){return{total:job.entries.length,done:job.entries.filter(e=>e.status==='done').length,failed:job.entries.filter(e=>e.status==='failed').length,pending:job.entries.filter(e=>!['done','failed'].includes(e.status)).length}}
export async function runPlaylistBatch(job,{upload,prepare=prepareAudioUpload,onChange=()=>{},isCurrent=()=>true,maxBytes=25*1024*1024,maxPreparedBytes=64*1024*1024}={}){
 if(job.busy)return batchCounts(job);job.busy=true;onChange();
 try{
  for(const entry of job.entries){
   if(entry.status==='done')continue;if(!isCurrent())break;
   try{
    if(!entry.file?.size||entry.file.size>maxBytes)throw Error('Escolha um áudio de até '+Math.round(maxBytes/1024/1024)+' MB.');
    if(!/\.(mp3|wav|ogg|m4a|aac|flac|webm|wma)$/i.test(entry.filename))throw Error('Formato de áudio não reconhecido.');
    entry.status='preparing';entry.stage='Preparando áudio…';entry.error='';onChange();
    const prepared=entry.prepared||await prepare(entry.file,{filename:entry.filename,maxBytes,onStage:message=>{const percent=String(message).match(/\d+%/)?.[0];entry.stage='Preparando áudio…'+(percent?' '+percent:'');onChange()}});
    if(prepared.converted)entry.prepared=prepared;
    if(!isCurrent()){entry.status='pending';break}
    entry.status='uploading';entry.stage='Enviando áudio…';onChange();
    const result=await upload(entry,prepared,job);entry.result=result;entry.status='done';entry.stage='Adicionado';entry.file=null;entry.prepared=null;
   }catch(error){entry.status='failed';entry.error=error.message||'Não foi possível enviar este áudio.';entry.stage='';if([401,403].includes(Number(error.status)))break}
   finally{onChange()}
   if(job.entries.reduce((size,item)=>size+(item.prepared?.blob.size||0),0)>=maxPreparedBytes)break;
  }
  return batchCounts(job);
 }finally{job.busy=false;onChange()}
}
