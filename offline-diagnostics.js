// Read-only device diagnostics. Never export tokens, keys, audio, or user IDs.
import {unseal} from './offline-audio.js?v=50';
async function inspectDatabase(owner){
 const database=await new Promise((resolve,reject)=>{const request=indexedDB.open('soundbar-encrypted-audio');request.onupgradeneeded=()=>{request.transaction.abort();resolve(null)};request.onerror=()=>{if(request.error?.name==='AbortError')resolve(null);else reject(request.error)};request.onsuccess=()=>resolve(request.result)});
 if(!database)return {exists:false};
 try{
  if(!database.objectStoreNames.contains('keys')||!database.objectStoreNames.contains('audio'))return {exists:true,readable:false};
  const records=await new Promise((resolve,reject)=>{const tx=database.transaction(['keys','audio'],'readonly'),keys=tx.objectStore('keys'),audio=tx.objectStore('audio');const totalKeys=keys.count(),totalAudio=audio.count(),key=owner?keys.get(owner):null,metadata=owner?audio.get([owner,'@playlists']):null;let owned=0;const cursor=audio.openKeyCursor();cursor.onsuccess=()=>{const item=cursor.result;if(item){if(owner&&item.key[0]===owner)owned++;item.continue()}};tx.oncomplete=()=>resolve({keys:totalKeys.result,records:totalAudio.result,owned,key:key?.result,metadata:metadata?.result});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Local read aborted'))});
  const result={exists:true,readable:true,key_count:records.keys,record_count:records.records,recognized_owner_records:records.owned,recognized_owner_key:!!records.key,recognized_owner_metadata:!!records.metadata};
  if(records.key&&records.metadata){try{const snapshot=JSON.parse(await(await unseal(records.metadata,records.key,owner+':@playlists')).text());result.metadata_readable=snapshot.me?.profile.id===owner&&Array.isArray(snapshot.boards);if(result.metadata_readable)result.saved_playlists=snapshot.boards.map(board=>({name:board.playlist?.name||'',tracks:board.tracks?.length||0}))}catch{result.metadata_readable=false}}
  return result;
 }finally{database.close()}
}
export async function offlineReport(){
 const report={format:'harmony-device-diagnostic',version:1,created_at:new Date().toISOString(),origin:location.origin,build:document.documentElement.dataset.harmonyBuild||null,online:navigator.onLine,installed:!!navigator.standalone||!!globalThis.matchMedia?.('(display-mode: standalone)').matches,controller:!!navigator.serviceWorker?.controller};
 let owner=null;
 try{owner=localStorage.getItem('harmony-offline-owner');const session=JSON.parse(localStorage.getItem('soundbar-supabase-session')||'null');report.owner_pointer_present=!!owner;report.online_session_present=!!session;report.owner_matches_session=!session?.user?.id||session.user.id===owner;const local=JSON.parse(localStorage.getItem('sounddeck-v1')||'null');report.device_file_playlists=local?.playlists?.map(p=>({name:p.name,tracks:p.pads?.length||0,attached_files:p.pads?.filter(t=>t.file).length||0}))||[]}catch{report.local_settings_readable=false}
 try{report.encrypted_storage=await inspectDatabase(report.owner_matches_session?owner:null)}catch(error){report.encrypted_storage={readable:false,error:error.name||'ReadError'}}
 try{report.shell_caches=(await caches.keys()).filter(key=>/^sysmacom-harmony-pages-v\d+$/.test(key))}catch{report.shell_caches_readable=false}
 return report;
}
