// Encrypted, per-account device storage. Keys are non-extractable Web Crypto keys.
let opening;
function db(){return opening||=new Promise((resolve,reject)=>{const r=indexedDB.open('soundbar-encrypted-audio',1);r.onupgradeneeded=()=>{r.result.createObjectStore('keys');r.result.createObjectStore('audio')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{opening=null;reject(r.error)}})}
async function access(store,mode,action){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(store,mode);const req=action(tx.objectStore(store));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Armazenamento interrompido'))})}
async function key(owner,create=false){let k=await access('keys','readonly',s=>s.get(owner));if(!k&&create){k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await access('keys','readwrite',s=>s.put(k,owner))}return k}
export async function seal(blob,key,aad){const iv=crypto.getRandomValues(new Uint8Array(12));return{iv,type:blob.type,data:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad)},key,await blob.arrayBuffer())}}
export async function unseal(record,key,aad){return new Blob([await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv,additionalData:new TextEncoder().encode(aad)},key,record.data)],{type:record.type})}
export const offlineAudio={
 async has(owner,id){try{return !!await access('audio','readonly',s=>s.getKey([owner,id]))}catch{return false}},
 async save(owner,id,blob){const k=await key(owner,true);const record=await seal(blob,k,owner+':'+id);await access('audio','readwrite',s=>s.put(record,[owner,id]))},
 async load(owner,id){try{const record=await access('audio','readonly',s=>s.get([owner,id]));if(!record)return null;const k=await key(owner);return k?await unseal(record,k,owner+':'+id):null}catch{return null}},
 async clear(owner){const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction(['audio','keys'],'readwrite');tx.objectStore('keys').delete(owner);const r=tx.objectStore('audio').openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(c.key[0]===owner)c.delete();c.continue()}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
};
