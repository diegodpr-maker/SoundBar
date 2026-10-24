const CACHE='soundbar-pages-v8';
const FILES=['./','./index.html','./local.html','./style.css','./landing.js','./samples.js','./audio-preview.js','./audio/intro.mp3','./audio/warm-loop.mp3','./audio/soft-beat.mp3','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('sounddeck-')||key.startsWith('soundbar-'))&&key!==CACHE)await caches.delete(key);await self.clients.claim()})())});
async function cachedRange(response,range){
 const bytes=await response.arrayBuffer(),m=/^bytes=(\d*)-(\d*)$/.exec(range);
 const invalid=()=>new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
 if(!m||(!m[1]&&!m[2])||!bytes.byteLength)return invalid();
 const size=bytes.byteLength;let start,end=size-1;
 if(!m[1]){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return invalid();start=Math.max(0,size-suffix)}else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]))}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return invalid();
 const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.set('Content-Length',String(end-start+1));headers.set('Content-Range',`bytes ${start}-${end}/${size}`);headers.set('Accept-Ranges','bytes');
 return new Response(bytes.slice(start,end+1),{status:206,headers});
}
self.addEventListener('fetch',e=>{const url=new URL(e.request.url),base=new URL(self.registration.scope);if(e.request.method!=='GET'||url.origin!==base.origin)return;const allowed=FILES.some(p=>new URL(p,base).pathname===url.pathname);if(!allowed)return;e.respondWith((async()=>{const cache=await caches.open(CACHE);const range=e.request.headers.get('range');if(range){const full=await cache.match(e.request.url,{ignoreSearch:true});if(full?.status===200)return cachedRange(full,range);return fetch(e.request)}try{const r=await fetch(e.request);if(r.ok&&r.status===200)await cache.put(e.request,r.clone());return r}catch{return await cache.match(e.request,{ignoreSearch:true})||Response.error()}})())});
