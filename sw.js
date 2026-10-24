const CACHE='soundbar-v3';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('sounddeck-')||key.startsWith('soundbar-'))&&key!==CACHE)await caches.delete(key);await self.clients.claim()})())});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith((async()=>{try{const response=await fetch(e.request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(e.request,response.clone())}return response}catch(error){const cached=await caches.match(e.request);if(cached)return cached;throw error}})())});
