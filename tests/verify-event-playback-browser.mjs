import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.argv[2]),root=new URL('../',import.meta.url),browser=await chromium.launch({headless:true});
const list={id:'event',name:'Evento',color:'#78b5ff',description:'',play_mode:'mix',loop:true,retrigger:'stop',switch_mode:'continue',event_fade_enabled:false};
const tracks=['a','b'].map((id,i)=>({id,name:'Faixa '+id.toUpperCase(),playlist_id:'event',audio_path:'member/'+id+'.wav',filename:id+'.wav',color:'#78b5ff',position:i}));
const backend=`const list=${JSON.stringify(list)},tracks=${JSON.stringify(tracks)};const backend={client:{auth:{onAuthStateChange(){},signOut:async()=>{}}},call:async path=>{if(path==='/me')return{profile:{id:'member',display_name:'Diego',accent:'#78b5ff'},workspace:{name:'Harmony'},access:{status:'approved',is_admin:false}};if(path==='/access')return{status:'approved',is_admin:false};if(path==='/samples')return[];if(path==='/overview')return{playlists:[list],tracks:2,bytes:100,limit:209715200};if(path==='/playlists/event')return{playlist:list,tracks};throw Error('Unexpected route '+path)},prepareAudio:async rows=>rows.map(t=>({id:t.id,url:'https://harmony-event.test/tone.wav',size:882044})),audioURL:async()=> 'https://harmony-event.test/tone.wav'};export async function getBackend(){return backend}`;
function wav(){const rate=22050,samples=rate*20,buffer=Buffer.alloc(44+samples*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);for(let n=0;n<samples;n++)buffer.writeInt16LE(Math.round(1000*Math.sin(2*Math.PI*440*n/rate)),44+n*2);return buffer}
try{
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'});context.setDefaultTimeout(10000);
 await context.addInitScript(()=>{window.testAudios=[];const NativeAudio=window.Audio;window.Audio=function(...args){const audio=new NativeAudio(...args);window.testAudios.push(audio);return audio};Element.prototype.requestFullscreen=()=>Promise.reject(Error('fullscreen unavailable'));});
 const tone=wav(),serveFixture=async route=>{const url=new URL(route.request().url());if(url.hostname!=='harmony-event.test')return route.fulfill({status:204,body:''});if(url.pathname==='/backend.js')return route.fulfill({contentType:'text/javascript; charset=utf-8',body:backend});if(url.pathname==='/tone.wav')return route.fulfill({contentType:'audio/wav',body:tone});try{const file=new URL('.'+url.pathname,root);if(!fileURLToPath(file).startsWith(fileURLToPath(root)))throw Error('path');return route.fulfill({contentType:url.pathname.endsWith('.html')?'text/html; charset=utf-8':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream',body:readFileSync(file)})}catch{return route.fulfill({status:404,body:''})}};await context.route('**/*',serveFixture);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://harmony-event.test/app.html#studio/event');await page.locator('[data-action="play"]').last().waitFor();
 assert.equal(await page.locator('.transport').isVisible(),false);
 // Drawer uses the full viewport, including the old 801–900 px gap and wide touch screens.
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:932,height:430},{width:1024,height:768},{width:1280,height:800}]){
  await page.setViewportSize(viewport);await page.locator('#menu-toggle').waitFor({state:'visible'});
  const mainBefore=await page.locator('.app-main').boundingBox();assert.equal(mainBefore.x,0);assert.equal(mainBefore.width,viewport.width);
  assert.equal(await page.locator('#app-sidebar').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#menu-toggle').tap();await page.locator('#menu-close').waitFor({state:'visible'});
  assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'true');
  const mainAfter=await page.locator('.app-main').boundingBox();assert.equal(mainAfter.width,mainBefore.width);
  await page.locator('#menu-backdrop').tap({position:{x:viewport.width-8,y:100}});await page.locator('#app-sidebar').waitFor({state:'hidden'});
  assert.equal(await page.locator('.app-main').evaluate(e=>e.inert),false);
 }
 await page.setViewportSize({width:844,height:390});
 await page.locator('#menu-toggle').tap();await page.locator('#app-sidebar [data-nav="playlists"]').tap();
 await page.waitForURL('**/app.html#playlists');await page.locator('#app-sidebar').waitFor({state:'hidden'});
 await page.goto('https://harmony-event.test/app.html#studio/event');await page.locator('[data-action="play"]').last().waitFor();
 await page.locator('[data-action="playlist-settings"]').click();assert.match(await page.locator('#setting-retrigger option[value="stop"]').innerText(),/Pausar e continuar/);await page.locator('#modal-cancel').click();
 const tap=id=>page.locator(`[data-action="play"][data-id="${id}"]`).click();await tap('a');await page.waitForFunction(()=>window.testAudios.some(a=>!a.paused&&a.currentTime>.25));await page.evaluate(()=>window.cardAudio=window.testAudios.find(a=>!a.paused));
 await tap('a');await page.waitForFunction(()=>window.cardAudio.paused);const cardPaused=await page.evaluate(()=>({time:window.cardAudio.currentTime,src:window.cardAudio.src}));assert.ok(cardPaused.time>.2);await page.waitForTimeout(150);assert.ok(Math.abs(await page.evaluate(()=>window.cardAudio.currentTime)-cardPaused.time)<.05);
 await tap('a');await page.waitForFunction(()=>!window.cardAudio.paused);assert.ok(await page.evaluate(time=>window.cardAudio.currentTime>=time,cardPaused.time));assert.equal(await page.evaluate(()=>window.cardAudio.src),cardPaused.src);
 await tap('a');await tap('b');await page.waitForFunction(()=>window.testAudios.filter(a=>!a.paused).length===1&&document.querySelector('#now-playing').textContent==='Faixa B');assert.equal(await page.evaluate(()=>window.cardAudio.currentTime),0);
 await tap('a');await page.waitForFunction(()=>window.testAudios.filter(a=>!a.paused).length===2);assert.ok(await page.evaluate(()=>window.cardAudio.currentTime<1));await page.locator('#stop-all').click();
 await page.evaluate(()=>{const audio=window.cardAudio,play=audio.play.bind(audio);let first=true;window.restorePlay=()=>audio.play=play;audio.play=()=>{const started=play();if(!first)return started;first=false;started.catch(()=>{});return new Promise((_,reject)=>window.rejectOldPlay=()=>reject(new DOMException('cancelled','AbortError')))}});
 await tap('a');await page.waitForFunction(()=>!window.cardAudio.paused&&window.cardAudio.currentTime>.1);await tap('a');await tap('a');await page.waitForFunction(()=>!window.cardAudio.paused);await page.evaluate(()=>window.rejectOldPlay());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.cardAudio.paused),false);await page.evaluate(()=>window.restorePlay());await page.locator('#stop-all').click();
 await page.locator('[data-action="event-mode"]').click();await page.waitForFunction(()=>document.body.classList.contains('event-mode'));assert.equal(await page.locator('.transport').isVisible(),true);assert.equal(await page.locator('#pause-all').isDisabled(),true);assert.equal(await page.locator('.event-exit').isVisible(),true);
 await page.locator('[data-action="play"][data-id="a"]').click();await page.waitForFunction(()=>window.testAudios.filter(a=>!a.paused).length===1);await page.locator('[data-action="play"][data-id="b"]').click();await page.waitForFunction(()=>window.testAudios.filter(a=>!a.paused).length===2);
 await page.waitForFunction(()=>document.querySelector('#play-count').textContent==='2 faixas tocando');assert.match(await page.locator('#now-playing').innerText(),/Faixa A.*Faixa B/);
 // Use actual touch input and quick controls while both real audio elements play.
 const fader=await page.locator('#master-volume').boundingBox();assert.ok(fader.width>=440&&fader.height>=56);
 const increment=page.locator('[data-volume-step="5"]'),decrement=page.locator('[data-volume-step="-5"]');
 assert.ok((await increment.boundingBox()).width>=48);assert.ok((await decrement.boundingBox()).height>=48);
 await increment.tap();assert.equal(await page.locator('#master-volume').inputValue(),'85');assert.ok(await page.evaluate(()=>window.testAudios.filter(a=>!a.paused).every(a=>a.volume===.85)));
 await decrement.tap();assert.equal(await page.locator('#master-volume').inputValue(),'80');
 await page.touchscreen.tap(fader.x+fader.width*.25,fader.y+fader.height/2);
 const touched=Number(await page.locator('#master-volume').inputValue());assert.ok(touched>=20&&touched<=30);assert.equal(await page.locator('#volume-text').innerText(),touched+'%');
 assert.ok(await page.evaluate(v=>window.testAudios.filter(a=>!a.paused).every(a=>Math.abs(a.volume-v/100)<.001),touched));
 await page.locator('#master-volume').evaluate(e=>{e.value='35';e.dispatchEvent(new Event('input',{bubbles:true}))});assert.ok(await page.evaluate(()=>window.testAudios.filter(a=>!a.paused).every(a=>a.volume===.35)));
 await page.waitForFunction(()=>window.testAudios.filter(a=>!a.paused).every(a=>a.currentTime>.25));await page.evaluate(()=>window.selectedAudios=window.testAudios.filter(a=>!a.paused));await page.locator('#pause-all').click();await page.waitForFunction(()=>window.selectedAudios.every(a=>a.paused));
 const paused=await page.evaluate(()=>window.selectedAudios.map(a=>({time:a.currentTime,src:a.src})));await page.waitForTimeout(150);assert.ok(await page.evaluate(times=>window.selectedAudios.every((a,i)=>Math.abs(a.currentTime-times[i].time)<.05),paused));assert.equal(await page.locator('.transport').isVisible(),true);assert.match(await page.locator('#pause-all').innerText(),/Continuar/);assert.match(await page.locator('#play-count').innerText(),/2 faixas pausadas/);
 await page.locator('#master-volume').evaluate(e=>{e.value='22';e.dispatchEvent(new Event('input',{bubbles:true}))});await page.locator('#pause-all').click();await page.waitForFunction(()=>window.selectedAudios.every(a=>!a.paused));assert.ok(await page.evaluate(times=>window.selectedAudios.every((a,i)=>a.currentTime>=times[i].time&&a.src===times[i].src&&a.volume===.22),paused));
 await page.locator('#pause-all').click();await page.waitForFunction(()=>window.selectedAudios.every(a=>a.paused));await page.locator('.event-exit').click();assert.equal(await page.locator('.transport').isVisible(),false);await page.locator('[data-action="play"][data-id="a"]').click();await page.waitForFunction(()=>window.selectedAudios[0].paused===false);await page.locator('.transport').waitFor({state:'visible'});assert.equal(await page.locator('.transport').isVisible(),true);assert.equal(await page.locator('#pause-all').isVisible(),false);
 await page.locator('[data-action="event-mode"]').click();await page.locator('#stop-all').click();await page.waitForFunction(()=>window.selectedAudios.every(a=>a.paused));assert.equal(await page.locator('.transport').isVisible(),true);assert.equal(await page.locator('#pause-all').isDisabled(),true);assert.equal(await page.locator('#master-volume').inputValue(),'22');
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>Number.parseFloat(getComputedStyle(document.querySelector('.app-main')).paddingBottom)>document.querySelector('.transport').getBoundingClientRect().height+20);
 const controls=await page.locator('.transport').boundingBox();assert.ok(controls.x>=0&&controls.x+controls.width<=390&&controls.y+controls.height<=844);
 const pauseBox=await page.locator('#pause-all').boundingBox(),stopBox=await page.locator('#stop-all').boundingBox(),exitBox=await page.locator('.event-exit').boundingBox();assert.ok(pauseBox.x+pauseBox.width<=stopBox.x&&stopBox.x+stopBox.width<=exitBox.x);
 await page.evaluate(()=>document.documentElement.dataset.theme='light');assert.equal(await page.locator('.transport').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');assert.deepEqual(errors,[]);
 // Both themes keep a usable fader and all event controls inside narrow and landscape screens.
 for(const theme of ['light','dark'])for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:932,height:430}]){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize(viewport);
  const bar=await page.locator('.transport').boundingBox(),slider=await page.locator('#master-volume').boundingBox();
  assert.ok(bar.x>=0&&bar.x+bar.width<=viewport.width&&bar.y+bar.height<=viewport.height);
  assert.ok(slider.width>=(viewport.width<620?140:440)&&slider.height>=56);
  for(const selector of ['#pause-all','#stop-all','.event-exit','[data-volume-step="-5"]','[data-volume-step="5"]']){
   const box=await page.locator(selector).boundingBox();assert.ok(box.x>=bar.x&&box.x+box.width<=bar.x+bar.width+1&&box.height>=48);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 // A keyboard desktop keeps its sidebar and releases modal focus when resized back.
 const desktop=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});await desktop.route('**/*',serveFixture);
 const desktopPage=await desktop.newPage();await desktopPage.goto('https://harmony-event.test/app.html#studio/event');await desktopPage.locator('[data-action="play"]').last().waitFor();
 assert.equal(await desktopPage.locator('#app-sidebar').isVisible(),true);assert.equal(await desktopPage.locator('#menu-toggle').isVisible(),false);
 await desktopPage.setViewportSize({width:850,height:800});await desktopPage.locator('#menu-toggle').click();
 await desktopPage.setViewportSize({width:1366,height:900});await desktopPage.waitForFunction(()=>!document.querySelector('.app-main').inert);
 assert.equal(await desktopPage.locator('#menu-backdrop').isVisible(),false);assert.equal(await desktopPage.locator('#app-sidebar').isVisible(),true);await desktop.close();
 assert.deepEqual(errors,[]);
 console.log('Touch volume, full-width drawer at 390/844/932/1024/1280 px, desktop resize, light/dark event layout, actual HTMLAudioElement playback: card pause/resume retains position/source, another selection resets the paused card, native mix is preserved, event panel, simultaneous tracks, pause/continue without reset, shared volume, exit/resume, stop-all, fullscreen fallback and portrait/light layout passed under app CSP.');
}finally{await browser.close()}
