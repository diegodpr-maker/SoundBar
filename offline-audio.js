// Encrypted, per-account device storage. Keys are non-extractable Web Crypto keys.
let opening;
function db(){return opening||=new Promise((resolve,reject)=>{const r=indexedDB.open('soundbar-encrypted-audio',1);r.onupgradeneeded=()=>{r.result.createObjectStore('keys');r.result.createObjectStore('audio')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{opening=null;reject(r.error)}})}
async function access(store,mode,action){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(store,mode);const req=action(tx.objectStore(store));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Armazenamento interrompido'))})}
const creating=new Map(),generations=new Map();
async function key(owner,create=false){let k=await access('keys','readonly',s=>s.get(owner));if(!k&&create){if(!creating.has(owner))creating.set(owner,(async()=>{const generated=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction('keys','readwrite'),store=tx.objectStore('keys'),request=store.get(owner);request.onsuccess=()=>{if(!request.result)store.put(generated,owner)};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});return access('keys','readonly',s=>s.get(owner))})().finally(()=>creating.delete(owner)));k=await creating.get(owner)}return k}

export async function seal(blob,key,aad){const iv=crypto.getRandomValues(new Uint8Array(12));return{iv,type:blob.type,data:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad)},key,await blob.arrayBuffer())}}
export async function unseal(record,key,aad){return new Blob([await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv,additionalData:new TextEncoder().encode(aad)},key,record.data)],{type:record.type})}
export const offlineAudio={
 async has(owner,id){try{return !!await access('audio','readonly',s=>s.getKey([owner,id]))}catch{return false}},
 async save(owner,id,blob){const epoch=generations.get(owner)||0;const k=await key(owner,true);const record=await seal(blob,k,owner+':'+id);if(epoch!==(generations.get(owner)||0))throw Error('Sessão alterada.');await access('audio','readwrite',s=>s.put(record,[owner,id]))},
 async load(owner,id){try{const record=await access('audio','readonly',s=>s.get([owner,id]));if(!record)return null;const k=await key(owner);return k?await unseal(record,k,owner+':'+id):null}catch{return null}},
 async remove(owner,id){await access('audio','readwrite',s=>s.delete([owner,id]))},
 async clear(owner){generations.set(owner,(generations.get(owner)||0)+1);await creating.get(owner);const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction(['audio','keys'],'readwrite');tx.objectStore('keys').delete(owner);const r=tx.objectStore('audio').openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(c.key[0]===owner)c.delete();c.continue()}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
};
