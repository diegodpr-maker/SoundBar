import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.argv[2]),sdk=readFileSync(process.argv[3]),tus=readFileSync(process.argv[4]),root=new URL('../',import.meta.url),tone=Buffer.from(readFileSync(new URL('tests/fixtures/access-tone.mp3.base64',root),'utf8'),'base64');
const host='fcmsojjtkiehsobbkjnr.supabase.co',admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',member='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',playlist='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const browser=await chromium.launch({headless:true});let catalog=[],stored=new Map(),requests=[],stall=false;
const session=(id=admin,expired=false)=>({access_token:'fixture-'+id,refresh_token:'refresh-fixture',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+(expired?-100:3600),user:{id,email:'fixture@example.test',aud:'authenticated',role:'authenticated',user_metadata:{display_name:'Audit',is_admin:true},app_metadata:{}}});
async function fixture({id=admin,expired=false,empty=false}={}){
 const ctx=await browser.newContext({viewport:{width:390,height:560},isMobile:true,hasTouch:true,serviceWorkers:'block'});ctx.setDefaultTimeout(15000);
 await ctx.addInitScript(({session,empty})=>{if(!empty&&!localStorage.getItem('fixture-set')){localStorage.setItem('soundbar-supabase-session',JSON.stringify(session));localStorage.setItem('fixture-set','1')}const timeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>timeout(fn,[12000,15000].includes(ms)?500:ms,...args);if(!location.pathname.endsWith('/holder.html'))window.blockedLock=navigator.locks.request('lock:soundbar-supabase-session',()=>new Promise(()=>{}));},{session:session(id,expired),empty});
 await ctx.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(u.hostname==='harmony-access.test'){
   if(u.pathname==='/sdk.js')return route.fulfill({contentType:'text/javascript',body:sdk});if(u.pathname==='/tus.js')return route.fulfill({contentType:'text/javascript',body:tus});
   try{const file=new URL('.'+u.pathname,root);if(!fileURLToPath(file).startsWith(fileURLToPath(root)))throw Error('path');let body=readFileSync(file);if(u.pathname.endsWith('.html'))body=Buffer.from(body.toString().replace('<script src="error-monitor.js','<script src="sdk.js"></script><script src="tus.js"></script><script src="error-monitor.js'));return route.fulfill({contentType:u.pathname.endsWith('.html')?'text/html; charset=utf-8':u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'application/octet-stream',body})}catch{return respond({},404)}
  }
  if(u.hostname==='esm.sh'){return route.fulfill({contentType:'text/javascript',body:u.pathname.includes('tus-js-client')?'export const Upload=window.tus.Upload;':'export const createClient=window.supabase.createClient;'})}
  if(u.hostname===host||u.hostname===host.replace('.supabase.co','.storage.supabase.co')){
   const token=request.headers().authorization,owner=token==='Bearer fixture-'+member?member:token==='Bearer fixture-'+admin?admin:null;requests.push({path:u.pathname,method:request.method(),owner});
   if(u.pathname==='/auth/v1/user')return owner?respond(session(owner).user):respond({message:'Unauthorized'},401);
   if(u.pathname==='/auth/v1/token')return respond(session(id));
   if(u.pathname==='/functions/v1/soundbar-register')return respond({ok:true});
   if(u.pathname==='/functions/v1/soundbar-errors')return respond({ok:true});
   if(u.pathname==='/rest/v1/rpc/sb_account_state'){if(stall){await new Promise(r=>setTimeout(r,2000));try{return await respond({})}catch{return}}return owner?respond({user_id:owner,status:'approved',is_admin:owner===admin,limits:{file:31457280,storage:1073741824}}):respond({message:'Denied'},401)}
   if(u.pathname==='/rest/v1/rpc/sb_admin_accounts')return owner===admin?respond([{user_id:member,email:'fixture@example.test',display_name:'Membro',status:'approved',requested_at:new Date().toISOString(),is_admin:false,can_delete:true,limits:{file:31457280,storage:1073741824},storage_bytes:0}]):respond({message:'Denied'},403);
   if(u.pathname==='/rest/v1/rpc/sb_browse_playlists')return respond([]);
   if(u.pathname==='/rest/v1/rpc/sb_admin_notifications')return respond([]);
   if(u.pathname==='/rest/v1/rpc/sb_webpush_server')return respond({});
   if(u.pathname==='/rest/v1/sb_profiles'){const row={id:owner,display_name:'Audit',workspace_name:'Harmony',accent:'#1758c7',bio:''};return respond(request.headers().accept?.includes('object')?row:[row])}
   if(u.pathname==='/rest/v1/sb_playlists'){const rows=[{id:playlist,user_id:owner,name:'Playlist',color:'#1758c7',play_mode:'single',retrigger:'stop',switch_mode:'stop',sb_tracks:[{count:0}]}];return respond(request.headers().accept?.includes('object')?rows[0]:rows)}
   if(u.pathname==='/rest/v1/sb_tracks'||u.pathname==='/rest/v1/sb_library_submissions')return respond([]);
   if(u.pathname==='/rest/v1/sb_library_tracks'){
    if(request.method()==='POST'){if(owner!==admin)return respond({message:'Denied'},403);const row=JSON.parse(request.postData());catalog.push({...row,author:'Fixture',license:'Original',credit:'Generated tone'});return respond(request.headers().accept?.includes('object')?catalog.at(-1):[catalog.at(-1)])}
    const filter=u.searchParams.get('id');return respond(catalog.filter(r=>!filter||r.id===filter.replace('eq.','')))
   }
   if(u.pathname.startsWith('/storage/v1/upload/resumable'))return respond({message:'Fixture TUS unavailable'},405);
   if(u.pathname.startsWith('/storage/v1/object/list/'))return respond([]);
   if(u.pathname.startsWith('/storage/v1/object/soundbar-library/')){const path=u.pathname.split('/soundbar-library/')[1];if(request.method()==='POST'){assert.equal(owner,admin);const bytes=request.postDataBuffer();assert.deepEqual(bytes,tone);stored.set(path,bytes);return respond({Key:'soundbar-library/'+path,Id:admin})}if(request.method()==='GET')return stored.has(path)?route.fulfill({contentType:'audio/mpeg',body:stored.get(path)}):respond({message:'Object not found'},404)}
   return respond({message:'Unknown fixture endpoint '+u.pathname},404)
  }
  return route.fulfill({status:204,body:''});
 });
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));return{page,ctx,errors};
}
async function navigate(page,route,title){await page.evaluate(route=>location.hash=route,route);await page.waitForFunction(title=>document.querySelector('#view h1')?.textContent.includes(title),title);assert.equal(await page.locator('.error-panel').count(),0)}
try{
 const {page,ctx,errors}=await fixture();await page.goto('https://harmony-access.test/app.html#dashboard');await page.locator('.stat').first().waitFor();assert.ok(await page.evaluate(async()=>(await navigator.locks.query()).held.some(l=>l.name==='lock:soundbar-supabase-session')));
 for(const [route,title]of [['playlists','Suas playlists'],['downloads','Playlists baixadas'],['community','Playlists da comunidade'],['library','Encontre seu próximo som'],['contributions','Minhas contribuições'],['profile','Seu perfil'],['admin','Liberação de contas'],['admin-library','Gerenciar biblioteca']])await navigate(page,route,title);
 // Real MP3 -> real SDK Storage fallback -> byte verification -> real SDK catalog.
 await page.locator('#library-file').setInputFiles([{name:'audit.mp3',mimeType:'audio/mpeg',buffer:tone}]);await page.locator('#library-category').fill('Audit');await page.locator('#library-upload-form [type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#library-upload-status').textContent.includes('1 de 1 enviados'));assert.equal(catalog.length,1);assert.equal(stored.size,1);assert.equal(requests.filter(r=>r.method==='POST'&&r.path.startsWith('/storage/v1/object/soundbar-library/')).length,1);
 // Background/foreground uses the same locked Auth SDK; navigation still works.
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))});await navigate(page,'admin','Liberação de contas');
 for(const viewport of [{width:390,height:560},{width:844,height:390}]){await page.setViewportSize(viewport);await page.locator('#menu-toggle').click();const nav=page.locator('#app-sidebar nav');const size=await nav.evaluate(e=>({height:e.clientHeight,full:e.scrollHeight,smooth:getComputedStyle(e).scrollBehavior}));assert.ok(size.full>size.height);assert.equal(size.smooth,'smooth');await nav.evaluate(e=>e.scrollTo({top:e.scrollHeight,behavior:'smooth'}));await page.waitForFunction(()=>{const e=document.querySelector('#app-sidebar nav');return e.scrollTop>=e.scrollHeight-e.clientHeight-2});const footer=await page.locator('.side-bottom').boundingBox();assert.ok(footer.y+footer.height<=viewport.height+1);await page.locator('#menu-close').click();}
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#app-sidebar nav').evaluate(e=>getComputedStyle(e).scrollBehavior),'auto');
 // A genuine network request that stalls is aborted and leaves an actionable page.
 stall=true;await page.evaluate(()=>location.hash='playlists');await page.locator('.error-panel').waitFor();assert.match(await page.locator('.error-panel').innerText(),/Tempo esgotado/);stall=false;await page.locator('[data-action="retry"]').click();await page.waitForFunction(()=>document.querySelector('#view h1')?.textContent==='Suas playlists');
 const memberCase=await fixture({id:member});await memberCase.page.goto('https://harmony-access.test/app.html#admin');await memberCase.page.locator('.error-panel').waitFor();assert.match(await memberCase.page.locator('.error-panel').innerText(),/exclusivo/);assert.equal(await memberCase.page.locator('#admin-nav').isVisible(),false);
 // Expired sessions cannot use the stored token while the auth lock is stuck.
 const expired=await fixture({expired:true});await expired.page.goto('https://harmony-access.test/login.html');await expired.page.locator('#auth-content').waitFor();assert.match(await expired.page.locator('#auth-message').innerText(),/renovar/);
 // Public registration must remain usable without any persisted session.
 const signup=await fixture({empty:true});await signup.page.goto('https://harmony-access.test/login.html');await signup.page.locator('#auth-content').waitFor();const registered=await signup.page.evaluate(async()=>{const {getBackend}=await import('./backend.js?v=48');return(await getBackend()).register({email:'fixture@example.invalid',password:'fixture-password',display_name:'Fixture'})});assert.equal(registered.ok,true);await signup.page.locator('#email').fill('fixture@example.test');await signup.page.locator('#password').fill('fixture-password');await signup.page.locator('#auth-submit').click();await signup.page.waitForURL('**/app.html');await signup.page.locator('.stat').first().waitFor();await signup.page.locator('#menu-toggle').click();await signup.page.locator('[data-signout]').click();await signup.page.waitForURL('**/login.html');await signup.page.locator('#auth-content').waitFor();assert.equal(await signup.page.evaluate(()=>localStorage.getItem('soundbar-supabase-session')),null);
 assert.deepEqual(errors,[]);assert.deepEqual(memberCase.errors,[]);assert.deepEqual(expired.errors,[]);assert.deepEqual(signup.errors,[]);
 console.log('Actual pinned Supabase SDK with its browser session lock held: all nine pages, administrator permissions, real MP3 decode/upload/byte verification/catalog registration, background resume, network abort/retry, member denial, expired-session denial and anonymous registration passed. Mobile and landscape drawer scroll, footer visibility and reduced motion passed.');
 await ctx.close();
}finally{await browser.close()}
