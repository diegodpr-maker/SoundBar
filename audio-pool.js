// Session-memory preparation. Private audio is never persisted in Cache Storage.
export function createAudioPool({makeAudio=()=>new Audio(),fetcher=fetch,makeURL=b=>URL.createObjectURL(b),revokeURL=u=>URL.revokeObjectURL(u),maxBytes=64*1024*1024,loadBlob=null,onChange=()=>{}}={}){
 const entries=new Map(),assets=new Map();let generation=0,controllers=[],reserved=0,visible=new Set();
 const changed=()=>onChange();
 function reset(preservePlaying){generation++;for(const c of controllers)c.abort();controllers=[];const keptURLs=new Set();for(const [id,e] of entries){if(preservePlaying&&!e.audio.paused){keptURLs.add(e.url);continue}e.audio.pause();e.audio.removeAttribute('src');e.audio.load();entries.delete(id)}for(const [url,a] of assets){if(keptURLs.has(url))continue;if(a.blobURL)revokeURL(a.blobURL);assets.delete(url)}reserved=[...assets.values()].reduce((n,a)=>n+(a.reserved||0),0);visible=new Set();}
 function clear(){reset(false);changed()}
 function prepare(items){reset(true);visible=new Set(items.map(i=>i.id));const epoch=generation,queue=[];
 for(const item of items){if(entries.has(item.id))continue;const audio=makeAudio();audio.preload='none';audio.src=item.url;const entry={...item,audio,state:'loading'};entries.set(item.id,entry);audio.addEventListener('canplay',()=>{if(generation===epoch){entry.state='ready';changed()}});audio.addEventListener('error',()=>{if(generation===epoch){entry.state='error';changed()}});
 let asset=assets.get(item.url);if(!asset){const size=Number(item.size)||0;asset={url:item.url,entries:[],blobURL:null,reserved:0};assets.set(item.url,asset);if(size>0&&reserved+size<=maxBytes){reserved+=size;asset.reserved=size;queue.push(asset)}}asset.entries.push(entry);if(asset.blobURL){audio.preload='auto';audio.src=asset.blobURL;audio.load()}else if(!asset.reserved){audio.preload='auto';audio.load()};}
 changed();
 async function worker(){while(queue.length&&generation===epoch){const asset=queue.shift(),abort=new AbortController();controllers.push(abort);try{const blob=loadBlob?await loadBlob(asset.entries[0],abort.signal):await (async()=>{const response=await fetcher(asset.url,{signal:abort.signal,credentials:'omit'});if(!response.ok)throw Error('Audio download failed');const size=Number(response.headers?.get('content-length'));if(size>maxBytes)throw Error('Audio too large');return response.blob()})();if(generation!==epoch)return;if(reserved-asset.reserved+blob.size>maxBytes)throw Error('Audio budget exceeded');reserved=reserved-asset.reserved+blob.size;asset.reserved=blob.size;asset.blobURL=makeURL(blob);for(const e of asset.entries){if(e.audio.paused){e.audio.preload='auto';e.audio.src=asset.blobURL;e.audio.load()}}changed()}catch(error){if(error.name!=='AbortError'&&generation===epoch){for(const e of asset.entries){if(e.audio.paused){e.audio.preload='auto';e.audio.load()}}changed()}}}}
 worker();worker();
 }
 function get(id){return entries.get(id)}
 function url(id,fallback){const e=entries.get(id);return e?(assets.get(e.url)?.blobURL||e.url):fallback}
 function stop(id){const e=entries.get(id);if(e){e.audio.pause();e.audio.currentTime=0;const cached=assets.get(e.url)?.blobURL;if(cached&&e.audio.src!==cached){e.audio.src=cached;e.audio.load()}}}
 return {prepare,clear,get,url,stop,stats(){return{ready:[...entries.values()].filter(e=>visible.has(e.id)&&e.state==='ready').length,total:visible.size}}};
}
