import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.argv[2]);
const root=new URL('../',import.meta.url),csp=readFileSync(new URL('app.html',root),'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
const boot=`import {attachTrackSort} from './track-sort.js';
window.ids=['a','b','c','d','e','f','g','h'];window.commits=[];window.plays=0;window.deletes=0;
const view=document.querySelector('#view');
function render(){view.innerHTML='<div class="pads">'+window.ids.map(id=>'<article class="pad" data-track-id="'+id+'" style="--pad:#78b5ff"><button type="button" class="pad-trigger" data-play><strong>Faixa '+id.toUpperCase()+'</strong><small>Harmony</small></button><div class="pad-actions"><button type="button" class="pad-drag" aria-label="Reordenar '+id+'">⠿</button><button class="pad-delete" type="button" data-delete>Excluir</button><button class="pad-edit" type="button">✎</button></div></article>').join('')+'</div>'}
view.addEventListener('click',e=>{if(e.target.closest('[data-play]'))window.plays++;if(e.target.closest('[data-delete]'))window.deletes++});
render();attachTrackSort(view,{getIds:()=>window.ids,onCommit:ids=>{window.ids=ids;window.commits.push(ids);render()}});window.ready=true;`;
const fixture=`<!doctype html><html lang="pt-BR" data-theme="dark"><head><meta charset="utf-8">${csp}<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="themes.css"></head><body><main style="padding:20px"><h1>Sua playlist</h1><div id="view"></div></main><script type="module" src="drag-fixture.js"></script></body></html>`;
const browser=await chromium.launch({headless:true});
const errors=[];
async function page(touch=false){
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:touch,hasTouch:touch,serviceWorkers:'block',...(touch?{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'}:{})});
 ctx.setDefaultTimeout(10000);
 await ctx.route('**/*',async route=>{const path=new URL(route.request().url()).pathname;
  if(path==='/drag-check.html')return route.fulfill({contentType:'text/html',body:fixture});
  if(path==='/drag-fixture.js')return route.fulfill({contentType:'text/javascript',body:boot});
  try{const file=new URL('.'+path,root);if(!fileURLToPath(file).startsWith(fileURLToPath(root)))throw Error('path');return route.fulfill({contentType:path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'image/png',body:readFileSync(file)})}catch{return route.fulfill({status:404,body:''})}
 });
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/Content Security Policy|Refused to/.test(m.text()))errors.push(m.text())});
 await p.goto('https://harmony-drag.test/drag-check.html');await p.waitForFunction(()=>window.ready);return p;
}
async function points(p,from='a',to='d',gap=true){
 const box=await p.locator(`[data-track-id="${from}"]`).boundingBox(),handle=await p.locator(`[data-track-id="${from}"] .pad-drag`).boundingBox(),target=await p.locator(`[data-track-id="${to}"]`).boundingBox();
 const start={x:handle.x+handle.width/2,y:handle.y+handle.height/2};
 const center={x:gap?target.x-2:target.x+target.width/2,y:target.y+target.height/2};
 return{start,end:{x:start.x+center.x-box.x-box.width/2,y:start.y+center.y-box.y-box.height/2}};
}
const readyForDrag=p=>p.waitForFunction(()=>!!document.querySelector('.drag-ghost'));
try{
 const p=await page();let {start,end}=await points(p);
 // Quick taps/swipes must neither activate nor leave a timer that activates later.
 await p.mouse.move(start.x,start.y);await p.mouse.down();await p.waitForTimeout(100);
 assert.equal(await p.locator('.drag-ghost').count(),0);
 const waiting=await p.locator('[data-track-id="a"] .pad-drag').evaluate(e=>({animation:getComputedStyle(e).animationName,pseudo:getComputedStyle(e,'::after').content}));
 assert.equal(waiting.animation,'none');assert.equal(waiting.pseudo,'none');
 await p.mouse.up();await p.waitForTimeout(550);assert.equal(await p.locator('.drag-ghost').count(),0);
 await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:2});await p.mouse.up();await p.waitForTimeout(550);
 assert.equal(await p.locator('.drag-ghost').count(),0);assert.equal(await p.evaluate(()=>window.commits.length),0);
 await p.mouse.move(start.x,start.y);await p.mouse.down();await readyForDrag(p);await p.mouse.move(end.x,end.y,{steps:12});
 assert.equal(await p.locator('.drag-ghost').count(),1);assert.equal(await p.locator('.sorting').count(),1);
 const ghost=await p.locator('.drag-ghost').evaluate(e=>({opacity:Number(getComputedStyle(e).opacity),pointer:getComputedStyle(e).pointerEvents,hidden:e.getAttribute('aria-hidden'),inert:e.inert,transform:e.style.transform}));
 assert.ok(ghost.opacity>0&&ghost.opacity<1);assert.equal(ghost.pointer,'none');assert.equal(ghost.hidden,'true');assert.equal(ghost.inert,true);assert.match(ghost.transform,/translate3d/);
 assert.equal(await p.evaluate(()=>window.commits.length),0);
 assert.deepEqual(await p.locator('#view [data-track-id]').evaluateAll(cards=>cards.slice().sort((a,b)=>Number(a.style.order)-Number(b.style.order)).map(c=>c.dataset.trackId)),['b','c','d','a','e','f','g','h']);
 await p.mouse.up();assert.deepEqual(await p.evaluate(()=>window.ids),['b','c','d','a','e','f','g','h']);assert.equal(await p.locator('.drag-ghost').count(),0);
 await p.locator('[data-track-id="b"] [data-play]').click();await p.locator('[data-track-id="b"] [data-delete]').click();assert.equal(await p.evaluate(()=>window.plays),1);assert.equal(await p.evaluate(()=>window.deletes),1);
 // Escape must work even when pointerdown did not focus the drag handle.
 ({start,end}=await points(p,'b','d',false));await p.mouse.move(start.x,start.y);await p.mouse.down();await readyForDrag(p);await p.mouse.move(end.x,end.y,{steps:6});await p.keyboard.press('Escape');await p.mouse.up();
 assert.equal(await p.locator('.drag-ghost').count(),0);assert.equal(await p.evaluate(()=>window.commits.length),1);assert.deepEqual(await p.evaluate(()=>window.ids),['b','c','d','a','e','f','g','h']);
 await p.evaluate(()=>document.documentElement.dataset.theme='light');await p.emulateMedia({reducedMotion:'reduce'});
 ({start,end}=await points(p,'b','a',false));await p.mouse.move(start.x,start.y);await p.mouse.down();await readyForDrag(p);await p.mouse.move(end.x,end.y,{steps:6});assert.equal(await p.locator('.drag-ghost').count(),1);await p.mouse.up();assert.equal(await p.evaluate(()=>window.commits.length),2);
 console.log('Mouse: silent long-press, quick tap/swipe rejection, translucent ghost, live gap preview, one commit, Escape, light theme, reduced motion and unchanged play/delete controls passed.');
 const touch=await page(true),cdp=await touch.context().newCDPSession(touch);({start,end}=await points(touch));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y,id:4}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:4}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.waitForTimeout(550);
 assert.equal(await touch.locator('.drag-ghost').count(),0);assert.equal(await touch.evaluate(()=>window.commits.length),0);assert.equal(await touch.evaluate(()=>window.plays+window.deletes),0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y,id:1}]});
 await touch.waitForTimeout(150);assert.equal(await touch.locator('.drag-ghost').count(),0);await readyForDrag(touch);
 for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12,id:1}]});
 assert.equal(await touch.locator('.drag-ghost').count(),1);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.deepEqual(await touch.evaluate(()=>window.ids),['b','c','d','a','e','f','g','h']);assert.equal(await touch.evaluate(()=>window.commits.length),1);assert.equal(await touch.evaluate(()=>window.plays+window.deletes),0);
 ({start,end}=await points(touch,'b','d',false));await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:2}]});await readyForDrag(touch);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await touch.locator('.drag-ghost').count(),0);assert.equal(await touch.evaluate(()=>window.commits.length),1);
 // A held drag near the viewport edge must keep scrolling without more touchmove events.
 ({start}=await points(touch,'b','d',false));await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:3}]});await readyForDrag(touch);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x,y:830,id:3}]});await touch.waitForFunction(()=>window.scrollY>20);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await touch.locator('.drag-ghost').count(),0);
 assert.deepEqual(errors,[]);console.log('Android touch input: quick-swipe rejection, continuous hold activation, capture across grid reorder, gap drop, cancellation, no accidental playback/deletion, and edge autoscroll passed under app CSP.');
}finally{await browser.close()}
