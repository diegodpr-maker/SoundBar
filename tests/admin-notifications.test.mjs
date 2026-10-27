import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {createAdminNotifications} from '../admin-notifications.js';
function setup({permission='default',failSave=false,failRemove=false}={}){
 const calls=[];let sub=null,saved=false,removed=0;
 const make=()=>({endpoint:'https://fcm.googleapis.com/fcm/send/device',toJSON:()=>({keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}}),unsubscribe:async()=>{removed++;sub=null;return true}});
 const registration={pushManager:{getSubscription:async()=>sub,subscribe:async options=>{calls.push({subscribe:options});sub=make();return sub}}};
 const nav={serviceWorker:{register:async()=>{},ready:Promise.resolve(registration),getRegistration:async()=>registration}};
 const win={PushManager:function(){},Notification:{permission,requestPermission:()=>{calls.push('permission');win.Notification.permission='granted';return Promise.resolve('granted')}}};
 const api=createAdminNotifications({window:win,navigator:nav,getClient:async()=>{calls.push('client');return{rpc:async(name,{action,data})=>{calls.push({action,data});if(action==='config')return{data:{publicKey:'B'+'A'.repeat(86),enabled:saved&&data.endpoint===sub?.endpoint}};if(action==='subscribe'){if(failSave)return{error:{message:'save failed'}};saved=true}if(action==='unsubscribe'){if(failRemove)return{error:{message:'offline'}};saved=false}return{data:{}}}}}});
 return{api,calls,nav,win,get removed(){return removed}};
}
test('notification permission is requested only on enable and before network; subscription is stored',async()=>{
 const s=setup();assert.deepEqual(await s.api.status(),{status:'disabled'});assert.ok(!s.calls.includes('permission'));s.calls.length=0;
 assert.deepEqual(await s.api.enable(),{status:'enabled'});assert.equal(s.calls[0],'permission');assert.equal(s.calls.filter(x=>x?.subscribe).length,1);
 assert.deepEqual(await s.api.status(),{status:'enabled'});await s.api.test();assert.ok(s.calls.some(x=>x.action==='test'));
 assert.deepEqual(await s.api.disable(),{status:'disabled'});assert.equal(s.removed,1);
});
test('failed server subscription removes browser subscription; local unsubscribe still works offline',async()=>{
 const failed=setup({failSave:true});await assert.rejects(()=>failed.api.enable(),/save failed/);assert.equal(failed.removed,1);
 const offline=setup({failRemove:true});await offline.api.enable();assert.deepEqual(await offline.api.disable(),{status:'disabled'});assert.equal(offline.removed,1);
});
test('blocked and unsupported browsers do not request permission automatically',async()=>{
 const s=setup({permission:'denied'});assert.deepEqual(await s.api.status(),{status:'blocked'});assert.equal(s.calls.length,0);
 const no=createAdminNotifications({window:{},navigator:{},getClient:()=>{throw Error('must not run')}});assert.deepEqual(await no.status(),{status:'unsupported'});
});
test('logout removes the local device subscription without requiring a network session',async()=>{const s=setup();await s.api.enable();s.calls.length=0;await s.api.localUnsubscribe();assert.equal(s.removed,1);assert.equal(s.calls.length,0)});
function worker(clients=[]){const handlers={},shown=[],opened=[];vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),{URL,self:{addEventListener:(n,f)=>handlers[n]=f,registration:{scope:'https://harmony.sysmacom.com.br/',showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>clients,openWindow:async url=>opened.push(url)}}});return{handlers,shown,opened}}
test('background push contains no account data, ignores injected destinations, and opens admin safely',async()=>{
 const w=worker();let task;w.handlers.push({data:{json:()=>({type:'harmony-new-account',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',url:'https://evil.test/',email:'never-display@example.test'})},waitUntil:p=>task=p});await task;
 assert.equal(w.shown[0].title,'Sysmacom Harmony');assert.equal(w.shown[0].options.body,'Novo cadastro aguardando aprovação.');assert.equal(w.shown[0].options.data.url,'https://harmony.sysmacom.com.br/app.html#admin');assert.doesNotMatch(JSON.stringify(w.shown),/never-display|evil/);
 w.handlers.notificationclick({notification:{close(){}},waitUntil:p=>task=p});await task;assert.deepEqual(w.opened,['https://harmony.sysmacom.com.br/app.html#admin']);
 const messages=[],client={url:'https://harmony.sysmacom.com.br/app.html#studio/current',postMessage:m=>messages.push(m),focus:async()=>{}};
 const existing=worker([client]);existing.handlers.notificationclick({notification:{close(){}},waitUntil:p=>task=p});await task;assert.equal(messages[0].type,'HARMONY_OPEN_ADMIN');assert.equal(existing.opened.length,0);
});
