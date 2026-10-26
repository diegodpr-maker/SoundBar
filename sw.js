const CACHE='sysmacom-harmony-pages-v43';
const FILES=['./','./index.html','./local.html','./local.js','./security-utils.js','./audio-conversion.js','./audio-validation.js','./wma-worker.js','./style.css','./themes.css','./theme.js','./pwa-entry.js','./pwa-install.js','./pwa-install.css','./landing.js','./samples.js','./audio-preview.js','./audio-pool.js','./harmony-icon-192.png','./harmony-icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('sounddeck-')||key.startsWith('soundbar-')||key.startsWith('sysmacom-harmony-'))&&key!==CACHE)await caches.delete(key);await self.clients.claim()})())});
self.addEventListener('fetch',e=>{const url=new URL(e.request.url),base=new URL(self.registration.scope);if(e.request.method!=='GET'||url.origin!==base.origin||e.request.headers.has('range'))return;const allowed=FILES.some(p=>new URL(p,base).pathname===url.pathname);if(!allowed)return;e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const r=await fetch(e.request);if(r.ok&&r.status===200)await cache.put(e.request,r.clone());return r}catch{return await cache.match(e.request,{ignoreSearch:true})||Response.error()}})())});

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
