// Prepare device files only. Remote sources are attached on an explicit play.
// Never persist private audio in Cache Storage or preload the remote catalogue.
export function createAudioPool({makeAudio=()=>new Audio(),makeURL=b=>URL.createObjectURL(b),revokeURL=u=>URL.revokeObjectURL(u),maxBytes=64*1024*1024,loadLocal=async()=>null,isRetained=()=>false,onChange=()=>{}}={}){
 const entries=new Map(),assets=new Map();let generation=0,reserved=0,visible=new Set();
 const changed=()=>onChange();
 function reset(preservePlaying){generation++;const keptURLs=new Set();for(const [id,e] of entries){if(preservePlaying&&(!e.audio.paused||isRetained(e.audio))){keptURLs.add(e.url);continue}e.audio.pause();e.audio.removeAttribute('src');e.audio.load();entries.delete(id)}for(const [url,a] of assets){if(keptURLs.has(url))continue;if(a.blobURL)revokeURL(a.blobURL);assets.delete(url)}reserved=[...assets.values()].reduce((n,a)=>n+(a.reserved||0),0);visible=new Set();}
 function clear(){reset(false);changed()}
 function prepare(items){reset(true);visible=new Set(items.map(i=>i.id));const epoch=generation,queue=[];
 for(const item of items){if(entries.has(item.id))continue;const audio=makeAudio();audio.preload='none';const entry={...item,audio,state:item.localOnly?'local':'idle'};entries.set(item.id,entry);audio.addEventListener('canplay',()=>{if(entries.get(item.id)===entry){entry.state='ready';changed()}});audio.addEventListener('error',()=>{if(entries.get(item.id)===entry){entry.state='error';changed()}});
 let asset=assets.get(item.url);if(!asset){const size=Number(item.size)||0;asset={url:item.url,entries:[],blobURL:null,reserved:0};assets.set(item.url,asset);if(size>0&&reserved+size<=maxBytes){reserved+=size;asset.reserved=size;queue.push(asset)}}asset.entries.push(entry);if(asset.blobURL){audio.preload='auto';audio.src=asset.blobURL;audio.load()}}
 changed();
 async function worker(){while(queue.length&&generation===epoch){const asset=queue.shift();try{const blob=await loadLocal(asset.entries[0]);if(generation!==epoch)return;if(!blob){reserved-=asset.reserved;asset.reserved=0;continue}if(reserved-asset.reserved+blob.size>maxBytes)throw Error('Audio budget exceeded');reserved=reserved-asset.reserved+blob.size;asset.reserved=blob.size;asset.blobURL=makeURL(blob);for(const e of asset.entries){if(e.audio.paused&&!e.activated&&!isRetained(e.audio)){e.audio.preload='auto';e.audio.src=asset.blobURL;e.audio.load()}}changed()}catch{if(generation===epoch){reserved-=asset.reserved;asset.reserved=0;changed()}}}}
 worker();worker();
 }
 function get(id){return entries.get(id)}
 function url(id,fallback){const e=entries.get(id);return e?(assets.get(e.url)?.blobURL||e.url):fallback}
 function activate(id,remoteURL){const e=entries.get(id);if(!e)return;e.activated=true;if(!e.audio.src){const local=assets.get(e.url)?.blobURL;if(local)e.audio.src=local;else if(!e.localOnly)e.audio.src=remoteURL||e.url}return e.audio}
 function stop(id){const e=entries.get(id);if(e){e.audio.pause();e.audio.currentTime=0;e.activated=false;const cached=assets.get(e.url)?.blobURL;if(cached&&e.audio.src!==cached){e.audio.src=cached;e.audio.load()}else if(e.localOnly&&!cached){e.audio.removeAttribute('src');e.audio.load()}}}
 return {prepare,clear,get,url,activate,stop,stats(){return{ready:[...entries.values()].filter(e=>visible.has(e.id)&&['ready','local'].includes(e.state)).length,total:visible.size}}};
}
