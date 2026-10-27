const CACHE='sysmacom-harmony-pages-v45';
// Only the public application shell is cached. Account metadata and audio remain
// encrypted in IndexedDB; external requests, API responses and signed URLs are excluded.
const FILES=["./","./admin-notifications.js","./app-navigation.js","./app.html","./app.js","./audio-conversion.js","./audio-levels.js","./audio-pool.js","./audio-preview.js","./audio-validation.js","./auth.js","./backend.js","./config.js","./credits.html","./credits.js","./error-monitor.js","./event-fader.js","./event-wake-lock.js","./index.html","./landing.js","./library-batch.js","./local.html","./local.js","./login.html","./manifest.webmanifest","./offline-audio.js","./offline-playlists.js","./playback-controls.js","./playlist-batch.js","./playlist-colors.js","./playlist-transfer.js","./pwa-entry.js","./pwa-install.css","./pwa-install.js","./resumable-upload.js","./samples.js","./security-utils.js","./style.css","./theme.js","./themes.css","./track-sort.js","./upload-error.js","./upload-log.js","./upload-transfer.js","./wma-worker.js","./harmony-icon-192.png","./harmony-icon-512.png"];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);try{await cache.addAll(FILES.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})));await self.skipWaiting()}catch(error){await caches.delete(CACHE);throw error}})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('sounddeck-')||key.startsWith('soundbar-')||key.startsWith('sysmacom-harmony-'))&&key!==CACHE)await caches.delete(key);await self.clients.claim()})())});
self.addEventListener('message',event=>{if(event.data?.type==='HARMONY_OFFLINE_READY')event.waitUntil((async()=>{const cache=await caches.open(CACHE);const present=await Promise.all(FILES.map(path=>cache.match(new URL(path,self.registration.scope))));event.ports[0]?.postMessage({ready:present.every(Boolean),version:45})})())});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),base=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==base.origin||event.request.headers.has('range'))return;
 const file=FILES.find(path=>new URL(path,base).pathname===url.pathname);if(!file)return;
 const key=new URL(file,base).href;
 event.respondWith((async()=>{const cache=await caches.open(CACHE),saved=await cache.match(key);
 // Shell assets belong to this worker version. Keep module graphs consistent
 // during deployment and never wait for an unavailable network to open a PWA.
 if(saved)return saved;
 try{const response=await fetch(event.request);if(response.ok&&response.status===200)await cache.put(key,response.clone());return response}catch{return Response.error()}
 })());
});

self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{}}catch{}
 const test=payload.type==='harmony-push-test';
 const tag=/^[0-9a-f-]{36}$/i.test(payload.id||'')?'harmony-'+payload.id:'harmony-new-account';
 event.waitUntil(self.registration.showNotification('Sysmacom Harmony',{
  body:test?'Suas notificações estão funcionando.':'Novo cadastro aguardando aprovação.',
  icon:'./harmony-icon-192.png',badge:'./harmony-icon-192.png',tag,renotify:false,
  data:{url:new URL('./app.html#admin',self.registration.scope).href}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const destination=new URL('./app.html#admin',self.registration.scope);
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   const current=new URL(client.url);
   if(current.origin!==destination.origin||!current.pathname.startsWith(new URL(self.registration.scope).pathname))continue;
   if(current.pathname===destination.pathname){client.postMessage({type:'HARMONY_OPEN_ADMIN'});await client.focus();return}
  }
  await self.clients.openWindow(destination.href);
 })());
});
