import {verifyStoredAudio,withAudioTimeout} from './audio-validation.js?v=33';
import {transientNetwork} from './upload-transfer.js?v=33';
// Stable track IDs allow reconciliation after a lost reply without replacing objects.
export async function transferPlaylistAudio({blob,filename,mime,id,userId,playlistId,name,color},{storage,find,insert,unwrap}){
 const path=userId+'/'+id+'.'+filename.split('.').pop().toLowerCase();
 const reconcile=async()=>{const row=await withAudioTimeout(find(id));if(!row)return null;if(row.playlist_id!==playlistId||row.audio_path!==path||Number(row.file_size)!==blob.size)throw Error('Este envio não corresponde ao áudio selecionado.');await verifyStoredAudio(blob,unwrap(await withAudioTimeout(storage.download(path))));return{id:row.id}};
 const existing=await reconcile();if(existing)return existing;
 const sent=await withAudioTimeout(storage.upload(path,blob,{contentType:mime,upsert:false}),120000,'O envio demorou demais. Tente novamente.').catch(error=>({error}));
 if(sent.error&&!transientNetwork(sent.error)&&Number(sent.error.status||sent.error.statusCode)!==409&&!/already exists|duplicate/i.test(sent.error.message||''))throw sent.error;
 try{await verifyStoredAudio(blob,unwrap(await withAudioTimeout(storage.download(path))))}catch(error){if(sent.error&&Number(error.status||error.statusCode)===404)throw sent.error;throw error}
 try{return await withAudioTimeout(insert({id,user_id:userId,playlist_id:playlistId,name,color,audio_path:path,filename:filename.slice(0,120),mime,file_size:blob.size}))}
 catch(error){
  // A failed lookup cannot prove that the insert did not commit: retain the object.
  const row=await reconcile();if(row)return row;
  if(!transientNetwork(error)&&error.code!=='23505')await storage.remove([path]).catch(()=>{});
  throw error;
 }
}
