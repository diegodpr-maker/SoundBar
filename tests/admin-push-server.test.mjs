import {test} from 'node:test';import assert from 'node:assert/strict';
import {validPushEndpoint,constantEqual,createDispatcher,pushHandler} from '../supabase/functions/admin-push/core.js';
test('sender accepts only browser push services and rejects SSRF/credentials/redirect destinations',()=>{
 for(const url of ['https://fcm.googleapis.com/fcm/send/id','https://web.push.apple.com/id','https://updates.push.services.mozilla.com/wpush/v2/id'])assert.ok(validPushEndpoint(url));
 for(const url of ['http://fcm.googleapis.com/id','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://fcm.googleapis.com/x#frag'])assert.equal(validPushEndpoint(url),false,url);
 assert.ok(constantEqual('secret','secret'));assert.equal(constantEqual('secret','secrex'),false);assert.equal(constantEqual(null,'x'),false);
});
test('worker records deliveries, removes expired subscriptions, retries failures and never follows redirects',async()=>{
 const calls=[],sent=[];const keys={publicKey:'public',privateKey:'private',dispatchSecret:'secret'};
 const rpc=async(action,data)=>{calls.push({action,data});return{data:action==='claim'?[{id:'event',lease:'lease',kind:'signup',subscriptions:[{id:'ok',endpoint:'https://fcm.googleapis.com/ok'},{id:'gone',endpoint:'https://fcm.googleapis.com/gone'},{id:'offline',endpoint:'https://fcm.googleapis.com/offline'},{id:'bad',endpoint:'https://127.0.0.1/x'}]}]:keys}};
 const worker=createDispatcher({rpc,generateKeys:()=>keys,requestDetails:(sub,payload,options)=>{assert.deepEqual(JSON.parse(payload),{type:'harmony-new-account',id:'event'});assert.equal(options.vapidDetails.privateKey,'private');return{headers:{},body:'encrypted'}},fetch:async(url,options)=>{sent.push(url);assert.equal(options.redirect,'error');if(url.endsWith('offline'))throw Error('offline');return new Response('',{status:url.endsWith('gone')?410:201})}});
 assert.deepEqual(await worker.dispatch(keys),{processed:1,accepted:1});assert.equal(sent.length,3);
 assert.deepEqual(calls.filter(c=>c.action==='record').map(c=>[c.data.subscription,c.data.status]).sort(),[['bad',410],['gone',410],['offline',0],['ok',201]]);assert.ok(calls.some(c=>c.action==='finish'));
});
test('dispatcher requires its server credential and never returns private configuration',async()=>{
 let ran=0;const keys={publicKey:'public',dispatchSecret:'secret',privateKey:'private'};
 const handler=pushHandler({readConfig:async()=>keys,initialize:async()=>keys,dispatch:async()=>{ran++;return{processed:0,accepted:0}}});
 assert.equal((await handler(new Request('https://test/',{method:'POST',headers:{authorization:'Bearer wrong'}}))).status,401);
 assert.equal((await handler(new Request('https://test/',{method:'POST',headers:{authorization:'Bearer secret',origin:'https://evil.test'}}))).status,403);
 const response=await handler(new Request('https://test/',{method:'POST',headers:{authorization:'Bearer secret'}}));assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/secret|private|publicKey/);assert.equal(ran,1);
});
