import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.argv[2]),root=new URL('../',import.meta.url),browser=await chromium.launch({headless:true});
const backend=`const backend={client:{auth:{onAuthStateChange(){},signOut:async()=>{}},rpc:async(_,{action,data={}})=>{window.pushCalls.push(action);if(action==='config')return{data:{publicKey:'B'+'A'.repeat(86),enabled:window.subscribed&&!!data.endpoint}};if(action==='subscribe')window.subscribed=true;if(action==='unsubscribe')window.subscribed=false;if(action==='test')window.testCalls++;return{data:{}}}},call:async path=>{if(path==='/me')return{profile:{id:'admin',display_name:'Diego',accent:'#78b5ff',email:'admin@example.test'},workspace:{name:'Harmony'},access:{status:'approved',is_admin:window.adminFixture}};if(path==='/access')return{status:'approved',is_admin:window.adminFixture};if(path==='/samples'||path==='/admin/accounts')return[];if(path==='/overview')return{playlists:[],tracks:0,bytes:0,limit:209715200};throw Error('Unexpected fixture route '+path)}};export async function getBackend(){return backend}`;
async function page({admin=true,permission='default'}={}){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});context.setDefaultTimeout(10000);
 await context.addInitScript(({admin,permission})=>{
  window.adminFixture=admin;window.pushCalls=[];window.permissionCalls=0;window.testCalls=0;window.subscribed=false;
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',toJSON:()=>({keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}}),unsubscribe:async()=>{window.browserSubscribed=false;return true}};
  const reg={pushManager:{getSubscription:async()=>window.browserSubscribed?sub:null,subscribe:async()=>{window.browserSubscribed=true;return sub}}};
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async()=>reg,getRegistration:async()=>reg,ready:Promise.resolve(reg),addEventListener(){},controller:{scriptURL:'https://harmony-notify.test/sw.js'}}});
  Object.defineProperty(window,'Notification',{configurable:true,value:{permission,requestPermission:()=>{window.permissionCalls++;window.Notification.permission='granted';return Promise.resolve('granted')}}});
  window.PushManager=function(){};
 },{admin,permission});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.hostname!=='harmony-notify.test')return route.fulfill({status:204,body:''});
  if(u.pathname==='/backend.js')return route.fulfill({contentType:'text/javascript',body:backend});
  try{const file=new URL('.'+u.pathname,root);if(!fileURLToPath(file).startsWith(fileURLToPath(root)))throw Error('path');return route.fulfill({contentType:u.pathname.endsWith('.html')?'text/html; charset=utf-8':u.pathname.endsWith('.js')?'text/javascript; charset=utf-8':u.pathname.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream',body:readFileSync(file)})}catch{return route.fulfill({status:404,body:''})}
 });
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://harmony-notify.test/app.html#'+(admin?'admin':'dashboard'));return{p,errors};
}
try{
 const {p,errors}=await page();await p.locator('[data-notification-action="enable"]:enabled').waitFor();assert.equal(await p.evaluate(()=>window.permissionCalls),0);
 await p.locator('[data-notification-action="enable"]').click();await p.locator('[data-notification-action="disable"]:enabled').waitFor();assert.equal(await p.evaluate(()=>window.permissionCalls),1);assert.equal(await p.evaluate(()=>window.subscribed),true);
 await p.locator('[data-notification-action="test"]').click();await p.waitForFunction(()=>window.testCalls===1);await p.locator('[data-notification-action="disable"]:enabled').waitFor();
 await p.locator('[data-notification-action="disable"]').click();await p.locator('[data-notification-action="enable"]:enabled').waitFor();assert.equal(await p.evaluate(()=>window.browserSubscribed),false);assert.equal(await p.evaluate(()=>window.subscribed),false);
 assert.doesNotMatch(await p.locator('#admin-notifications').innerText(),/servidor|credenciais|VAPID|service_role|endpoint|fase de testes/i);assert.deepEqual(errors,[]);
 const blocked=await page({permission:'denied'});await blocked.p.locator('#admin-notifications').waitFor();assert.equal(await blocked.p.locator('[data-notification-action="enable"]').isDisabled(),true);assert.equal(await blocked.p.evaluate(()=>window.permissionCalls),0);assert.deepEqual(blocked.errors,[]);
 const member=await page({admin:false});await member.p.locator('h1').filter({hasText:'Olá, Diego.'}).waitFor();assert.equal(await member.p.locator('#admin-notifications').count(),0);assert.equal(await member.p.evaluate(()=>window.permissionCalls),0);assert.deepEqual(member.errors,[]);
 console.log('Real app in mobile browser: admin-only controls, explicit permission gesture, enable/test/disable, blocked permissions, member dashboard and short product copy passed. No external notification sent.');
}finally{await browser.close()}
